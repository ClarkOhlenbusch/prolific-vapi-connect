-- Add AI formality score column to experiment_responses
ALTER TABLE public.experiment_responses 
ADD COLUMN ai_formality_score numeric NULL;

-- Add AI formality interpretation for reference
ALTER TABLE public.experiment_responses 
ADD COLUMN ai_formality_interpretation text NULL;

-- Add timestamp for when the AI formality was calculated
ALTER TABLE public.experiment_responses 
ADD COLUMN ai_formality_calculated_at timestamp with time zone NULL;