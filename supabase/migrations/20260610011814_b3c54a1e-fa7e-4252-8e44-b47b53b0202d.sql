-- Primeiro, garantimos que o RLS está habilitado
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoice_items ENABLE ROW LEVEL SECURITY;

-- Removemos políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Users can manage client_invoices of their company" ON public.client_invoices;
DROP POLICY IF EXISTS "Users can manage client_invoice_items of their company" ON public.client_invoice_items;

-- Criamos políticas robustas usando a função get_user_company_id() se existir, 
-- ou fallback para o JWT diretamente com cast seguro.
-- Nota: O erro RLS em INSERT geralmente ocorre quando o WITH CHECK falha.

CREATE POLICY "Users can manage client_invoices of their company" ON public.client_invoices 
FOR ALL 
TO authenticated
USING (company_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'company_id')::uuid)
WITH CHECK (company_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'company_id')::uuid);

CREATE POLICY "Users can manage client_invoice_items of their company" ON public.client_invoice_items 
FOR ALL 
TO authenticated
USING (company_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'company_id')::uuid)
WITH CHECK (company_id = (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'company_id')::uuid);

-- Garantimos que os papéis tenham acesso às tabelas
GRANT ALL ON public.client_invoices TO authenticated;
GRANT ALL ON public.client_invoices TO service_role;
GRANT ALL ON public.client_invoice_items TO authenticated;
GRANT ALL ON public.client_invoice_items TO service_role;
