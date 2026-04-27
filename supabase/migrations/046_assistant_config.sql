-- 046_assistant_config.sql — Configurable system prompt + knowledge for the floating Assistant.

CREATE TABLE IF NOT EXISTS assistant_config (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid        REFERENCES groups(id) ON DELETE CASCADE,
  -- null group_id = platform-level default (super_admin managed); per-group rows override.
  persona_name   text        NOT NULL DEFAULT 'NavHub Assistant',
  persona_tone   text        NOT NULL DEFAULT 'professional',
  scope_text     text,
  knowledge_text text,
  restrictions   text,
  is_active      boolean     NOT NULL DEFAULT true,
  updated_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Partial unique indexes — one platform row (group_id IS NULL) and one row per group.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_config_platform
  ON assistant_config((1)) WHERE group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_config_group
  ON assistant_config(group_id) WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS assistant_knowledge_documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        REFERENCES groups(id) ON DELETE CASCADE,    -- null = platform level
  document_id uuid        REFERENCES documents(id) ON DELETE SET NULL,
  file_path   text,
  file_name   text        NOT NULL,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_knowledge_documents_group
  ON assistant_knowledge_documents(group_id);

-- Seed the platform-level default row so the API can always read it.
INSERT INTO assistant_config (group_id, persona_name, scope_text)
VALUES (NULL, 'NavHub Assistant', NULL)
ON CONFLICT DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE assistant_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Group members can read their group's config + the platform default.
DROP POLICY IF EXISTS "assistant_config: read" ON assistant_config;
CREATE POLICY "assistant_config: read" ON assistant_config
  FOR SELECT USING (
    group_id IS NULL
    OR group_id = ANY(get_user_group_ids())
  );

-- Super admins manage platform row; group admins manage their own row.
DROP POLICY IF EXISTS "assistant_config: super admin platform" ON assistant_config;
CREATE POLICY "assistant_config: super admin platform" ON assistant_config
  FOR ALL USING (
    group_id IS NULL AND EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    group_id IS NULL AND EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "assistant_config: group admin" ON assistant_config;
CREATE POLICY "assistant_config: group admin" ON assistant_config
  FOR ALL USING (
    group_id IS NOT NULL AND is_group_admin(group_id)
  )
  WITH CHECK (
    group_id IS NOT NULL AND is_group_admin(group_id)
  );

-- Knowledge documents: same rules.
DROP POLICY IF EXISTS "assistant_kd: read" ON assistant_knowledge_documents;
CREATE POLICY "assistant_kd: read" ON assistant_knowledge_documents
  FOR SELECT USING (
    group_id IS NULL
    OR group_id = ANY(get_user_group_ids())
  );

DROP POLICY IF EXISTS "assistant_kd: super admin platform" ON assistant_knowledge_documents;
CREATE POLICY "assistant_kd: super admin platform" ON assistant_knowledge_documents
  FOR ALL USING (
    group_id IS NULL AND EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    group_id IS NULL AND EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "assistant_kd: group admin" ON assistant_knowledge_documents;
CREATE POLICY "assistant_kd: group admin" ON assistant_knowledge_documents
  FOR ALL USING (
    group_id IS NOT NULL AND is_group_admin(group_id)
  )
  WITH CHECK (
    group_id IS NOT NULL AND is_group_admin(group_id)
  );
