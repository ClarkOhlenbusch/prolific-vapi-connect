-- Add voice assistant familiarity columns to demographics table
ALTER TABLE public.demographics
ADD COLUMN voice_assistant_familiarity numeric,
ADD COLUMN voice_assistant_usage_frequency numeric;