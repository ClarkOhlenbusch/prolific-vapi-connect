-- Add TIPI (Ten-Item Personality Inventory) columns to experiment_responses table

-- TIPI individual items (1-7 scale)
ALTER TABLE public.experiment_responses 
ADD COLUMN IF NOT EXISTS tipi_1 integer,
ADD COLUMN IF NOT EXISTS tipi_2 integer,
ADD COLUMN IF NOT EXISTS tipi_3 integer,
ADD COLUMN IF NOT EXISTS tipi_4 integer,
ADD COLUMN IF NOT EXISTS tipi_5 integer,
ADD COLUMN IF NOT EXISTS tipi_6 integer,
ADD COLUMN IF NOT EXISTS tipi_7 integer,
ADD COLUMN IF NOT EXISTS tipi_8 integer,
ADD COLUMN IF NOT EXISTS tipi_9 integer,
ADD COLUMN IF NOT EXISTS tipi_10 integer;

-- TIPI item positions (for order tracking)
ALTER TABLE public.experiment_responses 
ADD COLUMN IF NOT EXISTS tipi_1_position integer,
ADD COLUMN IF NOT EXISTS tipi_2_position integer,
ADD COLUMN IF NOT EXISTS tipi_3_position integer,
ADD COLUMN IF NOT EXISTS tipi_4_position integer,
ADD COLUMN IF NOT EXISTS tipi_5_position integer,
ADD COLUMN IF NOT EXISTS tipi_6_position integer,
ADD COLUMN IF NOT EXISTS tipi_7_position integer,
ADD COLUMN IF NOT EXISTS tipi_8_position integer,
ADD COLUMN IF NOT EXISTS tipi_9_position integer,
ADD COLUMN IF NOT EXISTS tipi_10_position integer;

-- TIPI attention check
ALTER TABLE public.experiment_responses 
ADD COLUMN IF NOT EXISTS tipi_attention_check_1 integer,
ADD COLUMN IF NOT EXISTS tipi_attention_check_1_expected integer,
ADD COLUMN IF NOT EXISTS tipi_attention_check_1_position integer;

-- TIPI Big Five subscale scores (calculated averages after reverse-scoring)
-- Scale: 1-7 (average of 2 items per subscale)
ALTER TABLE public.experiment_responses 
ADD COLUMN IF NOT EXISTS tipi_extraversion numeric,
ADD COLUMN IF NOT EXISTS tipi_agreeableness numeric,
ADD COLUMN IF NOT EXISTS tipi_conscientiousness numeric,
ADD COLUMN IF NOT EXISTS tipi_emotional_stability numeric,
ADD COLUMN IF NOT EXISTS tipi_openness numeric;