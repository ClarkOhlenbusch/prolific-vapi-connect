-- Create function to update updated_at column if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for storing VAPI prompts
CREATE TABLE public.vapi_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  
  -- Core fields
  name TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  
  -- Classification
  condition TEXT CHECK (condition IN ('formal', 'informal')) NOT NULL,
  batch_label TEXT,
  
  -- Version tracking
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id UUID REFERENCES public.vapi_prompts(id),
  
  -- VAPI linking
  vapi_assistant_id TEXT,
  vapi_assistant_name TEXT,
  
  -- Metadata
  notes TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.vapi_prompts ENABLE ROW LEVEL SECURITY;

-- Researchers can view all prompts
CREATE POLICY "Researchers can view prompts"
ON public.vapi_prompts
FOR SELECT
USING (public.is_researcher(auth.uid()));

-- Researchers can insert prompts
CREATE POLICY "Researchers can insert prompts"
ON public.vapi_prompts
FOR INSERT
WITH CHECK (public.is_researcher(auth.uid()));

-- Researchers can update prompts
CREATE POLICY "Researchers can update prompts"
ON public.vapi_prompts
FOR UPDATE
USING (public.is_researcher(auth.uid()));

-- Only super admins can delete
CREATE POLICY "Super admins can delete prompts"
ON public.vapi_prompts
FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- Create updated_at trigger
CREATE TRIGGER update_vapi_prompts_updated_at
BEFORE UPDATE ON public.vapi_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for common queries
CREATE INDEX idx_vapi_prompts_condition ON public.vapi_prompts(condition);
CREATE INDEX idx_vapi_prompts_batch ON public.vapi_prompts(batch_label);
CREATE INDEX idx_vapi_prompts_created_by ON public.vapi_prompts(created_by);