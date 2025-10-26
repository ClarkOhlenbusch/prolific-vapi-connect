-- Add SELECT policy to allow reading participant calls by session_token
CREATE POLICY "Allow reading participant calls via session_token"
ON public.participant_calls
FOR SELECT
USING (session_token IS NOT NULL);