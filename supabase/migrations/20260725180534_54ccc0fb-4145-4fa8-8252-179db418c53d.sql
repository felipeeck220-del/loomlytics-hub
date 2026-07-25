
-- Tabela para armazenar logs de dispositivos IoT (até 100 por dispositivo, rolando)
CREATE TABLE public.iot_device_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES public.iot_devices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  machine_id uuid,
  payload jsonb,
  rpm numeric,
  total_rotations bigint,
  is_running boolean,
  wifi_rssi integer,
  uptime_ms bigint,
  response_status integer,
  response_body text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iot_device_logs_device_created ON public.iot_device_logs(device_id, created_at DESC);
CREATE INDEX idx_iot_device_logs_company ON public.iot_device_logs(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_device_logs TO authenticated;
GRANT ALL ON public.iot_device_logs TO service_role;

ALTER TABLE public.iot_device_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs of their company IoT devices"
  ON public.iot_device_logs FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Service role manages iot device logs"
  ON public.iot_device_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Trigger: mantém apenas os 100 logs mais recentes por dispositivo (rolling window)
CREATE OR REPLACE FUNCTION public.trim_iot_device_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.iot_device_logs
   WHERE device_id = NEW.device_id
     AND id NOT IN (
       SELECT id FROM public.iot_device_logs
        WHERE device_id = NEW.device_id
        ORDER BY created_at DESC
        LIMIT 100
     );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trim_iot_device_logs
AFTER INSERT ON public.iot_device_logs
FOR EACH ROW EXECUTE FUNCTION public.trim_iot_device_logs();

-- Realtime
ALTER TABLE public.iot_device_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_device_logs;
