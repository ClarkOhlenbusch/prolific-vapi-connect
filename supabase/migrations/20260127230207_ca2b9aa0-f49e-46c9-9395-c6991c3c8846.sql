-- Add prolific_id column to no_consent_feedback table
ALTER TABLE public.no_consent_feedback
ADD COLUMN prolific_id text;