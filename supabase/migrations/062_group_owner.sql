-- Migration 062: Group Owner role + ownership tracking + feedback RLS fix
-- ─────────────────────────────────────────────────────────────────────────
-- Adds a new 'group_owner' role that sits between super_admin and
-- group_admin. Group owners control group_admin assignments; only
-- super_admins can mint group_owners. Also fixes the user_suggestions
-- INSERT policy so authenticated users can actually submit feedback.
--
-- This file is idempotent — safe to re-run. All ALTER/CREATE statements
-- are guarded with IF NOT EXISTS / DROP IF EXISTS / DO-EXCEPTION blocks.

-- ── 1. Extend user_role_enum with every role name the app now uses.
--      The enum was created in migration 001 with super_admin / group_admin /
--      company_viewer / division_viewer. Migration 031 added a permissive
--      CHECK so manager/viewer could be written, but never extended the
--      enum itself — this block does that. Each ALTER TYPE is wrapped in
--      its own DO/EXCEPTION so it survives whether the type still exists
--      (column may have been demoted to text in earlier migrations) and
--      whether the value is already present.
DO $$ BEGIN
  ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'group_owner';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'manager';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'viewer';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 2. Normalise user_groups.role to text. If the column is still the
--      original user_role_enum this casts it across; if it's already text
--      this is a no-op. Wrapping in DO/EXCEPTION keeps re-runs silent.
DO $$ BEGIN
  ALTER TABLE user_groups
    ALTER COLUMN role TYPE text USING role::text;
EXCEPTION WHEN others THEN
  -- Column already text, or other harmless condition — keep going.
  NULL;
END $$;

-- ── 3. Refresh CHECK constraint idempotently. role::text comparison works
--      whether the column ends up as text or back as the enum on some
--      future migration — no implicit-cast surprises.
ALTER TABLE user_groups DROP CONSTRAINT IF EXISTS user_groups_role_check;
ALTER TABLE user_groups ADD CONSTRAINT user_groups_role_check
  CHECK (role::text = ANY (ARRAY[
    'super_admin',
    'group_owner',
    'group_admin',
    'manager',
    'viewer'
  ]));

-- ── 4. Track ownership on the groups table. Existing migration 016 added a
--      separate `owner_id` column on groups for the admin Subscription
--      table — keep it; add owner_user_id alongside per spec so future
--      code can reference either name. New group-creation code (POST
--      /api/groups + POST /api/admin/groups) writes both.
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 5. Backfill owner_user_id from the earliest group_admin / group_owner
--      where it isn't set yet. Falls back to the legacy owner_id column
--      (migration 016) when one exists. ORDER BY g.created_at is a
--      deterministic tiebreaker — user_groups has no created_at column.
UPDATE groups g
SET owner_user_id = COALESCE(
  (SELECT ug.user_id
     FROM user_groups ug
    WHERE ug.group_id = g.id
      AND ug.role IN ('group_admin', 'group_owner')
    ORDER BY g.created_at ASC
    LIMIT 1),
  g.owner_id
)
WHERE owner_user_id IS NULL;

-- ── 6. Promote those backfilled owners from group_admin → group_owner so
--      every active group has exactly one owner who can manage admins.
UPDATE user_groups
SET role = 'group_owner'
WHERE role = 'group_admin'
  AND (user_id, group_id) IN (
    SELECT owner_user_id, id FROM groups WHERE owner_user_id IS NOT NULL
  );

-- ── 7. user_suggestions RLS — the original "users manage own" policy used
--      USING() only, which evaluates submitted_by BEFORE the row exists
--      and so blocks INSERT. Split into INSERT (WITH CHECK) + SELECT/UPDATE
--      (USING) so feedback submissions actually work.
--
--      DROP IF EXISTS for every policy this block manages (old name AND
--      the three new names) so the migration is safe to re-run on a DB
--      that's already been migrated once.
DROP POLICY IF EXISTS "user_suggestions: users manage own"  ON user_suggestions;
DROP POLICY IF EXISTS "user_suggestions: users insert own"  ON user_suggestions;
DROP POLICY IF EXISTS "user_suggestions: users select own"  ON user_suggestions;
DROP POLICY IF EXISTS "user_suggestions: users update own"  ON user_suggestions;

CREATE POLICY "user_suggestions: users insert own"
  ON user_suggestions FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "user_suggestions: users select own"
  ON user_suggestions FOR SELECT
  USING (submitted_by = auth.uid());

CREATE POLICY "user_suggestions: users update own"
  ON user_suggestions FOR UPDATE
  USING (submitted_by = auth.uid())
  WITH CHECK (submitted_by = auth.uid());
