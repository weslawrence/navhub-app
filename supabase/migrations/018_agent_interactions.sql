-- Migration 018: Agent interactive responses (ask_user tool)
-- Adds interaction table for pause/resume runs + awaiting_input columns on agent_runs

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS awaiting_input_question text,
  ADD COLUMN IF NOT EXISTS awaiting_input_at        timestamptz;

CREATE TABLE IF NOT EXISTS agent_run_interactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid        NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  question    text        NOT NULL,
  answer      text,
  answered_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_interactions_run
  ON agent_run_interactions (run_id);

-- RLS: group members can view interactions for runs in their group
ALTER TABLE agent_run_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_can_select_interactions"
  ON agent_run_interactions FOR SELECT
  USING (
    run_id IN (
      SELECT id FROM agent_runs
      WHERE group_id = ANY(get_user_group_ids())
    )
  );

CREATE POLICY "group_members_can_insert_interactions"
  ON agent_run_interactions FOR INSERT
  WITH CHECK (
    run_id IN (
      SELECT id FROM agent_runs
      WHERE group_id = ANY(get_user_group_ids())
    )
  );

CREATE POLICY "group_members_can_update_interactions"
  ON agent_run_interactions FOR UPDATE
  USING (
    run_id IN (
      SELECT id FROM agent_runs
      WHERE group_id = ANY(get_user_group_ids())
    )
  );
