-- Drop the conflicting permissive RLS policy that allows reads via session_token
-- Keep only the restrictive policy that blocks all public access
-- This clarifies that all access to participant_calls must go through edge functions using service role
DROP POLICY IF EXISTS "Allow reading participant calls via session_token" ON participant_calls;

-- Add comment to document the access control pattern
COMMENT ON TABLE participant_calls IS 'Access restricted to service role only. All queries must go through edge functions for proper authentication and validation.';