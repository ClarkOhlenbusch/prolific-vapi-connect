-- Private storage bucket for researcher-triggered dashboard backups.
-- Keeps compact JSON snapshots (responses + calls) and excludes high-volume navigation events.

INSERT INTO storage.buckets (id, name, public)
VALUES ('research-backups', 'research-backups', false)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

DROP POLICY IF EXISTS "Researchers can upload research backups" ON storage.objects;
DROP POLICY IF EXISTS "Researchers can read research backups" ON storage.objects;
DROP POLICY IF EXISTS "Researchers can delete research backups" ON storage.objects;

CREATE POLICY "Researchers can upload research backups"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'research-backups'
    AND public.is_researcher(auth.uid())
  );

CREATE POLICY "Researchers can read research backups"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'research-backups'
    AND public.is_researcher(auth.uid())
  );

CREATE POLICY "Researchers can delete research backups"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'research-backups'
    AND public.is_researcher(auth.uid())
  );
