-- Insert new experiment settings for alternating condition assignment
INSERT INTO public.experiment_settings (setting_key, setting_value, updated_at)
VALUES 
  ('alternating_mode_enabled', 'false', now()),
  ('real_participant_count', '0', now()),
  ('formal_participant_count', '0', now()),
  ('informal_participant_count', '0', now()),
  ('condition_offset_count', '0', now()),
  ('condition_offset_type', 'informal', now())
ON CONFLICT (setting_key) DO NOTHING;