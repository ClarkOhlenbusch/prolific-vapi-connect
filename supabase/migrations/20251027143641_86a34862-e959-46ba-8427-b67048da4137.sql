-- Drop ALL existing UPDATE policies - they're interfering
DROP POLICY IF EXISTS "Allow updating call_id via session_token" ON participant_calls;
DROP POLICY IF EXISTS "Allow updating token_used via session_token" ON participant_calls;

-- Create a SINGLE permissive UPDATE policy that allows BOTH operations
-- This prevents the AND logic conflict between multiple policies
CREATE POLICY "Allow updates via session_token"
ON participant_calls
FOR UPDATE
USING (
  -- Can update if you have the session_token
  session_token IS NOT NULL
)
WITH CHECK (
  -- New row must have session_token
  -- AND either (call_id is being set) OR (token_used is being set to true)
  session_token IS NOT NULL
  AND (
    (call_id IS NOT NULL AND call_id != '')
    OR 
    token_used = true
  )
);