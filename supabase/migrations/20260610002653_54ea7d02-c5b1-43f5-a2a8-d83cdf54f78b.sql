CREATE TYPE public.client_invoice_type AS ENUM ('entrada', 'saida');

CREATE TABLE public.client_invoices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    type public.client_invoice_type NOT NULL,
    invoice_number TEXT NOT NULL,
    issue_date DATE NOT NULL,
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.client_invoice_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    yarn_type_id UUID REFERENCES public.yarn_types(id) ON DELETE SET NULL, -- Para entradas de fio
    article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL, -- Para saídas de malha
    weight_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoice_items ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoices TO authenticated;
GRANT ALL ON public.client_invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoice_items TO authenticated;
GRANT ALL ON public.client_invoice_items TO service_role;

-- Policies
CREATE POLICY "Users can manage client_invoices of their company" ON public.client_invoices
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "Users can manage client_invoice_items of their company" ON public.client_invoice_items
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Trigger para updated_at
CREATE TRIGGER update_client_invoices_updated_at BEFORE UPDATE ON public.client_invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();