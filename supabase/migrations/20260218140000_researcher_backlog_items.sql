-- Unified researcher backlog (errors + future features).
CREATE TABLE IF NOT EXISTS public.researcher_backlog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('error', 'feature')),
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  display_order integer NOT NULL DEFAULT 0,
  linked_response_id uuid REFERENCES public.experiment_responses(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT researcher_backlog_items_status_by_type_check CHECK (
    (item_type = 'error' AND status IN ('open', 'in_progress', 'resolved'))
    OR
    (item_type = 'feature' AND status IN ('idea', 'planned', 'in_progress', 'shipped'))
  )
);

CREATE INDEX IF NOT EXISTS idx_researcher_backlog_items_type_status_order
  ON public.researcher_backlog_items (item_type, status, display_order ASC);

CREATE INDEX IF NOT EXISTS idx_researcher_backlog_items_linked_response_id
  ON public.researcher_backlog_items (linked_response_id);

CREATE INDEX IF NOT EXISTS idx_researcher_backlog_items_updated_at
  ON public.researcher_backlog_items (updated_at DESC);

ALTER TABLE public.researcher_backlog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Researchers can view backlog items" ON public.researcher_backlog_items;
CREATE POLICY "Researchers can view backlog items"
ON public.researcher_backlog_items
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

DROP POLICY IF EXISTS "Researchers can insert own backlog items" ON public.researcher_backlog_items;
CREATE POLICY "Researchers can insert own backlog items"
ON public.researcher_backlog_items
FOR INSERT
TO authenticated
WITH CHECK (public.is_researcher(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Researchers can update backlog items" ON public.researcher_backlog_items;
CREATE POLICY "Researchers can update backlog items"
ON public.researcher_backlog_items
FOR UPDATE
TO authenticated
USING (public.is_researcher(auth.uid()))
WITH CHECK (public.is_researcher(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete backlog items" ON public.researcher_backlog_items;
CREATE POLICY "Super admins can delete backlog items"
ON public.researcher_backlog_items
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.researcher_backlog_items_set_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status IN ('resolved', 'shipped')
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.completed_at IS NULL)
  THEN
    NEW.completed_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'shipped') THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_researcher_backlog_items_timestamps ON public.researcher_backlog_items;
CREATE TRIGGER set_researcher_backlog_items_timestamps
BEFORE INSERT OR UPDATE ON public.researcher_backlog_items
FOR EACH ROW
EXECUTE FUNCTION public.researcher_backlog_items_set_timestamps();

INSERT INTO public.researcher_backlog_items (
  item_type,
  title,
  details,
  status,
  priority,
  display_order,
  linked_response_id,
  created_by,
  created_at,
  updated_at,
  completed_at
)
SELECT
  'error' AS item_type,
  e.title,
  e.details,
  e.status,
  e.priority,
  COALESCE(e.display_order, 0),
  e.response_id,
  e.created_by,
  e.created_at,
  e.updated_at,
  e.resolved_at
FROM public.error_log_items e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.researcher_backlog_items b
  WHERE b.item_type = 'error'
    AND b.title = e.title
    AND b.created_at = e.created_at
    AND b.created_by = e.created_by
);

-- Keep legacy table as read-only fallback while UI migrates.
DROP POLICY IF EXISTS "Researchers can insert own error log items" ON public.error_log_items;
DROP POLICY IF EXISTS "Researchers can update error log items" ON public.error_log_items;
DROP POLICY IF EXISTS "Super admins can delete error log items" ON public.error_log_items;
