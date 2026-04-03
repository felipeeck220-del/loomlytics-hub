
-- Tabela de materiais residuais
CREATE TABLE public.residue_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  default_price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.residue_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own residue_materials" ON public.residue_materials FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own residue_materials" ON public.residue_materials FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own residue_materials" ON public.residue_materials FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own residue_materials" ON public.residue_materials FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Tabela de vendas de resíduos
CREATE TABLE public.residue_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.residue_materials(id) ON DELETE CASCADE,
  material_name text,
  client_name text NOT NULL,
  date text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  romaneio text,
  observations text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.residue_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own residue_sales" ON public.residue_sales FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own residue_sales" ON public.residue_sales FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own residue_sales" ON public.residue_sales FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own residue_sales" ON public.residue_sales FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Índices
CREATE INDEX idx_residue_materials_company ON public.residue_materials(company_id);
CREATE INDEX idx_residue_sales_company ON public.residue_sales(company_id);
CREATE INDEX idx_residue_sales_date ON public.residue_sales(date);
CREATE INDEX idx_residue_sales_material ON public.residue_sales(material_id);
