-- Allow super admins to delete no_consent_feedback (e.g. when archiving)
CREATE POLICY "Super admins can delete no consent feedback"
ON public.no_consent_feedback
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));
