
-- Drop the existing UPDATE policy on profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Recreate with WITH CHECK that prevents company_id and role modification
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE TO authenticated
USING ((user_id = auth.uid()) AND (company_id = get_user_company_id()))
WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id()));
