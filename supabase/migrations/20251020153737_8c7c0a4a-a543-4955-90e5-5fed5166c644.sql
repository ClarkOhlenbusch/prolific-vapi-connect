-- Create table to track Prolific participants and their VAPI call IDs
CREATE TABLE public.participant_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prolific_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_participant_calls_prolific_id ON public.participant_calls(prolific_id);
CREATE INDEX idx_participant_calls_call_id ON public.participant_calls(call_id);

-- Enable Row Level Security
ALTER TABLE public.participant_calls ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for research participants)
CREATE POLICY "Anyone can insert participant calls" 
ON public.participant_calls 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone to view (for research purposes)
CREATE POLICY "Anyone can view participant calls" 
ON public.participant_calls 
FOR SELECT 
USING (true);