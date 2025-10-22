-- Remove the UPDATE policy to make pets_responses insert-only
DROP POLICY IF EXISTS "Anyone can update their PETS responses" ON public.pets_responses;