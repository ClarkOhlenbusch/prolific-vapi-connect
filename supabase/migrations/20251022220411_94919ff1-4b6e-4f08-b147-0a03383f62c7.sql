-- First, delete duplicate entries, keeping only the earliest one for each (prolific_id, call_id) pair
DELETE FROM participant_calls
WHERE id NOT IN (
  SELECT DISTINCT ON (prolific_id, call_id) id
  FROM participant_calls
  ORDER BY prolific_id, call_id, created_at ASC
);

-- Now add the unique constraint to prevent future duplicates
ALTER TABLE participant_calls 
ADD CONSTRAINT unique_prolific_call UNIQUE (prolific_id, call_id);