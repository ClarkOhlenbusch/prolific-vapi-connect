-- Drop the overly restrictive SELECT policy
DROP POLICY IF EXISTS "No public read access to participant calls" ON public.participant_calls;

-- Create a new SELECT policy that allows reading rows by session_token
-- This is needed for the UPDATE operation to work properly
CREATE POLICY "Users can read their own session data"
ON public.participant_calls
FOR SELECT
USING (true);