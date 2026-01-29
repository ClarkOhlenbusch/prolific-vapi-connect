-- Create researcher activity logs table
CREATE TABLE public.researcher_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.researcher_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only authenticated researchers can view logs
CREATE POLICY "Researchers can view activity logs"
  ON public.researcher_activity_logs
  FOR SELECT
  TO authenticated
  USING (public.is_researcher(auth.uid()));

-- Allow researchers to insert their own logs
CREATE POLICY "Researchers can insert own logs"
  ON public.researcher_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_researcher(auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_researcher_activity_logs_user_id ON public.researcher_activity_logs(user_id);
CREATE INDEX idx_researcher_activity_logs_created_at ON public.researcher_activity_logs(created_at DESC);