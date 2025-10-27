-- Drop the conflicting restrictive UPDATE policies
DROP POLICY IF EXISTS "Allow updating call_id via session_token" ON participant_calls;
DROP POLICY IF EXISTS "Allow updating token_used via session_token" ON participant_calls;

-- Create permissive policies that use OR logic (any one can allow the update)
-- This allows updating call_id OR token_used independently

CREATE POLICY "Allow updating call_id via session_token"
ON participant_calls
FOR UPDATE
USING (
  session_token IS NOT NULL
)
WITH CHECK (
  -- Allow if we're setting call_id (don't care about token_used)
  (call_id IS NOT NULL AND call_id != '')
);

CREATE POLICY "Allow updating token_used via session_token"
ON participant_calls
FOR UPDATE  
USING (
  session_token IS NOT NULL AND token_used = false
)
WITH CHECK (
  -- Allow if we're marking token as used
  (session_token IS NOT NULL AND token_used = true)
);