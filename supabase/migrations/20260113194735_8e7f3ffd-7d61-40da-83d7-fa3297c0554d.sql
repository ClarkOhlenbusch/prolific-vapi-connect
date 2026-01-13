-- Add Godspeed Questionnaire columns to experiment_responses

-- Anthropomorphism (4 items, removed "moving" question)
ALTER TABLE public.experiment_responses
ADD COLUMN godspeed_anthro_1 numeric,
ADD COLUMN godspeed_anthro_2 numeric,
ADD COLUMN godspeed_anthro_3 numeric,
ADD COLUMN godspeed_anthro_4 numeric,
ADD COLUMN godspeed_anthro_1_position integer,
ADD COLUMN godspeed_anthro_2_position integer,
ADD COLUMN godspeed_anthro_3_position integer,
ADD COLUMN godspeed_anthro_4_position integer,
ADD COLUMN godspeed_anthro_total numeric;

-- Likeability (5 items)
ALTER TABLE public.experiment_responses
ADD COLUMN godspeed_like_1 numeric,
ADD COLUMN godspeed_like_2 numeric,
ADD COLUMN godspeed_like_3 numeric,
ADD COLUMN godspeed_like_4 numeric,
ADD COLUMN godspeed_like_5 numeric,
ADD COLUMN godspeed_like_1_position integer,
ADD COLUMN godspeed_like_2_position integer,
ADD COLUMN godspeed_like_3_position integer,
ADD COLUMN godspeed_like_4_position integer,
ADD COLUMN godspeed_like_5_position integer,
ADD COLUMN godspeed_like_total numeric;

-- Perceived Intelligence (5 items)
ALTER TABLE public.experiment_responses
ADD COLUMN godspeed_intel_1 numeric,
ADD COLUMN godspeed_intel_2 numeric,
ADD COLUMN godspeed_intel_3 numeric,
ADD COLUMN godspeed_intel_4 numeric,
ADD COLUMN godspeed_intel_5 numeric,
ADD COLUMN godspeed_intel_1_position integer,
ADD COLUMN godspeed_intel_2_position integer,
ADD COLUMN godspeed_intel_3_position integer,
ADD COLUMN godspeed_intel_4_position integer,
ADD COLUMN godspeed_intel_5_position integer,
ADD COLUMN godspeed_intel_total numeric;

-- Attention check for Godspeed
ALTER TABLE public.experiment_responses
ADD COLUMN godspeed_attention_check_1 numeric,
ADD COLUMN godspeed_attention_check_1_expected numeric,
ADD COLUMN godspeed_attention_check_1_position integer;