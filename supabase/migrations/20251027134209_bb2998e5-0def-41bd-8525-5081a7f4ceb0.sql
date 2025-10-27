-- Drop existing restrictive UPDATE policies that conflict with each other
DROP POLICY IF EXISTS "Allow updating call_id via session_token" ON participant_calls;
DROP POLICY IF EXISTS "Allow updating token_used via session_token" ON participant_calls;

-- Create permissive UPDATE policies so either can allow the operation
-- This allows updating call_id via session_token
CREATE POLICY "Allow updating call_id via session_token"
ON participant_calls
AS PERMISSIVE
FOR UPDATE
TO public
USING (session_token IS NOT NULL)
WITH CHECK (session_token IS NOT NULL AND call_id IS NOT NULL);

-- This allows updating token_used via session_token
CREATE POLICY "Allow updating token_used via session_token"
ON participant_calls
AS PERMISSIVE
FOR UPDATE
TO public
USING (session_token IS NOT NULL AND token_used = false)
WITH CHECK (session_token IS NOT NULL AND token_used = true);