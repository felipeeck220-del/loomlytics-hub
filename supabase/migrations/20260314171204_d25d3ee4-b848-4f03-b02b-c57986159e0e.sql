-- Fix the overly permissive INSERT policy on companies
-- Drop the "Anyone can insert company" policy with WITH CHECK (true)
DROP POLICY IF EXISTS "Anyone can insert company" ON public.companies;

-- Replace with a policy that only allows authenticated users to insert
-- (the edge function uses service_role so it bypasses RLS anyway)
CREATE POLICY "Authenticated users can insert company"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (true);