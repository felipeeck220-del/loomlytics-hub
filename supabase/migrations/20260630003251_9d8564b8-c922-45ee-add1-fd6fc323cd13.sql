
-- 1. Fix wrong FK on sinker_inventory.company_id (was pointing to auth.users)
ALTER TABLE public.sinker_inventory
  DROP CONSTRAINT IF EXISTS sinker_inventory_company_id_fkey;
ALTER TABLE public.sinker_inventory
  ADD CONSTRAINT sinker_inventory_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Material providers (shared by needles and sinkers)
CREATE TABLE IF NOT EXISTS public.material_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_providers TO authenticated;
GRANT ALL ON public.material_providers TO service_role;

ALTER TABLE public.material_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage material_providers"
  ON public.material_providers
  FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE TRIGGER trg_material_providers_updated_at
  BEFORE UPDATE ON public.material_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add provider_id + unit_price to needle_transactions
ALTER TABLE public.needle_transactions
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.material_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,4);

-- 4. Add provider_id + unit_price to sinker_transactions
ALTER TABLE public.sinker_transactions
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.material_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,4);
