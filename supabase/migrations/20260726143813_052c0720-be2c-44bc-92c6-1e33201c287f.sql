GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_device_logs TO authenticated;
GRANT ALL ON public.iot_device_logs TO service_role;

DROP POLICY IF EXISTS "Users can view logs of their company IoT devices" ON public.iot_device_logs;
CREATE POLICY "Users can view logs of their company IoT devices"
ON public.iot_device_logs
FOR SELECT
TO authenticated
USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Service role manages iot device logs" ON public.iot_device_logs;
CREATE POLICY "Service role manages iot device logs"
ON public.iot_device_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE public.iot_device_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'iot_device_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_device_logs';
  END IF;
END;
$$;