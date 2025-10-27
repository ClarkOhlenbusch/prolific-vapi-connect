-- Add SELECT policy to allow reading participant_calls via session_token
-- This is needed so the client can query the row before updating call_id
CREATE POLICY "Allow reading participant calls via session_token"
ON participant_calls
AS PERMISSIVE
FOR SELECT
TO public
USING (session_token IS NOT NULL);