-- Tabela de estoque de fio em facções terceirizadas
CREATE TABLE public.outsource_yarn_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  outsource_company_id UUID NOT NULL REFERENCES outsource_companies(id) ON DELETE CASCADE,
  yarn_type_id UUID NOT NULL REFERENCES yarn_types(id) ON DELETE CASCADE,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  reference_month TEXT NOT NULL,
  observations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id, outsource_company_id, yarn_type_id, reference_month)
);

-- RLS
ALTER TABLE public.outsource_yarn_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- Índices
CREATE INDEX idx_outsource_yarn_stock_company ON public.outsource_yarn_stock(company_id);
CREATE INDEX idx_outsource_yarn_stock_month ON public.outsource_yarn_stock(company_id, reference_month);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_outsource_yarn_stock_updated_at
  BEFORE UPDATE ON public.outsource_yarn_stock
  FOR EACH ROW
  EXECUTE FUNCTION update_accounts_payable_updated_at();