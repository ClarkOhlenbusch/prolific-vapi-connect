-- Lock down participant_calls RLS policies
-- VAPI webhook will continue to work because it uses SERVICE_ROLE_KEY which bypasses RLS

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow anon to read for updates" ON public.participant_calls;
DROP POLICY IF EXISTS "Allow anonymous updates" ON public.participant_calls;

-- Block all client-side reads
CREATE POLICY "Block client reads"
ON public.participant_calls
FOR SELECT
USING (false);

-- Block all client-side updates  
CREATE POLICY "Block client updates"
ON public.participant_calls
FOR UPDATE
USING (false);

-- Keep INSERT policy for session creation (already exists but recreating for clarity)
DROP POLICY IF EXISTS "Anyone can insert participant calls" ON public.participant_calls;
CREATE POLICY "Allow session creation"
ON public.participant_calls
FOR INSERT
WITH CHECK (true);

-- Also block client reads on pets_responses for consistency
DROP POLICY IF EXISTS "No public read access to PETS responses" ON public.pets_responses;
CREATE POLICY "Block client reads on responses"
ON public.pets_responses
FOR SELECT
USING (false);