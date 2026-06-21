-- Fix cylinders: wrong FK (auth.users) and missing WITH CHECK on RLS policy
ALTER TABLE public.cylinders DROP CONSTRAINT IF EXISTS cylinders_company_id_fkey;
ALTER TABLE public.cylinders
  ADD CONSTRAINT cylinders_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Users can manage cylinders for their company" ON public.cylinders;
CREATE POLICY "Users can manage cylinders for their company"
  ON public.cylinders
  FOR ALL
  TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cylinders TO authenticated;
GRANT ALL ON public.cylinders TO service_role;