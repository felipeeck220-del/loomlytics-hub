
-- 1. Tabela de tipos de fio
CREATE TABLE public.yarn_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  composition text,
  color text,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.yarn_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own yarn_types" ON public.yarn_types FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own yarn_types" ON public.yarn_types FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own yarn_types" ON public.yarn_types FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own yarn_types" ON public.yarn_types FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- 2. Tabela de notas fiscais
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'entrada',
  invoice_number text NOT NULL,
  access_key text,
  client_id uuid REFERENCES public.clients(id),
  client_name text,
  issue_date text NOT NULL,
  total_weight_kg numeric NOT NULL DEFAULT 0,
  total_value numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  observations text,
  created_by_name text,
  created_by_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own invoices" ON public.invoices FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own invoices" ON public.invoices FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own invoices" ON public.invoices FOR DELETE TO authenticated USING (company_id = get_user_company_id());

CREATE INDEX idx_invoices_company_type ON public.invoices(company_id, type);
CREATE INDEX idx_invoices_client ON public.invoices(client_id);

-- 3. Tabela de itens da NF
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  yarn_type_id uuid REFERENCES public.yarn_types(id),
  yarn_type_name text,
  article_id uuid REFERENCES public.articles(id),
  article_name text,
  weight_kg numeric NOT NULL DEFAULT 0,
  quantity_rolls numeric DEFAULT 0,
  value_per_kg numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own invoice_items" ON public.invoice_items FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own invoice_items" ON public.invoice_items FOR DELETE TO authenticated USING (company_id = get_user_company_id());

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- 4. Adicionar yarn_type_id na tabela articles
ALTER TABLE public.articles ADD COLUMN yarn_type_id uuid REFERENCES public.yarn_types(id);
