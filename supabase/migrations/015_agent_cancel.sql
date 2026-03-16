-- ── Migration 015: Agent cancellation support ────────────────────────────────
-- Adds cancellation_requested + cancelled_at columns to agent_runs.
-- agents.is_active already exists from 007_agents.sql.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS cancellation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz;
