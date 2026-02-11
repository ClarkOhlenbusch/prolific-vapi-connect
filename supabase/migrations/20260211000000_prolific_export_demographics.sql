-- Prolific demographic export data (researcher upload, keyed by prolific_id)
CREATE TABLE public.prolific_export_demographics (
  prolific_id text NOT NULL PRIMARY KEY,
  age integer NULL,
  gender text NULL,
  ethnicity_simplified text NULL,
  country_of_residence text NULL,
  employment_status text NULL,
  language text NULL,
  raw_columns jsonb NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_prolific_export_demographics_imported_at ON public.prolific_export_demographics(imported_at);

ALTER TABLE public.prolific_export_demographics ENABLE ROW LEVEL SECURITY;

-- Researchers can view
CREATE POLICY "Researchers can view prolific export demographics"
ON public.prolific_export_demographics
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

-- Researchers can insert (upload)
CREATE POLICY "Researchers can insert prolific export demographics"
ON public.prolific_export_demographics
FOR INSERT
TO authenticated
WITH CHECK (public.is_researcher(auth.uid()));

-- Researchers can update (re-upload overwrites)
CREATE POLICY "Researchers can update prolific export demographics"
ON public.prolific_export_demographics
FOR UPDATE
TO authenticated
USING (public.is_researcher(auth.uid()))
WITH CHECK (public.is_researcher(auth.uid()));

COMMENT ON TABLE public.prolific_export_demographics IS 'Demographics from researcher-uploaded Prolific export CSV; linked to responses by prolific_id.';
