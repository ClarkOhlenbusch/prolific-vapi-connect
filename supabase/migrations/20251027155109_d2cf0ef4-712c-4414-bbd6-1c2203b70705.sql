-- Fix RLS policy to allow anonymous updates when session_token matches
DROP POLICY IF EXISTS "Allow updates via session_token" ON public.participant_calls;

CREATE POLICY "Allow anonymous updates via session_token"
ON public.participant_calls
FOR UPDATE
TO anon
USING (session_token IS NOT NULL)
WITH CHECK (session_token IS NOT NULL);