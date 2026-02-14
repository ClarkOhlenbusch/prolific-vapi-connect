-- Store raw Vapi structured outputs (keyed by structuredOutputId) per response (by call_id).
-- This complements vapi_structured_output, which stores the flattened evaluation-friendly object.
ALTER TABLE experiment_responses
  ADD COLUMN IF NOT EXISTS vapi_structured_outputs jsonb,
  ADD COLUMN IF NOT EXISTS vapi_structured_outputs_at timestamptz;

COMMENT ON COLUMN experiment_responses.vapi_structured_outputs IS 'Raw structured outputs from VAPI (typically artifact.structuredOutputs or analysis.structuredOutputs), keyed by structuredOutputId.';
COMMENT ON COLUMN experiment_responses.vapi_structured_outputs_at IS 'When vapi_structured_outputs was last fetched from VAPI';

