-- Allow early_access_notify to be NULL so we can distinguish:
--   true  = opted in
--   false = opted out
--   null  = participant did the experiment before the Early Access step existed (NA)
-- Then set all existing rows to NULL so they show as "Not available"; new completions
-- that see the Early Access step will store true/false.

ALTER TABLE experiment_responses
  ALTER COLUMN early_access_notify DROP DEFAULT,
  ALTER COLUMN early_access_notify DROP NOT NULL;

UPDATE experiment_responses
SET early_access_notify = NULL;

COMMENT ON COLUMN experiment_responses.early_access_notify IS 'Participant opted in (true), opted out (false), or step not shown (null = NA)';
