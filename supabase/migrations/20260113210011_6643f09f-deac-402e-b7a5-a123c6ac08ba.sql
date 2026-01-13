-- Add delete policy for super admins on participant_calls
CREATE POLICY "Super admins can delete participant calls" 
ON public.participant_calls 
FOR DELETE 
USING (is_super_admin(auth.uid()));