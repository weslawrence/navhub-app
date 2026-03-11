-- Migration 011: Add slug to groups
-- Slug is auto-generated from group name on creation.
-- Used for future URL-based routing (e.g. app.navhub.co/[slug]/dashboard).

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_groups_slug ON groups (slug) WHERE slug IS NOT NULL;
