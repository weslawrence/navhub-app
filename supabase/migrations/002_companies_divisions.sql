-- Phase 2a: Add description, industry, and is_active to companies and divisions
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS throughout

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS industry    text,
  ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT true;

ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS industry    text,
  ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT true;
