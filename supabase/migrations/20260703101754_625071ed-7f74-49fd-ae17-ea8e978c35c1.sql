DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'machines','machine_logs',
    'needle_inventory','needle_transactions',
    'sinker_inventory','sinker_transactions',
    'cylinders','machine_needle_refs','machine_sinker_refs',
    'maintenance_order_items','machine_maintenance_observations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
  -- Ensure maintenance_orders REPLICA IDENTITY FULL (already in publication)
  EXECUTE 'ALTER TABLE public.maintenance_orders REPLICA IDENTITY FULL';
END $$;