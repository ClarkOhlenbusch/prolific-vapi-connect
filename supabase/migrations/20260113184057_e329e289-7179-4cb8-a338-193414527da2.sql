-- Create experiment_settings table for storing global configuration
CREATE TABLE public.experiment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID
);

-- Insert default setting (informal is currently active based on .env)
INSERT INTO public.experiment_settings (setting_key, setting_value) 
VALUES ('active_assistant_type', 'informal');

-- Enable RLS
ALTER TABLE public.experiment_settings ENABLE ROW LEVEL SECURITY;

-- Researchers can read settings
CREATE POLICY "Researchers can read settings"
ON public.experiment_settings FOR SELECT
USING (public.is_researcher(auth.uid()));

-- Only super admins can update settings
CREATE POLICY "Super admins can update settings"
ON public.experiment_settings FOR UPDATE
USING (public.is_super_admin(auth.uid()));

-- Add assistant_type column to experiment_responses
ALTER TABLE public.experiment_responses 
ADD COLUMN assistant_type TEXT DEFAULT NULL;

-- Create validation trigger for assistant_type instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_assistant_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assistant_type IS NOT NULL AND NEW.assistant_type NOT IN ('formal', 'informal') THEN
    RAISE EXCEPTION 'assistant_type must be formal, informal, or null';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_assistant_type_trigger
BEFORE INSERT OR UPDATE ON public.experiment_responses
FOR EACH ROW
EXECUTE FUNCTION public.validate_assistant_type();