
-- OFR: autorização de edição pós-finalização
ALTER TABLE public.freight_orders
  ADD COLUMN IF NOT EXISTS edit_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_authorized_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS edit_authorized_by uuid NULL,
  ADD COLUMN IF NOT EXISTS edit_authorized_reason text NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS edited_by uuid NULL,
  ADD COLUMN IF NOT EXISTS previous_price_per_kg numeric NULL,
  ADD COLUMN IF NOT EXISTS previous_total numeric NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'freight_orders_edit_authorized_by_fkey') THEN
    ALTER TABLE public.freight_orders
      ADD CONSTRAINT freight_orders_edit_authorized_by_fkey
      FOREIGN KEY (edit_authorized_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'freight_orders_edited_by_fkey') THEN
    ALTER TABLE public.freight_orders
      ADD CONSTRAINT freight_orders_edited_by_fkey
      FOREIGN KEY (edited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fotos removidas na edição (histórico)
CREATE TABLE IF NOT EXISTS public.freight_order_edit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freight_order_id uuid NOT NULL REFERENCES public.freight_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  description text NULL,
  replaced_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  replaced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS freight_order_edit_photos_order_idx ON public.freight_order_edit_photos(freight_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freight_order_edit_photos TO authenticated;
GRANT ALL ON public.freight_order_edit_photos TO service_role;

ALTER TABLE public.freight_order_edit_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant read freight_order_edit_photos" ON public.freight_order_edit_photos;
CREATE POLICY "Tenant read freight_order_edit_photos" ON public.freight_order_edit_photos
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.freighters f
                   WHERE f.user_id = auth.uid()
                     AND f.company_id = freight_order_edit_photos.company_id)
      OR freight_order_id IN (
        SELECT fo.id FROM public.freight_orders fo
        JOIN public.freighters f ON f.id = fo.freighter_id
        WHERE f.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Tenant write freight_order_edit_photos" ON public.freight_order_edit_photos;
CREATE POLICY "Tenant write freight_order_edit_photos" ON public.freight_order_edit_photos
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'freight_order_edit_photos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_order_edit_photos';
  END IF;
END $$;
ALTER TABLE public.freight_order_edit_photos REPLICA IDENTITY FULL;
