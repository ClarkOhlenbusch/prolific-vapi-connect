-- Track whether a changelog entry is only committed locally, pushed to the repo, or deployed/released.
-- This enables the Release History UI to show "committed vs pushed vs released".

ALTER TABLE public.changelog_entries
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT 'pushed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'changelog_entries_release_status_check'
      AND conrelid = 'public.changelog_entries'::regclass
  ) THEN
    ALTER TABLE public.changelog_entries
      ADD CONSTRAINT changelog_entries_release_status_check
      CHECK (release_status IN ('committed', 'pushed', 'released'));
  END IF;
END $$;

