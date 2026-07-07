
DROP POLICY IF EXISTS "Platform admins can read email_history" ON public.email_history;
DROP POLICY IF EXISTS "Service role can insert email_history" ON public.email_history;

CREATE POLICY "Company members can read own email_history"
  ON public.email_history FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can insert own email_history"
  ON public.email_history FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() OR public.is_platform_admin(auth.uid()));
