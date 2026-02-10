-- Add researcher review and flag columns to experiment_responses
ALTER TABLE experiment_responses
  ADD COLUMN IF NOT EXISTS reviewed_by_researcher boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN experiment_responses.reviewed_by_researcher IS 'Set by researcher when they have reviewed this response';
COMMENT ON COLUMN experiment_responses.flagged IS 'Set by researcher to flag the response for follow-up or attention';
