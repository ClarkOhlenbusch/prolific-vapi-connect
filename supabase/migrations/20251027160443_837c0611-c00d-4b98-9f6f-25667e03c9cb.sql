-- Grant UPDATE permission to anon role explicitly
GRANT UPDATE ON public.participant_calls TO anon;
GRANT UPDATE ON public.participant_calls TO authenticated;