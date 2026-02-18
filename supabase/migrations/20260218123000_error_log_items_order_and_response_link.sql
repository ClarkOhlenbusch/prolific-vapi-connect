-- Add manual ordering + optional response link support to error_log_items.
ALTER TABLE public.error_log_items
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_id uuid REFERENCES public.experiment_responses(id) ON DELETE SET NULL;

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY CASE WHEN status = 'resolved' THEN 'resolved' ELSE 'active' END
      ORDER BY
        CASE
          WHEN status = 'resolved' THEN 0
          WHEN priority = 'critical' THEN 1
          WHEN priority = 'high' THEN 2
          WHEN priority = 'medium' THEN 3
          WHEN priority = 'low' THEN 4
          ELSE 5
        END,
        COALESCE(resolved_at, updated_at) DESC,
        created_at DESC,
        id
    ) - 1 AS next_order
  FROM public.error_log_items
)
UPDATE public.error_log_items AS e
SET display_order = ordered.next_order
FROM ordered
WHERE ordered.id = e.id;

CREATE INDEX IF NOT EXISTS idx_error_log_items_status_display_order
  ON public.error_log_items (status, display_order ASC);

CREATE INDEX IF NOT EXISTS idx_error_log_items_response_id
  ON public.error_log_items (response_id);
