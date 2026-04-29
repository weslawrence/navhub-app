-- 050_run_continuation.sql — Link follow-up runs back to their parent.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_parent
  ON agent_runs(parent_run_id) WHERE parent_run_id IS NOT NULL;
