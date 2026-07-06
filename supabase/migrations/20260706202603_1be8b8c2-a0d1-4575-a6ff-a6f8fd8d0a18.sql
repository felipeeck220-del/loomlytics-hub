
-- 1) needle_providers
CREATE TABLE IF NOT EXISTS public.needle_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.needle_providers TO authenticated;
GRANT ALL ON public.needle_providers TO service_role;

ALTER TABLE public.needle_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own needle_providers"
ON public.needle_providers FOR ALL TO authenticated
USING (company_id = public.get_user_company_id())
WITH CHECK (company_id = public.get_user_company_id());

CREATE TRIGGER trg_needle_providers_updated_at
BEFORE UPDATE ON public.needle_providers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) needle_provider_prices
CREATE TABLE IF NOT EXISTS public.needle_provider_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.needle_providers(id) ON DELETE CASCADE,
  needle_id UUID NOT NULL REFERENCES public.needle_inventory(id) ON DELETE CASCADE,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, needle_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.needle_provider_prices TO authenticated;
GRANT ALL ON public.needle_provider_prices TO service_role;

ALTER TABLE public.needle_provider_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own needle_provider_prices"
ON public.needle_provider_prices FOR ALL TO authenticated
USING (company_id = public.get_user_company_id())
WITH CHECK (company_id = public.get_user_company_id());

CREATE TRIGGER trg_needle_provider_prices_updated_at
BEFORE UPDATE ON public.needle_provider_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Provider on needle_inventory becomes optional
ALTER TABLE public.needle_inventory ALTER COLUMN provider DROP NOT NULL;

-- 4) Seed providers + prices from existing needles.provider text
INSERT INTO public.needle_providers (company_id, name)
SELECT DISTINCT company_id, TRIM(provider)
FROM public.needle_inventory
WHERE provider IS NOT NULL AND TRIM(provider) <> ''
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO public.needle_provider_prices (company_id, provider_id, needle_id, unit_price)
SELECT n.company_id, p.id, n.id, 0
FROM public.needle_inventory n
JOIN public.needle_providers p
  ON p.company_id = n.company_id AND p.name = TRIM(n.provider)
WHERE n.provider IS NOT NULL AND TRIM(n.provider) <> ''
ON CONFLICT (provider_id, needle_id) DO NOTHING;
