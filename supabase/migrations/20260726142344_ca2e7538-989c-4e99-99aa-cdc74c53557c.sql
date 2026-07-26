
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_device_logs TO authenticated;
GRANT ALL ON public.iot_device_logs TO service_role;

ALTER TABLE public.iot_device_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='iot_device_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_device_logs';
  END IF;
END $$;
