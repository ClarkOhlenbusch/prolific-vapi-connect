-- Create changelog entries table
CREATE TABLE public.changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  release_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id)
);

-- Create changelog changes table (one entry can have multiple changes)
CREATE TABLE public.changelog_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.changelog_entries(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('added', 'changed', 'fixed', 'removed')),
  description text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog_changes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for changelog_entries
CREATE POLICY "Researchers can view changelog entries"
ON public.changelog_entries FOR SELECT
USING (is_researcher(auth.uid()));

CREATE POLICY "Researchers can insert changelog entries"
ON public.changelog_entries FOR INSERT
WITH CHECK (is_researcher(auth.uid()));

CREATE POLICY "Researchers can update changelog entries"
ON public.changelog_entries FOR UPDATE
USING (is_researcher(auth.uid()));

CREATE POLICY "Super admins can delete changelog entries"
ON public.changelog_entries FOR DELETE
USING (is_super_admin(auth.uid()));

-- RLS Policies for changelog_changes
CREATE POLICY "Researchers can view changelog changes"
ON public.changelog_changes FOR SELECT
USING (is_researcher(auth.uid()));

CREATE POLICY "Researchers can insert changelog changes"
ON public.changelog_changes FOR INSERT
WITH CHECK (is_researcher(auth.uid()));

CREATE POLICY "Researchers can update changelog changes"
ON public.changelog_changes FOR UPDATE
USING (is_researcher(auth.uid()));

CREATE POLICY "Super admins can delete changelog changes"
ON public.changelog_changes FOR DELETE
USING (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_changelog_entries_updated_at
BEFORE UPDATE ON public.changelog_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();