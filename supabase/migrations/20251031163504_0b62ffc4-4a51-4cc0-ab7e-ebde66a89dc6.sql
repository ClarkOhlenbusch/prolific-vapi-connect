-- Drop extra PETS attention check columns (keep only attention_check_1)
ALTER TABLE public.pets_responses 
  DROP COLUMN IF EXISTS attention_check_2,
  DROP COLUMN IF EXISTS attention_check_3,
  DROP COLUMN IF EXISTS attention_check_2_expected,
  DROP COLUMN IF EXISTS attention_check_3_expected;

-- Drop extra TIAS attention check columns (keep only tias_attention_check_1)
ALTER TABLE public.pets_responses
  DROP COLUMN IF EXISTS tias_attention_check_2,
  DROP COLUMN IF EXISTS tias_attention_check_3,
  DROP COLUMN IF EXISTS tias_attention_check_2_expected,
  DROP COLUMN IF EXISTS tias_attention_check_3_expected;