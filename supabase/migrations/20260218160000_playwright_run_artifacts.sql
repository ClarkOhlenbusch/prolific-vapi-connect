-- Playwright run artifacts: metadata imported from committed debug JSONs,
-- with video URLs populated after upload to Supabase Storage.

CREATE TABLE public.playwright_run_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  flow_id text NOT NULL,
  run_created_at timestamptz NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  sync_model text,
  debug_data jsonb,
  video_fast_url text,
  video_follow_url text,
  video_narrated_url text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playwright_run_artifacts_run_id
  ON public.playwright_run_artifacts (run_id);

CREATE INDEX idx_playwright_run_artifacts_run_created_at
  ON public.playwright_run_artifacts (run_created_at DESC);

ALTER TABLE public.playwright_run_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researchers can view playwright run artifacts"
ON public.playwright_run_artifacts
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can insert playwright run artifacts"
ON public.playwright_run_artifacts
FOR INSERT
TO authenticated
WITH CHECK (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can update playwright run artifacts"
ON public.playwright_run_artifacts
FOR UPDATE
TO authenticated
USING (public.is_researcher(auth.uid()))
WITH CHECK (public.is_researcher(auth.uid()));

CREATE POLICY "Super admins can delete playwright run artifacts"
ON public.playwright_run_artifacts
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.playwright_run_artifacts_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_playwright_run_artifacts_updated_at
BEFORE UPDATE ON public.playwright_run_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.playwright_run_artifacts_set_updated_at();

-- Storage bucket for video artifacts.
-- Public read so video URLs are directly playable; authenticated write via RLS.
INSERT INTO storage.buckets (id, name, public)
VALUES ('playwright-recordings', 'playwright-recordings', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Researchers can upload playwright recordings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'playwright-recordings'
  AND public.is_researcher(auth.uid())
);

CREATE POLICY "Public can read playwright recordings"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'playwright-recordings');

CREATE POLICY "Researchers can delete playwright recordings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'playwright-recordings'
  AND public.is_researcher(auth.uid())
);
