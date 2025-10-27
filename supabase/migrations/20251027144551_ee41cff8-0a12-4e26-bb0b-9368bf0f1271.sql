-- Drop the current complex policy
DROP POLICY IF EXISTS "Allow updates via session_token" ON participant_calls;

-- Create a simpler policy that just checks session_token
CREATE POLICY "Allow updates via session_token"
ON participant_calls
FOR UPDATE
USING (
  session_token IS NOT NULL
)
WITH CHECK (
  session_token IS NOT NULL
);