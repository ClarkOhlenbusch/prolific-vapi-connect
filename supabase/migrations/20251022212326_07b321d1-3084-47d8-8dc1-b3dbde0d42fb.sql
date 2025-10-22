-- Update pets_responses table to support UPSERT by adding unique constraint
-- Drop existing table and recreate with proper constraints for UPSERT
ALTER TABLE public.pets_responses DROP CONSTRAINT IF EXISTS pets_responses_prolific_id_call_id_key;

-- Add unique constraint on prolific_id and call_id combination to enable UPSERT
ALTER TABLE public.pets_responses ADD CONSTRAINT pets_responses_prolific_id_call_id_key UNIQUE (prolific_id, call_id);

-- Update RLS policy to allow UPDATE operations
CREATE POLICY "Anyone can update their PETS responses"
ON public.pets_responses
FOR UPDATE
USING (true)
WITH CHECK (true);