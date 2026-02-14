-- Backfill experiment_responses.submission_status for rows that clearly contain
-- completed questionnaire payloads but are still marked as 'pending'.
--
-- This can happen if rows were inserted before the lifecycle columns existed,
-- or during a deployment/migration window.

UPDATE public.experiment_responses
SET
  submission_status = 'submitted',
  submitted_at = COALESCE(submitted_at, created_at),
  last_saved_at = COALESCE(last_saved_at, created_at),
  last_step = COALESCE(last_step, 'submitted_questionnaire')
WHERE submission_status = 'pending'
  AND pets_total IS NOT NULL
  AND tias_total IS NOT NULL
  AND formality IS NOT NULL;

