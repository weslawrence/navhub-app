-- ─── Migration 006 — Group Management + Custom Reports Library ───────────────

-- ── Group invites ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_invites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid        NOT NULL REFERENCES groups ON DELETE CASCADE,
  email        text        NOT NULL,
  role         text        NOT NULL DEFAULT 'company_viewer',
  invited_by   uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  accepted_at  timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (group_id, email)
);

ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;

-- Group admins can fully manage invites for their groups
CREATE POLICY "Group admins can manage invites"
  ON group_invites FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
    )
  );

-- Users can read invites addressed to their own email
CREATE POLICY "Users can read their own invites"
  ON group_invites FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- ── Custom reports library ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid        NOT NULL REFERENCES groups ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  file_path    text        NOT NULL,
    -- path in Supabase Storage: {group_id}/reports/{timestamp}_{filename}
  file_type    text        NOT NULL DEFAULT 'html',
    -- 'html' for now; extensible
  uploaded_by  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;

-- Any group member can view active reports
CREATE POLICY "Group members can view reports"
  ON custom_reports FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
    )
  );

-- Only admins can create / update / delete reports
CREATE POLICY "Group admins can manage reports"
  ON custom_reports FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
    )
  );

-- ── Storage bucket notes ──────────────────────────────────────────────────────
-- The report-files bucket must be created MANUALLY in the Supabase dashboard.
-- Name:    report-files
-- Public:  No (private)
--
-- After bucket creation, add these RLS policies to storage.objects:
--
-- Policy 1 — SELECT for any group member:
--   USING (
--     (storage.foldername(name))[1] IN (
--       SELECT group_id::text FROM user_groups WHERE user_id = auth.uid()
--     )
--   )
--
-- Policy 2 — SELECT, INSERT, DELETE for group admins:
--   USING (
--     (storage.foldername(name))[1] IN (
--       SELECT group_id::text FROM user_groups
--       WHERE user_id = auth.uid()
--         AND role IN ('super_admin', 'group_admin')
--     )
--   )
