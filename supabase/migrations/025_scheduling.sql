-- Migration 025: Agent Scheduling + SharePoint Sync

-- Agent scheduling: next_scheduled_run_at column
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS next_scheduled_run_at timestamptz;

-- triggered_by on agent_runs
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS triggered_by text DEFAULT 'user'
    CHECK (triggered_by IN ('user','schedule','api'));

-- Scheduled run logs
CREATE TABLE IF NOT EXISTS scheduled_run_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id       uuid REFERENCES agent_runs(id),
  scheduled_at timestamptz NOT NULL,
  triggered_at timestamptz,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','triggered','failed','skipped')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_run_logs_agent ON scheduled_run_logs(agent_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_next_scheduled ON agents(next_scheduled_run_at) WHERE schedule_enabled = true;

-- SharePoint connections
CREATE TABLE IF NOT EXISTS sharepoint_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  tenant_id               text NOT NULL,
  site_url                text,
  drive_id                text,
  folder_path             text NOT NULL DEFAULT '/NavHub',
  access_token_encrypted  text,
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  is_active               boolean NOT NULL DEFAULT true,
  last_synced_at          timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_sharepoint_sync (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  group_id             uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sharepoint_item_id   text,
  sharepoint_file_path text,
  last_synced_at       timestamptz,
  sync_status          text NOT NULL DEFAULT 'pending'
                       CHECK (sync_status IN ('pending','synced','failed')),
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Add UNIQUE constraint on document_sharepoint_sync.document_id for upsert support
ALTER TABLE document_sharepoint_sync
  DROP CONSTRAINT IF EXISTS document_sharepoint_sync_document_id_key;
ALTER TABLE document_sharepoint_sync
  ADD CONSTRAINT document_sharepoint_sync_document_id_key UNIQUE (document_id);

-- RLS for new tables
ALTER TABLE scheduled_run_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharepoint_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sharepoint_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view scheduled logs" ON scheduled_run_logs
  FOR SELECT USING (
    agent_id IN (
      SELECT a.id FROM agents a
      WHERE a.group_id = ANY(get_user_group_ids())
    )
  );

CREATE POLICY "Group admins manage sharepoint connections" ON sharepoint_connections
  FOR ALL USING (is_group_admin(group_id));

CREATE POLICY "Group members can view sharepoint sync" ON document_sharepoint_sync
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins manage sharepoint sync" ON document_sharepoint_sync
  FOR ALL USING (is_group_admin(group_id));
