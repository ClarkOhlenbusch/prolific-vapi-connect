-- Create batches table
CREATE TABLE public.experiment_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.experiment_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Researchers can view batches" 
  ON public.experiment_batches 
  FOR SELECT 
  USING (is_researcher(auth.uid()));

CREATE POLICY "Super admins can insert batches" 
  ON public.experiment_batches 
  FOR INSERT 
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update batches" 
  ON public.experiment_batches 
  FOR UPDATE 
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete batches" 
  ON public.experiment_batches 
  FOR DELETE 
  USING (is_super_admin(auth.uid()));

-- Create a function to ensure only one active batch
CREATE OR REPLACE FUNCTION public.ensure_single_active_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Deactivate all other batches
    UPDATE public.experiment_batches
    SET is_active = false
    WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to maintain single active batch
CREATE TRIGGER maintain_single_active_batch
  BEFORE INSERT OR UPDATE ON public.experiment_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_active_batch();