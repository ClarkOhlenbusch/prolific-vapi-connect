-- Allow upsert (UPDATE) on dictation-audio bucket for anon/authenticated
CREATE POLICY "Dictation audio update for upsert"
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'dictation-audio')
  WITH CHECK (bucket_id = 'dictation-audio');
