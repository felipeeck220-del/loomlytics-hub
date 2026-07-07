ALTER TABLE public.freight_orders REPLICA IDENTITY FULL;
ALTER TABLE public.freight_order_items REPLICA IDENTITY FULL;
ALTER TABLE public.freight_order_photos REPLICA IDENTITY FULL;
ALTER TABLE public.freighters REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_order_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_order_photos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.freighters; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;