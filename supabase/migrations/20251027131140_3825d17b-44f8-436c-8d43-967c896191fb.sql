-- Add token_used column to track single-use tokens
ALTER TABLE public.participant_calls 
ADD COLUMN token_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for efficient token validation queries
CREATE INDEX idx_participant_calls_token_used ON public.participant_calls(session_token, token_used);

-- Add UPDATE policy to allow marking tokens as used
CREATE POLICY "Allow updating token_used via session_token"
ON public.participant_calls
FOR UPDATE
USING (session_token IS NOT NULL AND token_used = FALSE)
WITH CHECK (session_token IS NOT NULL AND token_used = TRUE);