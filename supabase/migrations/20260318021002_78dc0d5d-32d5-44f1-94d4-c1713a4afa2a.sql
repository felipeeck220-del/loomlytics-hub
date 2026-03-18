
CREATE POLICY "Users can update own company_settings"
ON public.company_settings
FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());
