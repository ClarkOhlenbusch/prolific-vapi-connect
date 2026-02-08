-- Create sequence for researcher prolific IDs, starting from max existing
DO $$
DECLARE
  max_num INTEGER := 0;
  extracted_num INTEGER;
BEGIN
  -- Find max numeric suffix from participant_calls where prolific_id matches researcher pattern
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(prolific_id FROM 'researcher([0-9]+)$') AS INTEGER)
  ), 0)
  INTO max_num
  FROM public.participant_calls
  WHERE prolific_id ~ '^researcher[0-9]+$';

  -- Create sequence starting after the max found value
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.researcher_prolific_id_seq START WITH %s INCREMENT BY 1 NO MAXVALUE', max_num + 1);
END $$;

-- Grant usage only to service_role
GRANT USAGE ON SEQUENCE public.researcher_prolific_id_seq TO service_role;

-- Create function to get next researcher prolific ID
CREATE OR REPLACE FUNCTION public.next_researcher_prolific_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'researcher' || nextval('public.researcher_prolific_id_seq')::text;
END;
$$;

-- Grant execute only to service_role
REVOKE ALL ON FUNCTION public.next_researcher_prolific_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_researcher_prolific_id() TO service_role;