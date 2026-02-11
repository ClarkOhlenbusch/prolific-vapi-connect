-- Track which changelog JSON files from GitHub have been imported (so we don't re-import).
-- The app (e.g. Changelog page) checks GitHub docs/ for changelog-import-*.json and auto-imports new files.
CREATE TABLE public.changelog_imported_sources (
  source_key text PRIMARY KEY,
  imported_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.changelog_imported_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researchers can view imported sources"
ON public.changelog_imported_sources FOR SELECT
USING (is_researcher(auth.uid()));

CREATE POLICY "Researchers can insert imported sources"
ON public.changelog_imported_sources FOR INSERT
WITH CHECK (is_researcher(auth.uid()));
