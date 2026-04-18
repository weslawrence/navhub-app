-- Migration 041: Group-level timezone + location
-- ─────────────────────────────────────────────────

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Australia/Brisbane',
  ADD COLUMN IF NOT EXISTS location text;
