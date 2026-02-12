-- Add early-access signup fields to experiment_responses (after feedback, before debriefing)
ALTER TABLE experiment_responses
  ADD COLUMN IF NOT EXISTS early_access_notify boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_access_notes text;

COMMENT ON COLUMN experiment_responses.early_access_notify IS 'Participant opted in to be notified when the Voice AI product is ready for the public';
COMMENT ON COLUMN experiment_responses.early_access_notes IS 'Optional free-text from participant about early access interest';
