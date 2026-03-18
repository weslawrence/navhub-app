-- ── Migration 016: Admin Portal Enhancements + Subscription Foundation ──────────

-- Subscription tier + token tracking on groups
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'starter'
    CHECK (subscription_tier IN ('starter','pro','enterprise')),
  ADD COLUMN IF NOT EXISTS token_usage_mtd   bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_limit_mtd   bigint NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS owner_id          uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_active         boolean NOT NULL DEFAULT true;

-- Audit log for admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor    ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity   ON admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created  ON admin_audit_log(created_at DESC);
