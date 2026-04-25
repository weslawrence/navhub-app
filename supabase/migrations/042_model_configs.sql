-- 042_model_configs.sql — Group-level model configs, universal knowledge, run-linked documents

-- ─── Group-level model configurations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_model_configs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  label             text        NOT NULL,
  provider          text        NOT NULL,
  model_name        text        NOT NULL,
  api_key_encrypted text        NOT NULL,
  is_default        boolean     NOT NULL DEFAULT false,
  is_active         boolean     NOT NULL DEFAULT true,
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, label)
);

CREATE INDEX IF NOT EXISTS idx_group_model_configs ON group_model_configs(group_id);

-- Only one default per group (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_model_configs_default
  ON group_model_configs(group_id)
  WHERE is_default = true;

-- ─── Universal agent knowledge per group ────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_agent_knowledge (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid        NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
  knowledge_text  text,
  knowledge_links jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_agent_knowledge_documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  document_id uuid        REFERENCES documents(id) ON DELETE SET NULL,
  file_path   text,
  file_name   text        NOT NULL,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_agent_knowledge_documents
  ON group_agent_knowledge_documents(group_id);

-- ─── Agents reference a model config ────────────────────────────────────────
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS model_config_id uuid REFERENCES group_model_configs(id) ON DELETE SET NULL;

-- ─── Linked documents for a single run ──────────────────────────────────────
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS linked_document_ids uuid[] NOT NULL DEFAULT '{}';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE group_model_configs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_agent_knowledge            ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_agent_knowledge_documents  ENABLE ROW LEVEL SECURITY;

-- Group members can read; admins can manage
DROP POLICY IF EXISTS "model_configs_read"   ON group_model_configs;
CREATE POLICY "model_configs_read" ON group_model_configs
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));

DROP POLICY IF EXISTS "model_configs_admin"  ON group_model_configs;
CREATE POLICY "model_configs_admin" ON group_model_configs
  FOR ALL USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

DROP POLICY IF EXISTS "knowledge_read"       ON group_agent_knowledge;
CREATE POLICY "knowledge_read" ON group_agent_knowledge
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));

DROP POLICY IF EXISTS "knowledge_admin"      ON group_agent_knowledge;
CREATE POLICY "knowledge_admin" ON group_agent_knowledge
  FOR ALL USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

DROP POLICY IF EXISTS "knowledge_docs_read"  ON group_agent_knowledge_documents;
CREATE POLICY "knowledge_docs_read" ON group_agent_knowledge_documents
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));

DROP POLICY IF EXISTS "knowledge_docs_admin" ON group_agent_knowledge_documents;
CREATE POLICY "knowledge_docs_admin" ON group_agent_knowledge_documents
  FOR ALL USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));
