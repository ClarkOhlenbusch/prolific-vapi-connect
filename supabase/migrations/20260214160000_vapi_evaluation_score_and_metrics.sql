-- Add lightweight evaluation score + metric version tracking, and metric changelog tables.

-- 1) experiment_responses: store an integer score for fast dashboard queries, and link to metric version.
ALTER TABLE public.experiment_responses
  ADD COLUMN IF NOT EXISTS vapi_total_score integer,
  ADD COLUMN IF NOT EXISTS vapi_evaluation_metric_id uuid;

COMMENT ON COLUMN public.experiment_responses.vapi_total_score IS 'Total evaluation score extracted from vapi_structured_output (e.g., total_score).';
COMMENT ON COLUMN public.experiment_responses.vapi_evaluation_metric_id IS 'Which evaluation metric version produced the current evaluation fields.';

-- 2) Metric changelog table.
CREATE TABLE IF NOT EXISTS public.vapi_evaluation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  structured_output_id text NOT NULL,
  definition jsonb,
  definition_hash text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

COMMENT ON TABLE public.vapi_evaluation_metrics IS 'Changelog of evaluation metric versions (Vapi structured output ids + optional snapshots).';
COMMENT ON COLUMN public.vapi_evaluation_metrics.definition IS 'Best-effort snapshot of the Vapi structured output definition at time of creation (if available).';
COMMENT ON COLUMN public.vapi_evaluation_metrics.definition_hash IS 'Hash of canonicalized definition + structured_output_id for quick comparison.';

-- 3) Queue table (button-driven worker uses this to dedupe work).
CREATE TABLE IF NOT EXISTS public.vapi_evaluation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id text NOT NULL,
  metric_id uuid NOT NULL REFERENCES public.vapi_evaluation_metrics(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  run_id uuid REFERENCES public.vapi_structured_output_runs(id) ON DELETE SET NULL,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, metric_id)
);

COMMENT ON TABLE public.vapi_evaluation_queue IS 'Queue of calls that should be evaluated for a specific metric version.';

-- 4) Extend vapi_structured_output_runs with provenance + polling metadata.
ALTER TABLE public.vapi_structured_output_runs
  ADD COLUMN IF NOT EXISTS metric_id uuid REFERENCES public.vapi_evaluation_metrics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS poll_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- 5) RLS for vapi_evaluation_metrics: researchers can read; only super admins can write.
ALTER TABLE public.vapi_evaluation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researchers can read evaluation metrics"
  ON public.vapi_evaluation_metrics FOR SELECT
  USING (public.is_researcher(auth.uid()));

CREATE POLICY "Super admins can insert evaluation metrics"
  ON public.vapi_evaluation_metrics FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update evaluation metrics"
  ON public.vapi_evaluation_metrics FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

-- 6) RLS for vapi_evaluation_queue: only super admins can read/write (worker uses service role).
ALTER TABLE public.vapi_evaluation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read evaluation queue"
  ON public.vapi_evaluation_queue FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert evaluation queue"
  ON public.vapi_evaluation_queue FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update evaluation queue"
  ON public.vapi_evaluation_queue FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

