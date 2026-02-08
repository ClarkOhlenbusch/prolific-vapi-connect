-- Reset dictation audio storage policies so researcher IDs (e.g. researcher23) can upload audio.
-- This migration is idempotent and safe to run multiple times.

-- Ensure dictation bucket exists.
INSERT INTO storage.buckets (id, name, public)
VALUES ('dictation-audio', 'dictation-audio', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- Reset dictation_recordings table policies (allow client insert/read as intended).
DROP POLICY IF EXISTS "Anyone can insert dictation recordings" ON public.dictation_recordings;
DROP POLICY IF EXISTS "Anyone can view dictation recordings" ON public.dictation_recordings;
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

-- Remove any existing storage policies that target the dictation bucket, then recreate cleanly.
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
