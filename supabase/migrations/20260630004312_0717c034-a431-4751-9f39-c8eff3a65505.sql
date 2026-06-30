CREATE TABLE public.material_provider_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.material_providers(id) ON DELETE CASCADE,
  needle_id uuid REFERENCES public.needle_inventory(id) ON DELETE CASCADE,
  sinker_id uuid REFERENCES public.sinker_inventory(id) ON DELETE CASCADE,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_provider_prices_one_item CHECK (
    (needle_id IS NOT NULL AND sinker_id IS NULL)
    OR (needle_id IS NULL AND sinker_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX material_provider_prices_needle_uniq
  ON public.material_provider_prices(provider_id, needle_id) WHERE needle_id IS NOT NULL;
CREATE UNIQUE INDEX material_provider_prices_sinker_uniq
  ON public.material_provider_prices(provider_id, sinker_id) WHERE sinker_id IS NOT NULL;
CREATE INDEX material_provider_prices_company_idx ON public.material_provider_prices(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_provider_prices TO authenticated;
GRANT ALL ON public.material_provider_prices TO service_role;

ALTER TABLE public.material_provider_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company provider prices"
  ON public.material_provider_prices FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert their company provider prices"
  ON public.material_provider_prices FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update their company provider prices"
  ON public.material_provider_prices FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete their company provider prices"
  ON public.material_provider_prices FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER update_material_provider_prices_updated_at
  BEFORE UPDATE ON public.material_provider_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();