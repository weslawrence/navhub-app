-- NavHub Initial Schema
-- Run this in Supabase SQL editor or via supabase db push

-- ============================================================
-- ENUMS
-- PostgreSQL does not support CREATE TYPE IF NOT EXISTS, so each
-- type is wrapped in a DO block that swallows duplicate_object errors,
-- making the migration safe to re-run.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM (
    'super_admin',
    'group_admin',
    'company_viewer',
    'division_viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_type_enum AS ENUM (
    'profit_loss',
    'balance_sheet',
    'cashflow'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE data_source_enum AS ENUM (
    'xero',
    'excel'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE upload_status_enum AS ENUM (
    'processing',
    'complete',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sync_status_enum AS ENUM (
    'success',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- groups: top-level tenant
CREATE TABLE IF NOT EXISTS groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#0ea5e9',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_groups: membership + role per group
CREATE TABLE IF NOT EXISTS user_groups (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role       user_role_enum NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, group_id)
);

-- companies: legal entity or brand within a group
CREATE TABLE IF NOT EXISTS companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, slug)
);

-- divisions: optional department/BU within a company
CREATE TABLE IF NOT EXISTS divisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

-- user_divisions: restricts division_viewer access to specific divisions
CREATE TABLE IF NOT EXISTS user_divisions (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, division_id)
);

-- xero_connections: OAuth token store, one per company OR division
CREATE TABLE IF NOT EXISTS xero_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  division_id     UUID REFERENCES divisions(id) ON DELETE CASCADE,
  xero_tenant_id  TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_expiry    TIMESTAMPTZ NOT NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_xero_entity CHECK (
    (company_id IS NOT NULL AND division_id IS NULL)
    OR (company_id IS NULL AND division_id IS NOT NULL)
  )
);

-- financial_snapshots: normalised JSONB financial data
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
  period      TEXT NOT NULL,  -- YYYY-MM
  report_type report_type_enum NOT NULL,
  source      data_source_enum NOT NULL,
  data        JSONB NOT NULL,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_snapshot_entity CHECK (
    (company_id IS NOT NULL AND division_id IS NULL)
    OR (company_id IS NULL AND division_id IS NOT NULL)
  ),
  UNIQUE NULLS NOT DISTINCT (company_id, division_id, period, report_type, source)
);

-- excel_uploads: file upload tracking
CREATE TABLE IF NOT EXISTS excel_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  division_id   UUID REFERENCES divisions(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        upload_status_enum NOT NULL DEFAULT 'processing',
  error_message TEXT,
  CONSTRAINT chk_upload_entity CHECK (
    (company_id IS NOT NULL AND division_id IS NULL)
    OR (company_id IS NULL AND division_id IS NOT NULL)
  )
);

-- sync_logs: audit log for all data sync operations
CREATE TABLE IF NOT EXISTS sync_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
  source      data_source_enum NOT NULL,
  status      sync_status_enum NOT NULL,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ADD COLUMN IF NOT EXISTS (safe re-run pattern)
-- ============================================================

ALTER TABLE groups ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#0ea5e9';
ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE excel_uploads ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ============================================================
-- RLS HELPER FUNCTION
-- ============================================================

-- Returns array of group IDs the current user belongs to
CREATE OR REPLACE FUNCTION get_user_group_ids()
RETURNS uuid[] AS $$
  SELECT COALESCE(array_agg(group_id), '{}')
  FROM user_groups
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true if current user has admin role in a specific group
CREATE OR REPLACE FUNCTION is_group_admin(gid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid()
      AND group_id = gid
      AND role IN ('super_admin', 'group_admin')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true if current user can access a division
-- (non-division_viewer OR explicitly listed in user_divisions)
CREATE OR REPLACE FUNCTION can_access_division(div_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_groups ug
    JOIN companies c ON c.group_id = ug.group_id
    JOIN divisions d ON d.company_id = c.id
    WHERE ug.user_id = auth.uid()
      AND d.id = div_id
      AND ug.role != 'division_viewer'
  )
  OR EXISTS (
    SELECT 1 FROM user_divisions
    WHERE user_id = auth.uid()
      AND division_id = div_id
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_divisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_uploads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — groups
-- ============================================================

DROP POLICY IF EXISTS "groups: members can view" ON groups;
CREATE POLICY "groups: members can view" ON groups
  FOR SELECT USING (id = ANY(get_user_group_ids()));

DROP POLICY IF EXISTS "groups: admins can update" ON groups;
CREATE POLICY "groups: admins can update" ON groups
  FOR UPDATE USING (is_group_admin(id));

-- ============================================================
-- RLS POLICIES — user_groups
-- ============================================================

DROP POLICY IF EXISTS "user_groups: own rows" ON user_groups;
CREATE POLICY "user_groups: own rows" ON user_groups
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_groups: admins manage" ON user_groups;
CREATE POLICY "user_groups: admins manage" ON user_groups
  FOR ALL USING (is_group_admin(group_id));

-- ============================================================
-- RLS POLICIES — companies
-- ============================================================

DROP POLICY IF EXISTS "companies: group members can view" ON companies;
CREATE POLICY "companies: group members can view" ON companies
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));

DROP POLICY IF EXISTS "companies: admins can manage" ON companies;
CREATE POLICY "companies: admins can manage" ON companies
  FOR ALL USING (is_group_admin(group_id));

