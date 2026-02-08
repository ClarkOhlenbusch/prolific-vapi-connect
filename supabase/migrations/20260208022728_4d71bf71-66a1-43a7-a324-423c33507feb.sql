-- Create a sequence for unique researcher session IDs
CREATE SEQUENCE IF NOT EXISTS public.researcher_session_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;

-- Grant usage to authenticated and service role
GRANT USAGE ON SEQUENCE public.researcher_session_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.researcher_session_seq TO service_role;