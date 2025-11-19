-- Create table for formality and feedback responses
CREATE TABLE public.feedback_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prolific_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  formality NUMERIC NOT NULL,
  voice_assistant_feedback TEXT NOT NULL,
  experiment_feedback TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(prolific_id, call_id)
);

-- Enable Row Level Security
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert feedback responses
CREATE POLICY "Anyone can insert feedback responses"
ON public.feedback_responses
FOR INSERT
TO anon
WITH CHECK (true);

-- Block client reads on feedback responses
CREATE POLICY "Block client reads on feedback"
ON public.feedback_responses
FOR SELECT
TO anon
USING (false);

-- No deletes allowed on feedback responses
CREATE POLICY "No deletes allowed on feedback"
ON public.feedback_responses
FOR DELETE
TO anon
USING (false);