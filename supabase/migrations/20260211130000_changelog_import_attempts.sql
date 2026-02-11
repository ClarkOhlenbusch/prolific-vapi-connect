-- Log every changelog import attempt (success or failure) for debugging and history.
CREATE TABLE public.changelog_import_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failure')),
  error_message text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.changelog_import_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researchers can view import attempts"
ON public.changelog_import_attempts FOR SELECT
USING (is_researcher(auth.uid()));

CREATE POLICY "Researchers can insert import attempts"
ON public.changelog_import_attempts FOR INSERT
WITH CHECK (is_researcher(auth.uid()));
