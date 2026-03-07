-- Migration 004 — Group palette system
-- Adds palette_id to groups table.
-- palette_id references one of the named palettes defined in lib/themes.ts.
-- Default is 'ocean' (sky-500 blue — the original NavHub brand colour).

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS palette_id text NOT NULL DEFAULT 'ocean';
