-- ── 035_agent_improvements.sql ───────────────────────────────────────────────

-- Agent avatar
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS avatar_url    text,
  ADD COLUMN IF NOT EXISTS avatar_preset text;

-- Run name
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS run_name text;

-- Run continuation messages
CREATE TABLE IF NOT EXISTS agent_run_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_messages ON agent_run_messages(run_id, created_at);

-- Output controls on runs
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS output_folder_id    uuid,
  ADD COLUMN IF NOT EXISTS output_status       text DEFAULT 'draft'
    CHECK (output_status IN ('draft','published')),
  ADD COLUMN IF NOT EXISTS output_name_override text;
