-- Drop the overly permissive SELECT policy that allows reading any record
DROP POLICY IF EXISTS "Allow reading participant calls via session_token" ON participant_calls;

-- Add explicit deny policy for SELECT operations
-- All reads should go through the validate-session edge function
CREATE POLICY "Block all public reads of participant calls"
ON participant_calls
FOR SELECT
USING (false);

-- The UPDATE policy remains unchanged and allows updating call_id via session_token
-- This is secure because UPDATE operations don't require SELECT access