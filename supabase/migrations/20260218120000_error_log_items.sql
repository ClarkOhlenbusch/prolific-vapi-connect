-- Error log backlog for unresolved researcher issues.
CREATE TABLE public.error_log_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  changelog_version_ref text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_error_log_items_status_priority_updated_at
  ON public.error_log_items (status, priority, updated_at DESC);

CREATE INDEX idx_error_log_items_updated_at
  ON public.error_log_items (updated_at DESC);

ALTER TABLE public.error_log_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researchers can view error log items"
ON public.error_log_items
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can insert own error log items"
ON public.error_log_items
FOR INSERT
TO authenticated
WITH CHECK (public.is_researcher(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Researchers can update error log items"
ON public.error_log_items
FOR UPDATE
TO authenticated
USING (public.is_researcher(auth.uid()))
WITH CHECK (public.is_researcher(auth.uid()));

CREATE POLICY "Super admins can delete error log items"
ON public.error_log_items
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.error_log_items_set_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status = 'resolved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'resolved' OR OLD.resolved_at IS NULL) THEN
    NEW.resolved_at := now();
  ELSIF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER set_error_log_items_timestamps
BEFORE INSERT OR UPDATE ON public.error_log_items
FOR EACH ROW
EXECUTE FUNCTION public.error_log_items_set_timestamps();
