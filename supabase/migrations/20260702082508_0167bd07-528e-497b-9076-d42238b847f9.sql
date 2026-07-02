
-- 1) Own stock articles + movements (independent from client articles)
CREATE TABLE public.own_stock_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  observations TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.own_stock_articles TO authenticated;
GRANT ALL ON public.own_stock_articles TO service_role;
ALTER TABLE public.own_stock_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view own_stock_articles" ON public.own_stock_articles FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert own_stock_articles" ON public.own_stock_articles FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update own_stock_articles" ON public.own_stock_articles FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Tenant delete own_stock_articles" ON public.own_stock_articles FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TABLE public.own_stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  own_article_id UUID NOT NULL REFERENCES public.own_stock_articles(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('in','out')),
  pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces >= 0),
  weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_own_stock_movements_company ON public.own_stock_movements(company_id);
CREATE INDEX idx_own_stock_movements_article ON public.own_stock_movements(own_article_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.own_stock_movements TO authenticated;
GRANT ALL ON public.own_stock_movements TO service_role;
ALTER TABLE public.own_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view own_stock_movements" ON public.own_stock_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Tenant insert own_stock_movements" ON public.own_stock_movements FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Tenant update own_stock_movements" ON public.own_stock_movements FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Tenant delete own_stock_movements" ON public.own_stock_movements FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- 2) Pallet substitute: allow individual pallet to reference a different client/article than the OF
ALTER TABLE public.billing_order_pallets
  ADD COLUMN alt_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN alt_article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL;
