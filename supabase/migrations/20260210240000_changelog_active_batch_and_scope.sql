-- Which batch was active when this version was live (researcher sets manually)
ALTER TABLE public.changelog_entries
ADD COLUMN IF NOT EXISTS active_batch_label text;

-- Per change: affects participant experience, researcher dashboard, or both
ALTER TABLE public.changelog_changes
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'both'
  CHECK (scope IN ('participant', 'researcher', 'both'));
