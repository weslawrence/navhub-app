-- 049_assistant_persona.sql
--   1. Free-text persona-instructions field for the Assistant config.
--   2. Optional report_id column on agent_knowledge_documents so agents can
--      link to a custom_report (HTML stored in Storage) the same way they
--      already link to a document.

ALTER TABLE assistant_config
  ADD COLUMN IF NOT EXISTS persona_instructions text;

ALTER TABLE agent_knowledge_documents
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES custom_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_documents_report
  ON agent_knowledge_documents(report_id) WHERE report_id IS NOT NULL;
