-- ── 032_publish_status.sql ───────────────────────────────────────────────────
-- Published/draft status for reports, tags for documents, agent created_by fix.

-- ── 1. Reports: add status column ───────────────────────────────────────────
ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published'));

-- Migrate existing is_draft values
UPDATE custom_reports SET status = 'published' WHERE is_draft = false;
UPDATE custom_reports SET status = 'draft' WHERE is_draft = true;

-- ── 2. Documents: ensure tags column exists ─────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- ── 3. Agents: set created_by on legacy agents with null ────────────────────
UPDATE agents
SET created_by = (
  SELECT user_id FROM user_groups
  WHERE group_id = agents.group_id
    AND role IN ('super_admin','group_admin')
  ORDER BY user_id
  LIMIT 1
)
WHERE created_by IS NULL;
