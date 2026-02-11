-- One-off: remove duplicate changelog entries (same version + release_date).
-- Keeps the earliest-created entry per (version, release_date); deletes the rest.
-- Run in Supabase Dashboard → SQL Editor. changelog_changes are removed automatically (CASCADE).

DELETE FROM public.changelog_entries
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY version, release_date ORDER BY created_at ASC) AS rn
    FROM public.changelog_entries
  ) ranked
  WHERE rn > 1
);
