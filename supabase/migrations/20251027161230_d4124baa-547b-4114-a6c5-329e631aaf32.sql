-- Grant all necessary permissions on participant_calls table
-- This ensures both anon and authenticated roles can interact with the table

GRANT SELECT, INSERT, UPDATE ON public.participant_calls TO anon;
GRANT SELECT, INSERT, UPDATE ON public.participant_calls TO authenticated;