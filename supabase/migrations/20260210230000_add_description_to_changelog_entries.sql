-- Optional description for a release/version (e.g. "Major UX improvements and new batch workflow")
ALTER TABLE public.changelog_entries
ADD COLUMN IF NOT EXISTS description text;
