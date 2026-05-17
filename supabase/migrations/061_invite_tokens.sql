-- 061_invite_tokens.sql — Two-step invite landing so Outlook / Microsoft
-- Safe Links scanners can't consume Supabase one-time OTPs.
--
-- Problem: when an admin sends an invite, Supabase generates an OTP-bearing
-- action_link. If we put that link directly in the email, Microsoft's link
-- scanner fetches it to check for malware and the OTP is consumed before
-- the user clicks. The user then hits the link from their inbox and gets
-- otp_expired.
--
-- Solution: store the action_link server-side keyed to a random token. Send
-- the user a NavHub URL (/invite/<token>) that loads a static page with an
-- "Accept invitation" button. The scanner follows the page link but doesn't
-- press buttons. When the user clicks the button, the client POSTs to the
-- accept endpoint which reads the action_link out of this table and returns
-- it for a client-side redirect.

CREATE TABLE IF NOT EXISTS invite_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invite_id   uuid REFERENCES group_invites(id) ON DELETE CASCADE,
  action_link text NOT NULL,
  email       text NOT NULL,
  group_id    uuid REFERENCES groups(id) ON DELETE CASCADE,
  group_name  text NOT NULL,
  role        text NOT NULL,
  full_name   text,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_email   ON invite_tokens (email);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_invite  ON invite_tokens (invite_id);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- The accept page is unauthenticated (the invitee hasn't signed in yet),
-- but the action_link is never exposed via SELECT to anything but the
-- service role — the public landing page reads only via /api/invite/[token]
-- routes (which use the admin client). Keep RLS strict: no anon access.
-- Server routes use the service-role admin client and bypass RLS.
