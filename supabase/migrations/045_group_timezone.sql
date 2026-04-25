-- 045_group_timezone.sql — Idempotent guard for groups.timezone + groups.location.
--
-- These columns were originally added in migration 041_group_timezone.sql.
-- This migration re-asserts them via ADD COLUMN IF NOT EXISTS so the schema is
-- self-healing on environments that pre-date 041, and is a no-op on environments
-- that already have it. Safe to run repeatedly.

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Australia/Brisbane',
  ADD COLUMN IF NOT EXISTS location text;
