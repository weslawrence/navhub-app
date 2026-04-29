-- 053_background_runs.sql — Mark each run with how it executed.
--
-- Background runs continue running even if the user closes the tab; the
-- run-detail page reconnects via the SSE stream route which polls the DB.
-- Streaming runs (legacy / future opt-in) require the SSE GET to remain open.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'background'
    CHECK (execution_mode IN ('background', 'streaming'));
