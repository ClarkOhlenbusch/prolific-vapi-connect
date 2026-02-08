-- Global monotonic researcher ID allocator (researcher1, researcher2, ...)
-- This prevents duplicates across browser resets/devices by allocating IDs server-side.

CREATE SEQUENCE IF NOT EXISTS public.researcher_prolific_id_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  CACHE 1;

DO $$
DECLARE
  max_suffix BIGINT;
BEGIN
  SELECT COALESCE(MAX(suffix), 0) INTO max_suffix
  FROM (
    SELECT NULLIF(SUBSTRING(prolific_id FROM '^researcher([0-9]+)$'), '')::BIGINT AS suffix
    FROM public.participant_calls
    UNION ALL
    SELECT NULLIF(SUBSTRING(prolific_id FROM '^researcher([0-9]+)$'), '')::BIGINT AS suffix
    FROM public.experiment_responses
  ) AS all_suffixes
  WHERE suffix IS NOT NULL;

  IF max_suffix > 0 THEN
    PERFORM setval('public.researcher_prolific_id_seq', max_suffix, true);
  ELSE
    PERFORM setval('public.researcher_prolific_id_seq', 1, false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_researcher_prolific_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id BIGINT;
BEGIN
  next_id := nextval('public.researcher_prolific_id_seq');
  RETURN 'researcher' || next_id::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.next_researcher_prolific_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_researcher_prolific_id() TO service_role;
