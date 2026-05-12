-- Drop old policies that used the auth.users metadata approach
DROP POLICY IF EXISTS "Users can view freights from their company" ON public.outsource_freights;
DROP POLICY IF EXISTS "Users can insert freights to their company" ON public.outsource_freights;
DROP POLICY IF EXISTS "Users can update freights from their company" ON public.outsource_freights;
DROP POLICY IF EXISTS "Users can delete freights from their company" ON public.outsource_freights;

-- Create new policies using get_user_company_id()
CREATE POLICY "Users can view freights from their company" ON public.outsource_freights
  FOR SELECT USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert freights to their company" ON public.outsource_freights
  FOR INSERT WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update freights from their company" ON public.outsource_freights
  FOR UPDATE USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete freights from their company" ON public.outsource_freights
  FOR DELETE USING (company_id = get_user_company_id());
