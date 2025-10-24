-- Fix public data exposure by restricting participant_calls table access
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can read their own session data" ON public.participant_calls;

-- Create a restrictive policy that blocks all public SELECT access
-- Only service role (edge functions) can read this table
CREATE POLICY "No public read access to participant calls"
ON public.participant_calls
FOR SELECT
TO anon, authenticated
USING (false);

-- Add lenient database constraint for maximum length only
ALTER TABLE public.participant_calls
ADD CONSTRAINT prolific_id_max_length CHECK (length(prolific_id) <= 100);