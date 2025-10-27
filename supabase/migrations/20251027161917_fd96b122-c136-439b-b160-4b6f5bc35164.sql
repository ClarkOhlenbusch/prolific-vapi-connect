-- Allow anon users to read their own records for update verification
CREATE POLICY "Allow anon to read for updates"
ON public.participant_calls
FOR SELECT
TO anon, authenticated
USING (true);