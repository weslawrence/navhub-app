-- ── 036_agent_model.sql ──────────────────────────────────────────────────────

-- Model config per agent
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS model_provider  text DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS model_name      text DEFAULT 'claude-haiku-4-5-20251001',
  ADD COLUMN IF NOT EXISTS model_api_key   text;

-- Company access matrix per agent
CREATE TABLE IF NOT EXISTS agent_company_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access     text NOT NULL DEFAULT 'read' CHECK (access IN ('read','write','none')),
  UNIQUE(agent_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_company_access ON agent_company_access(agent_id);

-- Output type on runs
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS output_type text CHECK (output_type IN ('document','report'));
