-- Add long-form change details and explicit push timestamp per changelog change.
ALTER TABLE public.changelog_changes
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS details jsonb;

-- Backfill existing rows so historical changes sort correctly by push time.
UPDATE public.changelog_changes
SET pushed_at = COALESCE(pushed_at, created_at)
WHERE pushed_at IS NULL;

ALTER TABLE public.changelog_changes
  ALTER COLUMN pushed_at SET DEFAULT now(),
  ALTER COLUMN pushed_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_changelog_changes_pushed_at
  ON public.changelog_changes(pushed_at DESC);
