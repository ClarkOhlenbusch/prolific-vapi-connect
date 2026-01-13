-- Fix the circular dependency in researcher_roles RLS policy
-- The current policy uses is_researcher() which queries the same table

-- Drop the problematic policy
DROP POLICY IF EXISTS "Researchers can view their own role" ON public.researcher_roles;

-- Create a new policy that allows users to read their own role directly
-- This avoids the circular dependency by checking user_id directly
CREATE POLICY "Users can view their own role"
ON public.researcher_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);