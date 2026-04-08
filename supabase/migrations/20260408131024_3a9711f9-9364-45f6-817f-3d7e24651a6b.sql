
-- 1. Create residue_clients table
CREATE TABLE public.residue_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.residue_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own residue_clients" ON public.residue_clients
  FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own residue_clients" ON public.residue_clients
  FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own residue_clients" ON public.residue_clients
  FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own residue_clients" ON public.residue_clients
  FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- 2. Create residue_client_prices table (client × material → price)
CREATE TABLE public.residue_client_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.residue_clients(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.residue_materials(id) ON DELETE CASCADE,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, material_id)
);

ALTER TABLE public.residue_client_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own residue_client_prices" ON public.residue_client_prices
  FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own residue_client_prices" ON public.residue_client_prices
  FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own residue_client_prices" ON public.residue_client_prices
  FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own residue_client_prices" ON public.residue_client_prices
  FOR DELETE TO authenticated USING (company_id = get_user_company_id());

-- 3. Add client_id to residue_sales (nullable for backwards compat with existing data)
ALTER TABLE public.residue_sales
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.residue_clients(id) ON DELETE SET NULL;
