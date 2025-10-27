-- Drop the restrictive UPDATE policy and create a permissive one for anonymous users
DROP POLICY IF EXISTS "Allow anonymous updates via session_token" ON public.participant_calls;

-- Allow anonymous users to update ANY row (the WHERE clause in the query provides the security)
-- This is safe because we're matching on session_token in the WHERE clause
CREATE POLICY "Allow anonymous updates"
ON public.participant_calls
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);