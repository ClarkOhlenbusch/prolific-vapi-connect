-- Store VAPI structured output evaluation results per response (by call_id).
-- Results are written when we fetch from VAPI after a run.
ALTER TABLE experiment_responses
  ADD COLUMN IF NOT EXISTS vapi_structured_output jsonb,
  ADD COLUMN IF NOT EXISTS vapi_structured_output_at timestamptz;

COMMENT ON COLUMN experiment_responses.vapi_structured_output IS 'Structured output evaluation from VAPI (scores, reasons, total_score, overall_justification)';
COMMENT ON COLUMN experiment_responses.vapi_structured_output_at IS 'When vapi_structured_output was last fetched from VAPI';

-- Track runs so we can "check for results" without re-triggering.
CREATE TABLE IF NOT EXISTS vapi_structured_output_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id text NOT NULL,
  call_ids text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'partial', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vapi_structured_output_runs IS 'Tracks VAPI structured-output runs; used to fetch and persist results into experiment_responses';

CREATE INDEX IF NOT EXISTS idx_vapi_structured_output_runs_status
  ON vapi_structured_output_runs (status) WHERE status = 'pending';
