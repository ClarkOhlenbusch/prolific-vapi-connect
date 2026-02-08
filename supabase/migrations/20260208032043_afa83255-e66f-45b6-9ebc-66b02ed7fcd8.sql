-- 1) Ensure bucket exists and is private (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dictation-audio', 'dictation-audio', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2) Reset/recreate public.dictation_recordings policies
DROP POLICY IF EXISTS "No deletes allowed on dictation recordings" ON public.dictation_recordings;
DROP POLICY IF EXISTS "No updates allowed on dictation recordings" ON public.dictation_recordings;
DROP POLICY IF EXISTS "Dictation recordings insert anon/authenticated" ON public.dictation_recordings;
DROP POLICY IF EXISTS "Dictation recordings select anon/authenticated" ON public.dictation_recordings;

CREATE POLICY "Dictation recordings insert anon/authenticated"
  ON public.dictation_recordings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Dictation recordings select anon/authenticated"
  ON public.dictation_recordings
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "No deletes allowed on dictation recordings"
  ON public.dictation_recordings
  FOR DELETE
  TO anon, authenticated
  USING (false);

CREATE POLICY "No updates allowed on dictation recordings"
  ON public.dictation_recordings
  FOR UPDATE
  TO anon, authenticated
  USING (false);

-- 3) Remove existing storage.objects policies for dictation-audio bucket
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%dictation-audio%'
        OR COALESCE(with_check, '') ILIKE '%dictation-audio%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects;', policy_row.policyname);
  END LOOP;
END
$$;

-- 4) Create new storage policies for dictation-audio bucket
CREATE POLICY "Dictation audio upload anon/authenticated"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'dictation-audio');

CREATE POLICY "Dictation audio read anon/authenticated"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'dictation-audio');