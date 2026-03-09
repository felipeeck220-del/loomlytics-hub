
-- Table for third-party knitting companies
CREATE TABLE public.outsource_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact text,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outsource_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outsource_companies" ON public.outsource_companies FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own outsource_companies" ON public.outsource_companies FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own outsource_companies" ON public.outsource_companies FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own outsource_companies" ON public.outsource_companies FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- Table for outsourced production records
CREATE TABLE public.outsource_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  outsource_company_id uuid NOT NULL REFERENCES public.outsource_companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  article_name text,
  outsource_company_name text,
  client_name text,
  date text NOT NULL,
  weight_kg numeric NOT NULL DEFAULT 0,
  rolls integer NOT NULL DEFAULT 0,
  client_value_per_kg numeric NOT NULL DEFAULT 0,
  outsource_value_per_kg numeric NOT NULL DEFAULT 0,
  profit_per_kg numeric NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outsource_productions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outsource_productions" ON public.outsource_productions FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own outsource_productions" ON public.outsource_productions FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own outsource_productions" ON public.outsource_productions FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own outsource_productions" ON public.outsource_productions FOR DELETE TO authenticated USING (company_id = get_user_company_id());
