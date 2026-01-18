-- Create table to track participant condition assignments
CREATE TABLE IF NOT EXISTS public.participant_condition_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prolific_id TEXT NOT NULL UNIQUE,
  assigned_condition TEXT NOT NULL CHECK (assigned_condition IN ('formal', 'informal')),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.participant_condition_assignments ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role can manage assignments"
  ON public.participant_condition_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX idx_participant_condition_assignments_prolific_id 
  ON public.participant_condition_assignments(prolific_id);

-- Replace the function to check for existing assignments first
CREATE OR REPLACE FUNCTION public.get_next_condition_assignment(p_prolific_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alternating_enabled BOOLEAN;
  v_formal_count INTEGER;
  v_informal_count INTEGER;
  v_offset_count INTEGER;
  v_offset_type TEXT;
  v_static_type TEXT;
  v_assigned_condition TEXT;
  v_is_real_participant BOOLEAN;
  v_used_offset BOOLEAN := FALSE;
  v_existing_assignment TEXT;
BEGIN
  -- Check if this is a real participant (24-char Prolific ID)
  v_is_real_participant := (p_prolific_id IS NOT NULL AND length(p_prolific_id) = 24);
  
  -- Check if this participant already has an assignment
  SELECT assigned_condition INTO v_existing_assignment
  FROM participant_condition_assignments
  WHERE prolific_id = p_prolific_id;
  
  IF v_existing_assignment IS NOT NULL THEN
    -- Return existing assignment without incrementing counters
    SELECT 
      (SELECT setting_value::integer FROM experiment_settings WHERE setting_key = 'formal_participant_count'),
      (SELECT setting_value::integer FROM experiment_settings WHERE setting_key = 'informal_participant_count'),
      (SELECT setting_value::integer FROM experiment_settings WHERE setting_key = 'condition_offset_count')
    INTO v_formal_count, v_informal_count, v_offset_count;
    
    RETURN jsonb_build_object(
      'assigned_condition', v_existing_assignment,
      'formal_count', COALESCE(v_formal_count, 0),
      'informal_count', COALESCE(v_informal_count, 0),
      'offset_remaining', COALESCE(v_offset_count, 0),
      'is_real_participant', v_is_real_participant,
      'used_offset', FALSE,
      'was_cached', TRUE
    );
  END IF;
  
  -- Lock and fetch all settings atomically using FOR UPDATE
  SELECT 
    (SELECT setting_value::boolean FROM experiment_settings WHERE setting_key = 'alternating_mode_enabled' FOR UPDATE),
    (SELECT setting_value::integer FROM experiment_settings WHERE setting_key = 'formal_participant_count' FOR UPDATE),
    (SELECT setting_value::integer FROM experiment_settings WHERE setting_key = 'informal_participant_count' FOR UPDATE),
    (SELECT setting_value::integer FROM experiment_settings WHERE setting_key = 'condition_offset_count' FOR UPDATE),
    (SELECT setting_value FROM experiment_settings WHERE setting_key = 'condition_offset_type' FOR UPDATE),
    (SELECT setting_value FROM experiment_settings WHERE setting_key = 'active_assistant_type' FOR UPDATE)
  INTO v_alternating_enabled, v_formal_count, v_informal_count, v_offset_count, v_offset_type, v_static_type;
  
  -- Set defaults if null
  v_alternating_enabled := COALESCE(v_alternating_enabled, FALSE);
  v_formal_count := COALESCE(v_formal_count, 0);
  v_informal_count := COALESCE(v_informal_count, 0);
  v_offset_count := COALESCE(v_offset_count, 0);
  v_offset_type := COALESCE(v_offset_type, 'formal');
  v_static_type := COALESCE(v_static_type, 'formal');
  
  -- Determine assignment based on mode and participant type
  IF NOT v_is_real_participant THEN
    -- Non-real participants get static type, no counter updates, no storage
    v_assigned_condition := v_static_type;
  ELSIF NOT v_alternating_enabled THEN
    -- Static mode for real participants
    v_assigned_condition := v_static_type;
  ELSIF v_offset_count > 0 THEN
    -- Use offset if available
    v_assigned_condition := v_offset_type;
    v_used_offset := TRUE;
    
    -- Decrement offset and increment appropriate counter
    UPDATE experiment_settings SET setting_value = (v_offset_count - 1)::text 
    WHERE setting_key = 'condition_offset_count';
    
    IF v_offset_type = 'formal' THEN
      UPDATE experiment_settings SET setting_value = (v_formal_count + 1)::text 
      WHERE setting_key = 'formal_participant_count';
      v_formal_count := v_formal_count + 1;
    ELSE
      UPDATE experiment_settings SET setting_value = (v_informal_count + 1)::text 
      WHERE setting_key = 'informal_participant_count';
      v_informal_count := v_informal_count + 1;
    END IF;
  ELSE
    -- Alternating: assign to whichever has fewer, formal wins ties
    IF v_formal_count <= v_informal_count THEN
      v_assigned_condition := 'formal';
      UPDATE experiment_settings SET setting_value = (v_formal_count + 1)::text 
      WHERE setting_key = 'formal_participant_count';
      v_formal_count := v_formal_count + 1;
    ELSE
      v_assigned_condition := 'informal';
      UPDATE experiment_settings SET setting_value = (v_informal_count + 1)::text 
      WHERE setting_key = 'informal_participant_count';
      v_informal_count := v_informal_count + 1;
    END IF;
  END IF;
  
  -- Store the assignment for real participants so they get the same condition on refresh
  IF v_is_real_participant THEN
    INSERT INTO participant_condition_assignments (prolific_id, assigned_condition)
    VALUES (p_prolific_id, v_assigned_condition)
    ON CONFLICT (prolific_id) DO NOTHING;
  END IF;
  
  -- Return result as JSONB
  RETURN jsonb_build_object(
    'assigned_condition', v_assigned_condition,
    'formal_count', v_formal_count,
    'informal_count', v_informal_count,
    'offset_remaining', CASE WHEN v_used_offset THEN v_offset_count - 1 ELSE v_offset_count END,
    'is_real_participant', v_is_real_participant,
    'used_offset', v_used_offset,
    'was_cached', FALSE
  );
END;
$$;