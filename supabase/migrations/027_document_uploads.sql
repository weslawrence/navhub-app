-- Migration 027: Document file uploads + agent run attachments

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS file_path      text,
  ADD COLUMN IF NOT EXISTS file_name      text,
  ADD COLUMN IF NOT EXISTS file_size      bigint,
  ADD COLUMN IF NOT EXISTS file_type      text,
  ADD COLUMN IF NOT EXISTS upload_source  text DEFAULT 'created'
    CHECK (upload_source IN ('created','uploaded','agent'));

CREATE TABLE IF NOT EXISTS agent_run_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  file_path     text NOT NULL,
  file_name     text NOT NULL,
  file_type     text NOT NULL,
  file_size     bigint,
  content_text  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
