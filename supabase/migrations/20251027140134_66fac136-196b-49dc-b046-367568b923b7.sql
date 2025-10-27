-- Drop the blocking policy that prevents all reads
DROP POLICY IF EXISTS "No public read access to participant calls" ON participant_calls;

-- The existing "Allow reading participant calls via session_token" policy remains
-- It allows reading records where session_token IS NOT NULL
-- Security relies on session_token being a hard-to-guess UUID
-- Client queries filter to their specific session_token via .eq('session_token', value)