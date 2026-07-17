
-- 1) Tabela de endereços de frete (locais reutilizáveis)
CREATE TABLE public.freight_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  full_address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_freight_addresses_company ON public.freight_addresses(company_id);
CREATE UNIQUE INDEX freight_addresses_company_name_unique
  ON public.freight_addresses(company_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_addresses TO authenticated;
GRANT ALL ON public.freight_addresses TO service_role;

ALTER TABLE public.freight_addresses ENABLE ROW LEVEL SECURITY;

-- Todos os membros da empresa podem ler (freteiros precisam para abrir no GPS)
CREATE POLICY "Members can view freight addresses"
  ON public.freight_addresses FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());

-- Admin e lider_frete podem gerenciar
CREATE POLICY "Admin/lider_frete can insert freight addresses"
  ON public.freight_addresses FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.company_id = public.get_user_company_id()
        AND p.role IN ('admin', 'lider_frete')
    )
  );

CREATE POLICY "Admin/lider_frete can update freight addresses"
  ON public.freight_addresses FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.company_id = public.get_user_company_id()
        AND p.role IN ('admin', 'lider_frete')
    )
  );

CREATE POLICY "Admin/lider_frete can delete freight addresses"
  ON public.freight_addresses FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.company_id = public.get_user_company_id()
        AND p.role IN ('admin', 'lider_frete')
    )
  );

CREATE TRIGGER trg_freight_addresses_updated_at
  BEFORE UPDATE ON public.freight_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Vincular endereços à OFR (mantém pickup_location/delivery_location como snapshot histórico)
ALTER TABLE public.freight_orders
  ADD COLUMN pickup_address_id UUID REFERENCES public.freight_addresses(id) ON DELETE SET NULL,
  ADD COLUMN delivery_address_id UUID REFERENCES public.freight_addresses(id) ON DELETE SET NULL;
