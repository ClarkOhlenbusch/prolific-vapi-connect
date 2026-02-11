-- RPC to remove duplicate changelog entries (same version + release_date).
-- Keeps the earliest-created per (version, release_date); deletes the rest.
-- Callable by authenticated; RLS ensures only super admins actually delete rows.
-- Returns the number of entries deleted.

CREATE OR REPLACE FUNCTION public.remove_duplicate_changelog_entries()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY version, release_date ORDER BY created_at ASC) AS rn
    FROM public.changelog_entries
  ),
  to_delete AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM public.changelog_entries
  WHERE id IN (SELECT id FROM to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_duplicate_changelog_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_duplicate_changelog_entries() TO service_role;
