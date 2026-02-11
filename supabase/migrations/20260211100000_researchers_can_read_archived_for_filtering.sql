-- Let researchers read archived_responses (original_table, original_id, archived_data) so they can
-- filter archived records out of All Responses, Statistics, Dashboard, etc. Only super_admins can
-- INSERT/DELETE; the Archived tab UI remains super_admin only.
CREATE POLICY "Researchers can view archived responses for filtering"
ON public.archived_responses
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));
