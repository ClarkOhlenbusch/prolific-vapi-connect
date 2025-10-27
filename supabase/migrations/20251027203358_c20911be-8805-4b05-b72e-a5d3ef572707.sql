-- Add TIAS columns to pets_responses table
ALTER TABLE public.pets_responses 
ADD COLUMN IF NOT EXISTS tias_1 numeric,
ADD COLUMN IF NOT EXISTS tias_2 numeric,
ADD COLUMN IF NOT EXISTS tias_3 numeric,
ADD COLUMN IF NOT EXISTS tias_4 numeric,
ADD COLUMN IF NOT EXISTS tias_5 numeric,
ADD COLUMN IF NOT EXISTS tias_6 numeric,
ADD COLUMN IF NOT EXISTS tias_7 numeric,
ADD COLUMN IF NOT EXISTS tias_8 numeric,
ADD COLUMN IF NOT EXISTS tias_9 numeric,
ADD COLUMN IF NOT EXISTS tias_10 numeric,
ADD COLUMN IF NOT EXISTS tias_11 numeric,
ADD COLUMN IF NOT EXISTS tias_12 numeric,
ADD COLUMN IF NOT EXISTS tias_total numeric;

-- Add comment explaining the TIAS scale
COMMENT ON COLUMN public.pets_responses.tias_1 IS 'Trust in Automation Scale item 1 (1-7 scale, reverse scored)';
COMMENT ON COLUMN public.pets_responses.tias_2 IS 'Trust in Automation Scale item 2 (1-7 scale, reverse scored)';
COMMENT ON COLUMN public.pets_responses.tias_3 IS 'Trust in Automation Scale item 3 (1-7 scale, reverse scored)';
COMMENT ON COLUMN public.pets_responses.tias_4 IS 'Trust in Automation Scale item 4 (1-7 scale, reverse scored)';
COMMENT ON COLUMN public.pets_responses.tias_5 IS 'Trust in Automation Scale item 5 (1-7 scale, reverse scored)';
COMMENT ON COLUMN public.pets_responses.tias_6 IS 'Trust in Automation Scale item 6 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_7 IS 'Trust in Automation Scale item 7 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_8 IS 'Trust in Automation Scale item 8 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_9 IS 'Trust in Automation Scale item 9 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_10 IS 'Trust in Automation Scale item 10 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_11 IS 'Trust in Automation Scale item 11 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_12 IS 'Trust in Automation Scale item 12 (1-7 scale)';
COMMENT ON COLUMN public.pets_responses.tias_total IS 'Total TIAS score (average of all items after reverse scoring items 1-5)';