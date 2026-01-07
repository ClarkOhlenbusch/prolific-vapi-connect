
-- Create consolidated experiment_responses table
CREATE TABLE public.experiment_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Identifiers (prolific_id is unique - one submission per participant)
  prolific_id TEXT NOT NULL UNIQUE,
  call_id TEXT NOT NULL,
  call_attempt_number INTEGER NOT NULL DEFAULT 1,
  
  -- PETS items (0-100 scale)
  e1 NUMERIC NOT NULL,
  e2 NUMERIC NOT NULL,
  e3 NUMERIC NOT NULL,
  e4 NUMERIC NOT NULL,
  e5 NUMERIC NOT NULL,
  e6 NUMERIC NOT NULL,
  u1 NUMERIC NOT NULL,
  u2 NUMERIC NOT NULL,
  u3 NUMERIC NOT NULL,
  u4 NUMERIC NOT NULL,
  
  -- PETS positions (1-11, showing display order)
  e1_position INTEGER NOT NULL,
  e2_position INTEGER NOT NULL,
  e3_position INTEGER NOT NULL,
  e4_position INTEGER NOT NULL,
  e5_position INTEGER NOT NULL,
  e6_position INTEGER NOT NULL,
  u1_position INTEGER NOT NULL,
  u2_position INTEGER NOT NULL,
  u3_position INTEGER NOT NULL,
  u4_position INTEGER NOT NULL,
  
  -- PETS attention check
  attention_check_1 NUMERIC,
  attention_check_1_expected NUMERIC,
  attention_check_1_position INTEGER,
  
  -- PETS scores
  pets_er NUMERIC NOT NULL,
  pets_ut NUMERIC NOT NULL,
  pets_total NUMERIC NOT NULL,
  
  -- TIAS items (1-7 scale)
  tias_1 NUMERIC,
  tias_2 NUMERIC,
  tias_3 NUMERIC,
  tias_4 NUMERIC,
  tias_5 NUMERIC,
  tias_6 NUMERIC,
  tias_7 NUMERIC,
  tias_8 NUMERIC,
  tias_9 NUMERIC,
  tias_10 NUMERIC,
  tias_11 NUMERIC,
  tias_12 NUMERIC,
  
  -- TIAS positions (1-13)
  tias_1_position INTEGER,
  tias_2_position INTEGER,
  tias_3_position INTEGER,
  tias_4_position INTEGER,
  tias_5_position INTEGER,
  tias_6_position INTEGER,
  tias_7_position INTEGER,
  tias_8_position INTEGER,
  tias_9_position INTEGER,
  tias_10_position INTEGER,
  tias_11_position INTEGER,
  tias_12_position INTEGER,
  
  -- TIAS attention check
  tias_attention_check_1 NUMERIC,
  tias_attention_check_1_expected NUMERIC,
  tias_attention_check_1_position INTEGER,
  
  -- TIAS score
  tias_total NUMERIC,
  
  -- Intention (1-7 scale)
  intention_1 NUMERIC NOT NULL,
  intention_2 NUMERIC NOT NULL,
  
  -- Formality (1-7 scale)
  formality NUMERIC NOT NULL,
  
  -- Feedback
  voice_assistant_feedback TEXT NOT NULL,
  experiment_feedback TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.experiment_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other tables)
CREATE POLICY "Anyone can insert experiment responses"
ON public.experiment_responses
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Block client reads on experiment responses"
ON public.experiment_responses
FOR SELECT
USING (false);

CREATE POLICY "No deletes allowed on experiment responses"
ON public.experiment_responses
FOR DELETE
USING (false);

CREATE POLICY "No updates allowed on experiment responses"
ON public.experiment_responses
FOR UPDATE
USING (false);

-- Add index for faster lookups
CREATE INDEX idx_experiment_responses_prolific_id ON public.experiment_responses(prolific_id);
CREATE INDEX idx_experiment_responses_call_id ON public.experiment_responses(call_id);
