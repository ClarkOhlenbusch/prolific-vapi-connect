-- Add session_token column to participant_calls for secure access control
ALTER TABLE public.participant_calls 
ADD COLUMN session_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Create index for fast token lookups
CREATE INDEX idx_participant_calls_session_token ON public.participant_calls(session_token);

-- Drop existing overly permissive SELECT policies
DROP POLICY IF EXISTS "Anyone can view participant calls" ON public.participant_calls;
DROP POLICY IF EXISTS "Public can view PETS responses" ON public.pets_responses;

-- Create restrictive SELECT policies (data is now private by default)
CREATE POLICY "No public read access to participant calls" 
ON public.participant_calls 
FOR SELECT 
USING (false);

CREATE POLICY "No public read access to PETS responses" 
ON public.pets_responses 
FOR SELECT 
USING (false);

-- Keep INSERT policies as they are (still allow public inserts for study participation)
-- The existing INSERT policies remain unchanged