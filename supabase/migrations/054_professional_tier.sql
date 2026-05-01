-- 054_professional_tier.sql — Adds the professional tier + per-group cap.
--
-- max_task_complexity: highest tier users in a group can pick on the run
-- launcher. Defaults to 'massive' so existing groups behave exactly as
-- before. Group admins (settings → Display) can raise it to 'professional'
-- which unlocks pre-loaded document context and effectively-unlimited
-- iterations.
--
-- preload_context: per-run flag set when the launcher requests a tier
-- whose policy includes pre-loading (currently only 'professional').
-- We persist it on the run row so the runner doesn't have to re-derive
-- the policy from the tier name.

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS max_task_complexity text NOT NULL DEFAULT 'massive'
    CHECK (max_task_complexity IN ('standard','medium','large','massive','professional'));

ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_task_complexity_check;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_task_complexity_check
    CHECK (task_complexity IN ('standard','medium','large','massive','professional'));

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS preload_context boolean NOT NULL DEFAULT false;
