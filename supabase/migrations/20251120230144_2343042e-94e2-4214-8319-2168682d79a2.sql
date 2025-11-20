-- Create data withdrawal requests table
CREATE TABLE public.data_withdrawal_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  prolific_id text NOT NULL,
  session_token uuid NOT NULL,
  call_id text NOT NULL
);

-- Enable RLS
ALTER TABLE public.data_withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert withdrawal requests
CREATE POLICY "Anyone can insert withdrawal requests"
ON public.data_withdrawal_requests
FOR INSERT
TO anon
WITH CHECK (true);

-- Block client reads on withdrawal requests
CREATE POLICY "Block client reads on withdrawal requests"
ON public.data_withdrawal_requests
FOR SELECT
TO anon
USING (false);

-- No deletes allowed on withdrawal requests
CREATE POLICY "No deletes allowed on withdrawal requests"
ON public.data_withdrawal_requests
FOR DELETE
TO anon
USING (false);

-- No updates allowed on withdrawal requests
CREATE POLICY "No updates allowed on withdrawal requests"
ON public.data_withdrawal_requests
FOR UPDATE
TO anon
USING (false);