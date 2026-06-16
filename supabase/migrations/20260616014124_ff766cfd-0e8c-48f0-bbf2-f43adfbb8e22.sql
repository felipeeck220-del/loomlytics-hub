DROP POLICY IF EXISTS "Tenant can view stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Tenant can insert stock movements" ON public.stock_movements;

CREATE POLICY "Tenant can view stock movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Tenant can insert stock movements"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));