-- Add communication_style_feedback column to experiment_responses
ALTER TABLE public.experiment_responses 
ADD COLUMN communication_style_feedback text NOT NULL DEFAULT 'Not provided';