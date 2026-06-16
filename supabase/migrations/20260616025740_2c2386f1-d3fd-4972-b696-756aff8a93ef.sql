
CREATE TABLE public.billing_order_pallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_order_id UUID NOT NULL REFERENCES public.billing_orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pallet_number INTEGER NOT NULL,
  pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces >= 0),
  weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  reserve_movement_id UUID REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_order_pallets_of ON public.billing_order_pallets(billing_order_id);
CREATE INDEX idx_billing_order_pallets_company ON public.billing_order_pallets(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_order_pallets TO authenticated;
GRANT ALL ON public.billing_order_pallets TO service_role;

ALTER TABLE public.billing_order_pallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view pallets"
  ON public.billing_order_pallets FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Tenant can insert pallets"
  ON public.billing_order_pallets FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Tenant can update pallets"
  ON public.billing_order_pallets FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Tenant can delete pallets"
  ON public.billing_order_pallets FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
