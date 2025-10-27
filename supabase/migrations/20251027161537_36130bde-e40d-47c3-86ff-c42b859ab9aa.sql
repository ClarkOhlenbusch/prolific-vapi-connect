-- Drop the restrictive UPDATE policy and create a permissive one
DROP POLICY IF EXISTS "Allow anonymous updates" ON public.participant_calls;

-- Create a permissive UPDATE policy (AS PERMISSIVE is the default)
CREATE POLICY "Allow anonymous updates" 
ON public.participant_calls
FOR UPDATE 
TO anon, authenticated
USING (true)
WITH CHECK (true);