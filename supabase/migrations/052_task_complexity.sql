-- 052_task_complexity.sql — Replace boolean complex_task with four-tier task_complexity.
--
-- Tiers:
--   standard ─ default
--   medium   ─ bigger jobs, conserve where possible
--   large    ─ heavy lifting
--   massive  ─ open the throttle

ALTER TABLE agent_runs
  DROP COLUMN IF EXISTS complex_task;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS task_complexity text NOT NULL DEFAULT 'standard'
  CHECK (task_complexity IN ('standard', 'medium', 'large', 'massive'));
