DROP POLICY IF EXISTS "Users can manage client_invoices of their company" ON public.client_invoices;
CREATE POLICY "Users can manage client_invoices of their company" ON public.client_invoices 
FOR ALL 
USING (company_id = ((auth.jwt() ->> 'company_id'::text))::uuid)
WITH CHECK (company_id = ((auth.jwt() ->> 'company_id'::text))::uuid);

DROP POLICY IF EXISTS "Users can manage client_invoice_items of their company" ON public.client_invoice_items;
CREATE POLICY "Users can manage client_invoice_items of their company" ON public.client_invoice_items 
FOR ALL 
USING (company_id = ((auth.jwt() ->> 'company_id'::text))::uuid)
WITH CHECK (company_id = ((auth.jwt() ->> 'company_id'::text))::uuid);
