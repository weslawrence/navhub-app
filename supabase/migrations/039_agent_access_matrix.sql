-- Migration 039: SharePoint unique + Agent feature×company access matrix
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Unique constraint on sharepoint_connections.group_id (for upsert onConflict).
--    Drop any existing equivalent constraint first to make this idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_sharepoint_connections_group'
      AND conrelid = 'sharepoint_connections'::regclass
  ) THEN
    ALTER TABLE sharepoint_connections
      ADD CONSTRAINT uq_sharepoint_connections_group UNIQUE (group_id);
  END IF;
END $$;

-- 2. Agent access matrix with feature dimension.
--    Replace the old (agent_id, company_id) table with (agent_id, feature, company_id).
DROP TABLE IF EXISTS agent_company_access;

CREATE TABLE agent_company_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id)     ON DELETE CASCADE,
  feature     text NOT NULL CHECK (feature IN ('financials','reports','documents','marketing','agents')),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  access      text NOT NULL DEFAULT 'none' CHECK (access IN ('none','read','write')),
  UNIQUE(agent_id, feature, company_id)
);

-- null company_id = default for all companies for that feature

CREATE INDEX IF NOT EXISTS idx_agent_company_access
  ON agent_company_access(agent_id, feature);

-- RLS — group members can read, admins can write (access via agent's group)
ALTER TABLE agent_company_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view agent access"
  ON agent_company_access FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE group_id = ANY(get_user_group_ids())
    )
  );

CREATE POLICY "Group admins can manage agent access"
  ON agent_company_access FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM agents
      WHERE group_id IN (
        SELECT group_id FROM user_groups
        WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
      )
    )
  );
