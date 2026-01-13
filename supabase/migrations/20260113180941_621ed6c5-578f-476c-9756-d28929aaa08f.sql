-- Drop the old blocking SELECT policies that conflict with researcher access
DROP POLICY IF EXISTS "Block client reads on experiment responses" ON public.experiment_responses;
DROP POLICY IF EXISTS "Block client reads on demographics" ON public.demographics;
DROP POLICY IF EXISTS "Block client reads" ON public.participant_calls;
DROP POLICY IF EXISTS "Service role only read" ON public.participant_calls;
DROP POLICY IF EXISTS "Block client reads on navigation events" ON public.navigation_events;
DROP POLICY IF EXISTS "Block client reads on responses" ON public.pets_responses;
DROP POLICY IF EXISTS "Block client reads on feedback" ON public.feedback_responses;
DROP POLICY IF EXISTS "Block client reads on intention" ON public.intention;
DROP POLICY IF EXISTS "Block client reads on withdrawal requests" ON public.data_withdrawal_requests;
DROP POLICY IF EXISTS "No public reads" ON public.no_consent_feedback;

-- The researcher policies already exist from previous migration:
-- "Researchers can view experiment responses", "Researchers can view demographics", etc.
-- These use is_researcher(auth.uid()) which properly restricts access to authenticated researchers only

-- Add explicit denial for non-researchers by recreating policies that deny anonymous/non-researcher access
-- The existing researcher policies use is_researcher() which returns false for non-researchers,
-- so they already effectively block non-researcher access