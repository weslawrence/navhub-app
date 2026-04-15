-- ── 033_report_folders.sql ───────────────────────────────────────────────────
-- Report folder structure mirroring document folders.

CREATE TABLE IF NOT EXISTS report_folders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name         text NOT NULL,
  is_system    boolean NOT NULL DEFAULT false,
  folder_type  text NOT NULL DEFAULT 'general'
               CHECK (folder_type IN ('general','templates')),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_folders_group ON report_folders(group_id);

ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES report_folders(id) ON DELETE SET NULL;

-- Auto-create Templates folder for existing groups
INSERT INTO report_folders (group_id, name, is_system, folder_type)
SELECT id, 'Templates', true, 'templates'
FROM groups
WHERE id NOT IN (
  SELECT group_id FROM report_folders WHERE folder_type = 'templates'
);