-- ============================================================
-- RLS POLICIES — divisions
-- ============================================================

DROP POLICY IF EXISTS "divisions: accessible members can view" ON divisions;
CREATE POLICY "divisions: accessible members can view" ON divisions
  FOR SELECT USING (can_access_division(id));

DROP POLICY IF EXISTS "divisions: admins can manage" ON divisions;
CREATE POLICY "divisions: admins can manage" ON divisions
  FOR ALL USING (
    is_group_admin(
      (SELECT group_id FROM companies WHERE id = company_id)
    )
  );

-- ============================================================
-- RLS POLICIES — user_divisions
-- ============================================================

DROP POLICY IF EXISTS "user_divisions: own rows" ON user_divisions;
CREATE POLICY "user_divisions: own rows" ON user_divisions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_divisions: admins manage" ON user_divisions;
CREATE POLICY "user_divisions: admins manage" ON user_divisions
  FOR ALL USING (
    is_group_admin(
      (SELECT g.id FROM groups g
       JOIN companies c ON c.group_id = g.id
       JOIN divisions d ON d.company_id = c.id
       WHERE d.id = division_id)
    )
  );

-- ============================================================
-- RLS POLICIES — xero_connections
-- ============================================================

DROP POLICY IF EXISTS "xero_connections: group members can view" ON xero_connections;
CREATE POLICY "xero_connections: group members can view" ON xero_connections
  FOR SELECT USING (
    (company_id IS NOT NULL AND company_id IN (
      SELECT id FROM companies WHERE group_id = ANY(get_user_group_ids())
    ))
    OR
    (division_id IS NOT NULL AND can_access_division(division_id))
  );

DROP POLICY IF EXISTS "xero_connections: admins can manage" ON xero_connections;
CREATE POLICY "xero_connections: admins can manage" ON xero_connections
  FOR ALL USING (
    (company_id IS NOT NULL AND is_group_admin(
      (SELECT group_id FROM companies WHERE id = company_id)
    ))
    OR
    (division_id IS NOT NULL AND is_group_admin(
      (SELECT g.id FROM groups g
       JOIN companies c ON c.group_id = g.id
       JOIN divisions d ON d.company_id = c.id
       WHERE d.id = division_id)
    ))
  );

-- ============================================================
-- RLS POLICIES — financial_snapshots
-- ============================================================

DROP POLICY IF EXISTS "financial_snapshots: group members can view" ON financial_snapshots;
CREATE POLICY "financial_snapshots: group members can view" ON financial_snapshots
  FOR SELECT USING (
    (company_id IS NOT NULL AND company_id IN (
      SELECT id FROM companies WHERE group_id = ANY(get_user_group_ids())
    ))
    OR
    (division_id IS NOT NULL AND can_access_division(division_id))
  );

DROP POLICY IF EXISTS "financial_snapshots: admins can manage" ON financial_snapshots;
CREATE POLICY "financial_snapshots: admins can manage" ON financial_snapshots
  FOR ALL USING (
    (company_id IS NOT NULL AND is_group_admin(
      (SELECT group_id FROM companies WHERE id = company_id)
    ))
    OR
    (division_id IS NOT NULL AND is_group_admin(
      (SELECT g.id FROM groups g
       JOIN companies c ON c.group_id = g.id
       JOIN divisions d ON d.company_id = c.id
       WHERE d.id = division_id)
    ))
  );

-- ============================================================
-- RLS POLICIES — excel_uploads
-- ============================================================

DROP POLICY IF EXISTS "excel_uploads: group members can view" ON excel_uploads;
CREATE POLICY "excel_uploads: group members can view" ON excel_uploads
  FOR SELECT USING (
    (company_id IS NOT NULL AND company_id IN (
      SELECT id FROM companies WHERE group_id = ANY(get_user_group_ids())
    ))
    OR
    (division_id IS NOT NULL AND can_access_division(division_id))
  );

DROP POLICY IF EXISTS "excel_uploads: admins can manage" ON excel_uploads;
CREATE POLICY "excel_uploads: admins can manage" ON excel_uploads
  FOR ALL USING (
    (company_id IS NOT NULL AND is_group_admin(
      (SELECT group_id FROM companies WHERE id = company_id)
    ))
    OR
    (division_id IS NOT NULL AND is_group_admin(
      (SELECT g.id FROM groups g
       JOIN companies c ON c.group_id = g.id
       JOIN divisions d ON d.company_id = c.id
       WHERE d.id = division_id)
    ))
  );

-- ============================================================
-- RLS POLICIES — sync_logs
-- ============================================================

DROP POLICY IF EXISTS "sync_logs: group members can view" ON sync_logs;
CREATE POLICY "sync_logs: group members can view" ON sync_logs
  FOR SELECT USING (
    (company_id IS NOT NULL AND company_id IN (
      SELECT id FROM companies WHERE group_id = ANY(get_user_group_ids())
    ))
    OR
    (division_id IS NOT NULL AND can_access_division(division_id))
  );

DROP POLICY IF EXISTS "sync_logs: server can insert" ON sync_logs;
CREATE POLICY "sync_logs: server can insert" ON sync_logs
  FOR INSERT WITH CHECK (true);
-- Note: sync_logs inserts happen via service role (admin client) which bypasses RLS
-- The INSERT policy above allows all inserts; service role bypasses anyway.
-- For reads, we rely on the SELECT policy above.
