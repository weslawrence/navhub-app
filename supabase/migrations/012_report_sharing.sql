-- Migration 012: Report external sharing
-- Adds token-based public sharing to custom_reports.

ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS is_shareable          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_token           text,
  ADD COLUMN IF NOT EXISTS share_token_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_reports_share_token
  ON custom_reports (share_token) WHERE share_token IS NOT NULL;
