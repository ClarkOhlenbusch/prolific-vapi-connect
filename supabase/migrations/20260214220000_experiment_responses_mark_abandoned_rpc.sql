-- Mark stale draft experiment_responses rows as abandoned.
--
-- We treat "abandoned" as: submission_status='pending' and last_saved_at older than now - cutoff.
-- This is used for researcher UI clarity (Pending vs Abandoned) while keeping analytics submitted-only.

CREATE INDEX IF NOT EXISTS idx_experiment_responses_status_last_saved_at
  ON public.experiment_responses(submission_status, last_saved_at);

CREATE OR REPLACE FUNCTION public.mark_abandoned_experiment_responses(cutoff_minutes integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.experiment_responses
  SET submission_status = 'abandoned'
  WHERE submission_status = 'pending'
    AND last_saved_at IS NOT NULL
    AND last_saved_at < (now() - make_interval(mins => cutoff_minutes))
    AND submitted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Only service role should be able to mutate rows via this helper.
REVOKE ALL ON FUNCTION public.mark_abandoned_experiment_responses(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_experiment_responses(integer) TO service_role;

