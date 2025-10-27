-- Drop the blocking SELECT policy
DROP POLICY IF EXISTS "Block all public reads of participant calls" ON participant_calls;

-- Create a SELECT policy that allows reading rows via session_token
-- This is required for UPDATE operations to find rows to update
CREATE POLICY "Allow read via session_token"
ON participant_calls
FOR SELECT
USING (
  session_token IS NOT NULL
);