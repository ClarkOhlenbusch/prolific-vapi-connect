-- Create demographics table
CREATE TABLE public.demographics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_token uuid NOT NULL,
  prolific_id text NOT NULL,
  age text NOT NULL,
  gender text NOT NULL,
  ethnicity jsonb NOT NULL,
  native_english text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.demographics ENABLE ROW LEVEL SECURITY;

-- Allow inserts for anyone
CREATE POLICY "Allow demographics submission"
ON public.demographics
FOR INSERT
WITH CHECK (true);

-- Block client reads
CREATE POLICY "Block client reads on demographics"
ON public.demographics
FOR SELECT
USING (false);

-- No deletes allowed
CREATE POLICY "No deletes allowed on demographics"
ON public.demographics
FOR DELETE
USING (false);