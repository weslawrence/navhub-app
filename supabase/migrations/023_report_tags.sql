-- Migration 023: Add tags column to custom_reports
-- Tags are an array of lowercase strings, indexed with GIN for efficient array queries.

ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_custom_reports_tags
  ON custom_reports USING gin(tags);
