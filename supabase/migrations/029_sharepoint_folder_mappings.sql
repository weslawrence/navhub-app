CREATE TABLE IF NOT EXISTS folder_sharepoint_mappings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id        uuid REFERENCES document_folders(id) ON DELETE CASCADE,
  group_id         uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sharepoint_path  text NOT NULL DEFAULT '/NavHub',
  auto_sync        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(folder_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_sp_mappings ON folder_sharepoint_mappings(group_id, folder_id);
