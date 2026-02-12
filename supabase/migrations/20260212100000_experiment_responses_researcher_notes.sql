-- Researcher notes per response (with date of entry)
ALTER TABLE experiment_responses
  ADD COLUMN IF NOT EXISTS researcher_notes text,
  ADD COLUMN IF NOT EXISTS researcher_notes_at timestamptz;

COMMENT ON COLUMN experiment_responses.researcher_notes IS 'Researcher-only notes for this response';
COMMENT ON COLUMN experiment_responses.researcher_notes_at IS 'When researcher_notes was last updated';
