-- Create navigation_events table to track back button clicks and time per page
CREATE TABLE public.navigation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  prolific_id TEXT NOT NULL,
  call_id TEXT,
  page_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  time_on_page_seconds NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security
ALTER TABLE public.navigation_events ENABLE ROW LEVEL SECURITY;

-- Create policies for navigation events
CREATE POLICY "Anyone can insert navigation events" 
ON public.navigation_events 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Block client reads on navigation events" 
ON public.navigation_events 
FOR SELECT 
USING (false);

CREATE POLICY "No deletes allowed on navigation events" 
ON public.navigation_events 
FOR DELETE 
USING (false);

CREATE POLICY "No updates allowed on navigation events" 
ON public.navigation_events 
FOR UPDATE 
USING (false);