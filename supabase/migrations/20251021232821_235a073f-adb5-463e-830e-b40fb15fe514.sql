-- Create table for PETS questionnaire responses
CREATE TABLE public.pets_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  prolific_id text NOT NULL,
  call_id text NOT NULL,
  e1 numeric NOT NULL CHECK (e1 >= 0 AND e1 <= 100),
  e2 numeric NOT NULL CHECK (e2 >= 0 AND e2 <= 100),
  e3 numeric NOT NULL CHECK (e3 >= 0 AND e3 <= 100),
  e4 numeric NOT NULL CHECK (e4 >= 0 AND e4 <= 100),
  e5 numeric NOT NULL CHECK (e5 >= 0 AND e5 <= 100),
  e6 numeric NOT NULL CHECK (e6 >= 0 AND e6 <= 100),
  u1 numeric NOT NULL CHECK (u1 >= 0 AND u1 <= 100),
  u2 numeric NOT NULL CHECK (u2 >= 0 AND u2 <= 100),
  u3 numeric NOT NULL CHECK (u3 >= 0 AND u3 <= 100),
  u4 numeric NOT NULL CHECK (u4 >= 0 AND u4 <= 100),
  pets_er numeric NOT NULL,
  pets_ut numeric NOT NULL,
  pets_total numeric NOT NULL
);

-- Enable RLS
ALTER TABLE public.pets_responses ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for participants to submit questionnaire)
CREATE POLICY "Anyone can insert PETS responses"
ON public.pets_responses
FOR INSERT
TO public
WITH CHECK (true);

-- Only admins can view (for researchers - will be used later when admin system is implemented)
CREATE POLICY "Public can view PETS responses"
ON public.pets_responses
FOR SELECT
TO public
USING (true);