-- Create researcher_role enum
CREATE TYPE public.researcher_role AS ENUM ('super_admin', 'viewer');

-- Create researcher_roles table
CREATE TABLE public.researcher_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role researcher_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.researcher_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer functions to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_researcher(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.researcher_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.get_researcher_role(_user_id UUID)
RETURNS researcher_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.researcher_roles WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.researcher_roles 
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- RLS policies for researcher_roles table
CREATE POLICY "Researchers can view their own role"
ON public.researcher_roles
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Super admins can insert roles"
ON public.researcher_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update roles"
ON public.researcher_roles
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete roles"
ON public.researcher_roles
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Create archive table for soft deletes
CREATE TABLE public.archived_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_table TEXT NOT NULL,
    original_id UUID NOT NULL,
    archived_data JSONB NOT NULL,
    archived_by UUID REFERENCES auth.users(id) NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    archive_reason TEXT
);

-- Enable RLS on archive table
ALTER TABLE public.archived_responses ENABLE ROW LEVEL SECURITY;

-- Only super admins can view and manage archived data
CREATE POLICY "Super admins can view archived responses"
ON public.archived_responses
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert archived responses"
ON public.archived_responses
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete archived responses"
ON public.archived_responses
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Add SELECT policies for researchers on data tables
CREATE POLICY "Researchers can view experiment responses"
ON public.experiment_responses
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view demographics"
ON public.demographics
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view participant calls"
ON public.participant_calls
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view navigation events"
ON public.navigation_events
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view pets responses"
ON public.pets_responses
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view feedback responses"
ON public.feedback_responses
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view intention"
ON public.intention
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view withdrawal requests"
ON public.data_withdrawal_requests
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

CREATE POLICY "Researchers can view no consent feedback"
ON public.no_consent_feedback
FOR SELECT
TO authenticated
USING (public.is_researcher(auth.uid()));

-- Super admin UPDATE policies (for editing data)
CREATE POLICY "Super admins can update experiment responses"
ON public.experiment_responses
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update demographics"
ON public.demographics
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update participant calls"
ON public.participant_calls
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));