-- 044_rls_security.sql — Backfill RLS on tables that were missing it.

ALTER TABLE admin_audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_attachments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_requests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_sharepoint_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_folders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_signups             ENABLE ROW LEVEL SECURITY;

-- ── admin_audit_log: super admins read ──────────────────────────────────────
DROP POLICY IF EXISTS "admin_audit_log: super admins read" ON admin_audit_log;
CREATE POLICY "admin_audit_log: super admins read"
  ON admin_audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

-- ── agent_run_attachments: group members ────────────────────────────────────
DROP POLICY IF EXISTS "agent_run_attachments: group members" ON agent_run_attachments;
CREATE POLICY "agent_run_attachments: group members"
  ON agent_run_attachments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM agent_runs ar
    JOIN user_groups ug ON ug.group_id = ar.group_id
    WHERE ar.id = agent_run_attachments.run_id
      AND ug.user_id = auth.uid()
  ));

-- ── agent_run_messages: group members ───────────────────────────────────────
DROP POLICY IF EXISTS "agent_run_messages: group members" ON agent_run_messages;
CREATE POLICY "agent_run_messages: group members"
  ON agent_run_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM agent_runs ar
    JOIN user_groups ug ON ug.group_id = ar.group_id
    WHERE ar.id = agent_run_messages.run_id
      AND ug.user_id = auth.uid()
  ));

-- ── contact_submissions: service role only ──────────────────────────────────
DROP POLICY IF EXISTS "contact_submissions: service role only" ON contact_submissions;
CREATE POLICY "contact_submissions: service role only"
  ON contact_submissions FOR ALL
  USING (auth.role() = 'service_role');

-- ── demo_requests: service role only ────────────────────────────────────────
DROP POLICY IF EXISTS "demo_requests: service role only" ON demo_requests;
CREATE POLICY "demo_requests: service role only"
  ON demo_requests FOR ALL
  USING (auth.role() = 'service_role');

-- ── folder_sharepoint_mappings: members read, admins write ──────────────────
DROP POLICY IF EXISTS "folder_sharepoint_mappings: group members read"  ON folder_sharepoint_mappings;
CREATE POLICY "folder_sharepoint_mappings: group members read"
  ON folder_sharepoint_mappings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND group_id = folder_sharepoint_mappings.group_id
  ));

DROP POLICY IF EXISTS "folder_sharepoint_mappings: group admins write" ON folder_sharepoint_mappings;
CREATE POLICY "folder_sharepoint_mappings: group admins write"
  ON folder_sharepoint_mappings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid()
      AND group_id = folder_sharepoint_mappings.group_id
      AND role IN ('super_admin','group_admin')
  ));

-- ── report_folders: members read, admins write ──────────────────────────────
DROP POLICY IF EXISTS "report_folders: group members read"  ON report_folders;
CREATE POLICY "report_folders: group members read"
  ON report_folders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND group_id = report_folders.group_id
  ));

DROP POLICY IF EXISTS "report_folders: group admins write" ON report_folders;
CREATE POLICY "report_folders: group admins write"
  ON report_folders FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid()
      AND group_id = report_folders.group_id
      AND role IN ('super_admin','group_admin')
  ));

-- ── waitlist_signups: service role only ─────────────────────────────────────
DROP POLICY IF EXISTS "waitlist_signups: service role only" ON waitlist_signups;
CREATE POLICY "waitlist_signups: service role only"
  ON waitlist_signups FOR ALL
  USING (auth.role() = 'service_role');
