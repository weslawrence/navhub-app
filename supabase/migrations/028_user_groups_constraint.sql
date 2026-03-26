-- Ensure unique constraint on user_groups(user_id, group_id) for upsert conflict resolution
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_user_groups_user_group'
      AND table_name = 'user_groups'
  ) THEN
    ALTER TABLE user_groups ADD CONSTRAINT uq_user_groups_user_group UNIQUE (user_id, group_id);
  END IF;
END $$;
