-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can manage client_invoices of their company" ON public.client_invoices;
DROP POLICY IF EXISTS "Users can manage client_invoice_items of their company" ON public.client_invoice_items;

-- Criar novas políticas usando get_user_company_id()
CREATE POLICY "Users can manage client_invoices of their company"
ON public.client_invoices
FOR ALL
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can manage client_invoice_items of their company"
ON public.client_invoice_items
FOR ALL
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());

-- Garantir privilégios
GRANT ALL ON public.client_invoices TO authenticated;
GRANT ALL ON public.client_invoices TO service_role;
GRANT ALL ON public.client_invoice_items TO authenticated;
GRANT ALL ON public.client_invoice_items TO service_role;
