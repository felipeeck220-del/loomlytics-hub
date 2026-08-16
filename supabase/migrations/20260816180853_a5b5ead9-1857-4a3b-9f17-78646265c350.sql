GRANT SELECT, INSERT ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;

DROP POLICY IF EXISTS "Users can see their company manual movements" ON public.manual_stock_movements;
CREATE POLICY "Users can see their company manual movements"
ON public.manual_stock_movements
FOR SELECT
TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert their company manual movements" ON public.manual_stock_movements;
CREATE POLICY "Users can insert their company manual movements"
ON public.manual_stock_movements
FOR INSERT
TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

ALTER TABLE public.manual_stock_movements ENABLE ROW LEVEL SECURITY;