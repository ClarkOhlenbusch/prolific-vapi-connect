-- RPC to return the latest changelog version (by semantic-ish order).
-- SECURITY DEFINER so anon can call it without RLS blocking (read-only, no sensitive data).
-- Used by scripts/get-latest-changelog-version.mjs for the push skill.

CREATE OR REPLACE FUNCTION public.get_latest_changelog_version()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT version
  FROM public.changelog_entries
  ORDER BY
    COALESCE(NULLIF(regexp_replace((string_to_array(version, '.'))[1], '[^0-9]', '', 'g'), ''), '0')::int DESC NULLS LAST,
    COALESCE(NULLIF(regexp_replace((string_to_array(version, '.'))[2], '[^0-9]', '', 'g'), ''), '0')::int DESC NULLS LAST,
    COALESCE(NULLIF(regexp_replace((string_to_array(version, '.'))[3], '[^0-9]', '', 'g'), ''), '0')::int DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_changelog_version() TO anon;
GRANT EXECUTE ON FUNCTION public.get_latest_changelog_version() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_changelog_version() TO service_role;
