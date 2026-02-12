-- Add lifecycle tracking columns so experiment_responses can represent
-- pending drafts and completed submissions in a single table.

ALTER TABLE public.experiment_responses
  ADD COLUMN IF NOT EXISTS session_token uuid,
  ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_step text,
  ADD COLUMN IF NOT EXISTS last_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'experiment_responses_submission_status_check'
      AND conrelid = 'public.experiment_responses'::regclass
  ) THEN
    ALTER TABLE public.experiment_responses
      ADD CONSTRAINT experiment_responses_submission_status_check
      CHECK (submission_status IN ('pending', 'submitted', 'abandoned'));
  END IF;
END $$;

-- Allow draft rows without full questionnaire payload.
ALTER TABLE public.experiment_responses ALTER COLUMN e1 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e2 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e3 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e4 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e5 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e6 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u1 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u2 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u3 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u4 DROP NOT NULL;

ALTER TABLE public.experiment_responses ALTER COLUMN e1_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e2_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e3_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e4_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e5_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN e6_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u1_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u2_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u3_position DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN u4_position DROP NOT NULL;

ALTER TABLE public.experiment_responses ALTER COLUMN pets_er DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN pets_ut DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN pets_total DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN intention_1 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN intention_2 DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN formality DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN voice_assistant_feedback DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN communication_style_feedback DROP NOT NULL;
ALTER TABLE public.experiment_responses ALTER COLUMN experiment_feedback DROP NOT NULL;

-- Backfill lifecycle values for historical complete rows.
UPDATE public.experiment_responses
SET
  submission_status = 'submitted',
  submitted_at = COALESCE(submitted_at, created_at),
  last_saved_at = COALESCE(last_saved_at, created_at),
  last_step = COALESCE(last_step, 'submitted_questionnaire')
WHERE submission_status IS DISTINCT FROM 'submitted';

-- Backfill session_token from participant_calls where possible.
UPDATE public.experiment_responses er
SET session_token = pc.session_token
FROM public.participant_calls pc
WHERE er.session_token IS NULL
  AND pc.prolific_id = er.prolific_id
  AND pc.call_id = er.call_id;

CREATE INDEX IF NOT EXISTS idx_experiment_responses_submission_status
  ON public.experiment_responses(submission_status);

CREATE INDEX IF NOT EXISTS idx_experiment_responses_session_token
  ON public.experiment_responses(session_token);
