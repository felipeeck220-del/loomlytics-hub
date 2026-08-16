DROP POLICY IF EXISTS "Users can see their company manual movements" ON public.manual_stock_movements;
CREATE POLICY "Users can see their company manual movements"
ON public.manual_stock_movements
FOR SELECT
TO authenticated
USING (company_id = (SELECT company_id FROM public.user_active_company WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert their company manual movements" ON public.manual_stock_movements;
CREATE POLICY "Users can insert their company manual movements"
ON public.manual_stock_movements
FOR INSERT
TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.user_active_company WHERE user_id = auth.uid()));