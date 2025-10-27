-- Add session expiration column and trigger
ALTER TABLE participant_calls ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;

-- Set expiration for existing rows (24 hours from creation)
UPDATE participant_calls 
SET expires_at = created_at + INTERVAL '24 hours' 
WHERE expires_at IS NULL;

-- Make column NOT NULL after backfilling
ALTER TABLE participant_calls 
ALTER COLUMN expires_at SET NOT NULL;

-- Create trigger to auto-set expiration on insert
CREATE OR REPLACE FUNCTION set_session_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_expiration_trigger
BEFORE INSERT ON participant_calls
FOR EACH ROW
EXECUTE FUNCTION set_session_expiration();

-- Create index for efficient expiration queries
CREATE INDEX idx_participant_calls_expires_at 
ON participant_calls(expires_at) 
WHERE token_used = false;

-- Add explicit DELETE deny policies for research data integrity
CREATE POLICY "No deletes allowed on participant calls"
ON participant_calls
FOR DELETE
USING (false);

CREATE POLICY "No deletes allowed on PETS responses"
ON pets_responses
FOR DELETE
USING (false);

-- Add database-level protection (blocks even service role)
CREATE OR REPLACE FUNCTION prevent_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Deletion not allowed for research data integrity';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_participant_calls_delete
  BEFORE DELETE ON participant_calls
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER prevent_pets_responses_delete
  BEFORE DELETE ON pets_responses
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- Restrict participant_calls SELECT to service role only
DROP POLICY IF EXISTS "Allow read via session_token" ON participant_calls;

CREATE POLICY "Service role only read"
ON participant_calls
FOR SELECT
USING (false);