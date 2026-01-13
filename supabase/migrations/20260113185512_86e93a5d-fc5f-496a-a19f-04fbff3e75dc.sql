-- Add policy to allow super admins to delete experiment responses
CREATE POLICY "Super admins can delete experiment responses"
ON public.experiment_responses
FOR DELETE
USING (is_super_admin(auth.uid()));