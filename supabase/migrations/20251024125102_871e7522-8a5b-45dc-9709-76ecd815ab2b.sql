-- Add columns to track attention check responses
ALTER TABLE public.pets_responses
ADD COLUMN attention_check_1 numeric,
ADD COLUMN attention_check_2 numeric,
ADD COLUMN attention_check_3 numeric,
ADD COLUMN attention_check_1_expected numeric,
ADD COLUMN attention_check_2_expected numeric,
ADD COLUMN attention_check_3_expected numeric;