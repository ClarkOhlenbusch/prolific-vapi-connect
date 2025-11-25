-- Create intention responses table
CREATE TABLE public.intention (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  prolific_id text NOT NULL,
  call_id text NOT NULL,
  intention_1 numeric NOT NULL,
  intention_2 numeric NOT NULL
);

-- Enable RLS
ALTER TABLE public.intention ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can insert intention responses"
ON public.intention
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Block client reads on intention"
ON public.intention
FOR SELECT
USING (false);

CREATE POLICY "No deletes allowed on intention"
ON public.intention
FOR DELETE
USING (false);