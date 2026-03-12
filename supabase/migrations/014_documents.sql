-- ============================================================
-- Migration 014: Document Intelligence
-- ============================================================

-- Folders
CREATE TABLE IF NOT EXISTS document_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_folders_group ON document_folders(group_id);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  company_id              uuid REFERENCES companies(id) ON DELETE SET NULL,
  folder_id               uuid REFERENCES document_folders(id) ON DELETE SET NULL,
  title                   text NOT NULL,
  document_type           text NOT NULL,
  audience                text NOT NULL DEFAULT 'internal',
  content_markdown        text NOT NULL DEFAULT '',
  status                  text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','published')),
  share_token             text,
  is_shareable            boolean NOT NULL DEFAULT false,
  share_token_created_at  timestamptz,
  locked_by               uuid REFERENCES auth.users(id),
  locked_at               timestamptz,
  agent_run_id            uuid,
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_share_token
  ON documents(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_group   ON documents(group_id);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder  ON documents(folder_id);

-- Versions
CREATE TABLE IF NOT EXISTS document_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content_markdown    text NOT NULL,
  version             integer NOT NULL,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);

-- Sync connections (stub — provider integrations Phase 7c)
CREATE TABLE IF NOT EXISTS document_sync_connections (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                  uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  provider                  text NOT NULL CHECK (provider IN ('sharepoint','google_drive','dropbox')),
  access_token_encrypted    text,
  refresh_token_encrypted   text,
  tenant_id                 text,
  site_url                  text,
  folder_path               text,
  auto_sync                 boolean NOT NULL DEFAULT false,
  last_synced_at            timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- Sync log
CREATE TABLE IF NOT EXISTS document_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  status        text NOT NULL CHECK (status IN ('success','failed','pending')),
  error_message text,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE document_folders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sync_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sync_log       ENABLE ROW LEVEL SECURITY;

-- document_folders: group members can SELECT; admins can ALL
CREATE POLICY "document_folders_select" ON document_folders
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));
CREATE POLICY "document_folders_insert" ON document_folders
  FOR INSERT WITH CHECK (is_group_admin(group_id));
CREATE POLICY "document_folders_delete" ON document_folders
  FOR DELETE USING (is_group_admin(group_id));

-- documents: group members can SELECT/INSERT; admins can ALL
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (group_id = ANY(get_user_group_ids()));
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (group_id = ANY(get_user_group_ids()));
CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (is_group_admin(group_id));

-- document_versions: same as documents
CREATE POLICY "document_versions_select" ON document_versions
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM documents WHERE group_id = ANY(get_user_group_ids())
    )
  );
CREATE POLICY "document_versions_insert" ON document_versions
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT id FROM documents WHERE group_id = ANY(get_user_group_ids())
    )
  );

-- sync tables: admin only
CREATE POLICY "doc_sync_conn_all" ON document_sync_connections
  FOR ALL USING (is_group_admin(group_id));
CREATE POLICY "doc_sync_log_select" ON document_sync_log
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM documents WHERE group_id = ANY(get_user_group_ids())
    )
  );
