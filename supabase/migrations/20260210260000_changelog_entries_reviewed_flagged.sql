-- Per-entry flags for researcher review workflow
ALTER TABLE public.changelog_entries
ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;

ALTER TABLE public.changelog_entries
ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
