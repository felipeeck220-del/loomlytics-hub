
-- Enum status Ordem de Frete
CREATE TYPE public.freight_order_status AS ENUM
  ('open','pickup_in_progress','delivery_in_progress','completed','cancelled');

-- Tabela de freteiros (motoristas)
CREATE TABLE public.freighters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NULL,           -- auth.users.id do login do freteiro (opcional)
  profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NULL,
  vehicle text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX freighters_company_idx ON public.freighters(company_id);
CREATE INDEX freighters_user_idx ON public.freighters(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freighters TO authenticated;
GRANT ALL ON public.freighters TO service_role;
ALTER TABLE public.freighters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant manage freighters" ON public.freighters
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
CREATE TRIGGER freighters_updated_at BEFORE UPDATE ON public.freighters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ordens de Frete
CREATE TABLE public.freight_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ofr_number text NOT NULL,
  freighter_id uuid NOT NULL REFERENCES public.freighters(id) ON DELETE RESTRICT,
  pickup_location text NOT NULL,
  delivery_location text NOT NULL,
  observations text NULL,
  status public.freight_order_status NOT NULL DEFAULT 'open',
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  pickup_started_at timestamptz NULL,
  pickup_started_by uuid NULL,
  delivery_started_at timestamptz NULL,
  delivery_started_by uuid NULL,
  completed_at timestamptz NULL,
  completed_by uuid NULL,
  cancelled_at timestamptz NULL,
  cancelled_by uuid NULL,
  cancellation_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ofr_number)
);
CREATE INDEX freight_orders_company_idx ON public.freight_orders(company_id);
CREATE INDEX freight_orders_freighter_idx ON public.freight_orders(freighter_id);
CREATE INDEX freight_orders_status_idx ON public.freight_orders(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_orders TO authenticated;
GRANT ALL ON public.freight_orders TO service_role;
ALTER TABLE public.freight_orders ENABLE ROW LEVEL SECURITY;

-- Admin/geral: qualquer usuário da empresa vê e gerencia
CREATE POLICY "Tenant manage freight_orders" ON public.freight_orders
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND (
      -- freteiro só enxerga o que é dele
      NOT EXISTS (SELECT 1 FROM public.freighters f
                   WHERE f.user_id = auth.uid()
                     AND f.company_id = freight_orders.company_id)
      OR freighter_id IN (SELECT id FROM public.freighters
                          WHERE user_id = auth.uid()
                            AND company_id = freight_orders.company_id)
    )
  )
  WITH CHECK (company_id = public.get_user_company_id());
CREATE TRIGGER freight_orders_updated_at BEFORE UPDATE ON public.freight_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Itens da OFR
CREATE TABLE public.freight_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freight_order_id uuid NOT NULL REFERENCES public.freight_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NULL REFERENCES public.articles(id) ON DELETE SET NULL,
  article_name text NULL,
  pieces integer NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX freight_order_items_order_idx ON public.freight_order_items(freight_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_order_items TO authenticated;
GRANT ALL ON public.freight_order_items TO service_role;
ALTER TABLE public.freight_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read freight_order_items" ON public.freight_order_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.freighters f
                   WHERE f.user_id = auth.uid()
                     AND f.company_id = freight_order_items.company_id)
      OR freight_order_id IN (
        SELECT fo.id FROM public.freight_orders fo
        JOIN public.freighters f ON f.id = fo.freighter_id
        WHERE f.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Tenant write freight_order_items" ON public.freight_order_items
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- Fotos da entrega
CREATE TABLE public.freight_order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freight_order_id uuid NOT NULL REFERENCES public.freight_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  description text NULL,
  uploaded_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX freight_order_photos_order_idx ON public.freight_order_photos(freight_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_order_photos TO authenticated;
GRANT ALL ON public.freight_order_photos TO service_role;
ALTER TABLE public.freight_order_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read freight_order_photos" ON public.freight_order_photos
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.freighters f
                   WHERE f.user_id = auth.uid()
                     AND f.company_id = freight_order_photos.company_id)
      OR freight_order_id IN (
        SELECT fo.id FROM public.freight_orders fo
        JOIN public.freighters f ON f.id = fo.freighter_id
        WHERE f.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Tenant write freight_order_photos" ON public.freight_order_photos
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_order_photos;

-- Storage RLS (bucket freight-photos: pasta {company_id}/{freight_order_id}/...)
CREATE POLICY "freight-photos read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'freight-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );
CREATE POLICY "freight-photos insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'freight-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );
CREATE POLICY "freight-photos delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'freight-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );
