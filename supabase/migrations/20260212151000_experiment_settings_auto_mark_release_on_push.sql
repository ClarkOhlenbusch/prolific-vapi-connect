-- Add default push workflow toggle so researchers can control release state automation from the UI.
INSERT INTO public.experiment_settings (setting_key, setting_value, updated_at)
VALUES ('auto_mark_release_on_push', 'true', now())
ON CONFLICT (setting_key) DO NOTHING;
