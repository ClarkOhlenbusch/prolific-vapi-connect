-- Add UPDATE policy to allow updating call_id after VAPI call starts
CREATE POLICY "Anyone can update participant calls"
ON public.participant_calls
FOR UPDATE
USING (true)
WITH CHECK (true);