-- Optional GitHub commit hash per change for "View commit" link
ALTER TABLE public.changelog_changes
ADD COLUMN IF NOT EXISTS commit_hash text;
