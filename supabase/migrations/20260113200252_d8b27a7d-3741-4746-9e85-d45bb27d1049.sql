-- Add batch_label column to experiment_responses
ALTER TABLE public.experiment_responses 
ADD COLUMN batch_label text DEFAULT NULL;

-- Insert current_batch_label setting if it doesn't exist
INSERT INTO public.experiment_settings (setting_key, setting_value, updated_at)
VALUES ('current_batch_label', '', now())
ON CONFLICT DO NOTHING;