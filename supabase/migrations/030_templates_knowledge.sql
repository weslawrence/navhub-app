-- Migration 030: Templates folder + Agent knowledge base
-- ────────────────────────────────────────────────────────

-- 1. Templates folder support on document_folders
ALTER TABLE document_folders
  ADD COLUMN IF NOT EXISTS is_system   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folder_type text    DEFAULT 'general'
    CHECK (folder_type IN ('general', 'templates'));

-- Create templates folder for existing groups that don't have one
INSERT INTO document_folders (group_id, name, is_system, folder_type)
SELECT id, 'Templates', true, 'templates'
FROM groups
WHERE id NOT IN (
  SELECT group_id FROM document_folders WHERE folder_type = 'templates'
)
ON CONFLICT DO NOTHING;

-- 2. Tags column on documents (if not already present)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_documents_tags
  ON documents USING gin(tags);

-- 3. Agent knowledge base
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS knowledge_text  text,
  ADD COLUMN IF NOT EXISTS knowledge_links jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  document_id uuid        REFERENCES documents(id) ON DELETE SET NULL,
  file_path   text,
  file_name   text        NOT NULL,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS for agent_knowledge_documents
ALTER TABLE agent_knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view agent knowledge docs"
  ON agent_knowledge_documents
  FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE group_id = ANY(get_user_group_ids())
    )
  );

CREATE POLICY "Group admins can manage agent knowledge docs"
  ON agent_knowledge_documents
  FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM agents
      WHERE group_id IN (
        SELECT group_id FROM user_groups
        WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
      )
    )
  );
