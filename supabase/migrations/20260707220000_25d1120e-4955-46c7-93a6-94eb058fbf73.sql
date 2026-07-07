
-- 1) Tabela de empresas de rateio de custo
CREATE TABLE public.freight_cost_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  document TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_freight_cost_companies_company ON public.freight_cost_companies(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_cost_companies TO authenticated;
GRANT ALL ON public.freight_cost_companies TO service_role;

ALTER TABLE public.freight_cost_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_companies_select_own" ON public.freight_cost_companies
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "cost_companies_insert_own" ON public.freight_cost_companies
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "cost_companies_update_own" ON public.freight_cost_companies
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "cost_companies_delete_own" ON public.freight_cost_companies
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER update_freight_cost_companies_updated_at
  BEFORE UPDATE ON public.freight_cost_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Colunas em freight_orders
ALTER TABLE public.freight_orders
  ADD COLUMN IF NOT EXISTS cost_company_id UUID REFERENCES public.freight_cost_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_company_name TEXT;

CREATE INDEX IF NOT EXISTS idx_freight_orders_cost_company ON public.freight_orders(cost_company_id);

-- 3) Realtime
ALTER TABLE public.freight_cost_companies REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_cost_companies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
