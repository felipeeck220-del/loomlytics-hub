
DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM ('reserve','release','out','in','adjust_in','adjust_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  billing_order_id UUID REFERENCES public.billing_orders(id) ON DELETE SET NULL,
  type public.stock_movement_type NOT NULL,
  pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces >= 0),
  weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_article_created
  ON public.stock_movements (company_id, article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_billing_order
  ON public.stock_movements (billing_order_id);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view stock movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant can insert stock movements"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
