-- Add TIAS attention check columns to pets_responses table
ALTER TABLE public.pets_responses 
ADD COLUMN IF NOT EXISTS tias_attention_check_1 numeric,
ADD COLUMN IF NOT EXISTS tias_attention_check_2 numeric,
ADD COLUMN IF NOT EXISTS tias_attention_check_3 numeric,
ADD COLUMN IF NOT EXISTS tias_attention_check_1_expected numeric,
ADD COLUMN IF NOT EXISTS tias_attention_check_2_expected numeric,
ADD COLUMN IF NOT EXISTS tias_attention_check_3_expected numeric;

-- Add comments
COMMENT ON COLUMN public.pets_responses.tias_attention_check_1 IS 'TIAS attention check 1 response (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_attention_check_2 IS 'TIAS attention check 2 response (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_attention_check_3 IS 'TIAS attention check 3 response (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_attention_check_1_expected IS 'TIAS attention check 1 expected value';
COMMENT ON COLUMN public.pets_responses.tias_attention_check_2_expected IS 'TIAS attention check 2 expected value';
COMMENT ON COLUMN public.pets_responses.tias_attention_check_3_expected IS 'TIAS attention check 3 expected value';