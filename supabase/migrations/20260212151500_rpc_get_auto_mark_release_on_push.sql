-- Expose auto_mark_release_on_push setting to push tooling via anon RPC.
CREATE OR REPLACE FUNCTION public.get_auto_mark_release_on_push()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT setting_value::boolean
      FROM public.experiment_settings
      WHERE setting_key = 'auto_mark_release_on_push'
      LIMIT 1
    ),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.get_auto_mark_release_on_push() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auto_mark_release_on_push() TO anon;
GRANT EXECUTE ON FUNCTION public.get_auto_mark_release_on_push() TO authenticated;
