-- Drop the existing overly broad update policy
DROP POLICY IF EXISTS "Anyone can update participant calls" ON public.participant_calls;

-- Create a specific policy for updating call_id via session_token
CREATE POLICY "Allow updating call_id via session_token"
ON public.participant_calls
FOR UPDATE
TO anon, authenticated
USING (session_token IS NOT NULL)
WITH CHECK (session_token IS NOT NULL AND call_id IS NOT NULL);