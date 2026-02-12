-- Allow researchers to archive import attempts (hide from list; keep for audit).
ALTER TABLE public.changelog_import_attempts
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE POLICY "Researchers can update import attempts"
ON public.changelog_import_attempts FOR UPDATE
USING (is_researcher(auth.uid()))
WITH CHECK (is_researcher(auth.uid()));
