-- 055_invite_full_name.sql — record the invitee's full name on the invite.
--
-- Set on the invite when an admin sends it; copied to user_metadata.full_name
-- when the user accepts. Used by the dashboard greeting and member listing.

ALTER TABLE group_invites
  ADD COLUMN IF NOT EXISTS full_name text;
