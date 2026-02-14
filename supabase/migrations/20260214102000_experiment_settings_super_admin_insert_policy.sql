-- Fix: experiment_settings upserts require INSERT permission under RLS.
-- Previously we only allowed UPDATE for super admins, which breaks client-side upserts.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'experiment_settings'
      AND policyname = 'Super admins can insert settings'
  ) THEN
    CREATE POLICY "Super admins can insert settings"
    ON public.experiment_settings FOR INSERT
    WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

