
-- Fix 1: participant_condition_assignments - replace overly permissive policy
DROP POLICY IF EXISTS "Service role can manage assignments" ON public.participant_condition_assignments;

CREATE POLICY "Researchers can view assignments"
  ON public.participant_condition_assignments
  FOR SELECT
  TO authenticated
  USING (is_researcher(auth.uid()));

CREATE POLICY "Super admins can manage assignments"
  ON public.participant_condition_assignments
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Fix 2: dictation_recordings - restrict SELECT to researchers only
DROP POLICY IF EXISTS "Dictation recordings select anon/authenticated" ON public.dictation_recordings;

CREATE POLICY "Researchers can view dictation recordings"
  ON public.dictation_recordings
  FOR SELECT
  TO authenticated
  USING (is_researcher(auth.uid()));

-- Fix 3: dictation-audio storage - restrict SELECT to researchers only
DROP POLICY IF EXISTS "Dictation audio read anon/authenticated" ON storage.objects;

CREATE POLICY "Researchers can read dictation audio"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dictation-audio' AND
    is_researcher(auth.uid())
  );
