ALTER TABLE public.billing_orders REPLICA IDENTITY FULL;
ALTER TABLE public.billing_order_pallets REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'billing_order_pallets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_order_pallets';
  END IF;
END $$;