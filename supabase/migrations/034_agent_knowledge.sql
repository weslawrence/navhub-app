-- ── 034_agent_knowledge.sql ──────────────────────────────────────────────────
-- Ensure knowledge columns and table exist (idempotent safety net).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS knowledge_text  text,
  ADD COLUMN IF NOT EXISTS knowledge_links jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  file_path   text,
  file_name   text NOT NULL,
  file_type   text,
  file_size   bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_docs
  ON agent_knowledge_documents(agent_id);
