-- Create table for no-consent feedback
CREATE TABLE public.no_consent_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  feedback TEXT
);

-- Enable RLS
ALTER TABLE public.no_consent_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (no auth required for declining consent)
CREATE POLICY "Anyone can insert no-consent feedback"
ON public.no_consent_feedback
FOR INSERT
WITH CHECK (true);

-- Prevent reads for privacy
CREATE POLICY "No public reads"
ON public.no_consent_feedback
FOR SELECT
USING (false);