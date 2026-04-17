-- Migration 037: Integrations page — Imports folder + financial_imports table
-- ────────────────────────────────────────────────────────────────────────────

-- Allow 'imports' folder_type
ALTER TABLE document_folders
  DROP CONSTRAINT IF EXISTS document_folders_folder_type_check;
ALTER TABLE document_folders
  ADD CONSTRAINT document_folders_folder_type_check
  CHECK (folder_type IN ('general','templates','imports'));

-- Create Imports system folder for existing groups that don't have one
INSERT INTO document_folders (group_id, name, is_system, folder_type)
SELECT id, 'Imports', true, 'imports'
FROM groups
WHERE id NOT IN (
  SELECT group_id FROM document_folders WHERE folder_type = 'imports'
)
ON CONFLICT DO NOTHING;

-- Track uploaded financial data files
CREATE TABLE IF NOT EXISTS financial_imports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  company_id    uuid        REFERENCES companies(id) ON DELETE SET NULL,
  document_id   uuid        REFERENCES documents(id) ON DELETE SET NULL,
  file_name     text        NOT NULL,
  file_path     text        NOT NULL,
  data_type     text        NOT NULL CHECK (data_type IN ('pl','balance_sheet','cash_flow','custom')),
  period        text,
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','imported','review_needed','failed')),
  error_message text,
  imported_by   uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_imports_group
  ON financial_imports(group_id, created_at DESC);

-- RLS
ALTER TABLE financial_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view financial imports"
  ON financial_imports FOR SELECT
  USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group members can insert financial imports"
  ON financial_imports FOR INSERT
  WITH CHECK (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins can manage financial imports"
  ON financial_imports FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
    )
  );
