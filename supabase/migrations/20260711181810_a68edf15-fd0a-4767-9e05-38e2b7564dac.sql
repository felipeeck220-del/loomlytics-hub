-- Fix multi-tenant RLS on sinker_inventory and sinker_transactions (were qual=true, leaking across companies)
DROP POLICY IF EXISTS "Users can manage sinker inventory for their company" ON public.sinker_inventory;
DROP POLICY IF EXISTS "Users can manage sinker transactions for their company" ON public.sinker_transactions;

CREATE POLICY "tenant all sinker_inventory" ON public.sinker_inventory
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "tenant all sinker_transactions" ON public.sinker_transactions
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());