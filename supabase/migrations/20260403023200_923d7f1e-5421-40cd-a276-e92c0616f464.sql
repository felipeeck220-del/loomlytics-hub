
-- 1. iot_devices — Registro de dispositivos ESP32
CREATE TABLE public.iot_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  firmware_version TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.iot_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own iot_devices"
  ON public.iot_devices FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own iot_devices"
  ON public.iot_devices FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own iot_devices"
  ON public.iot_devices FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own iot_devices"
  ON public.iot_devices FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- Service role needs to read for webhook validation (anon with token check in edge function)
CREATE POLICY "Anon can read iot_devices by token"
  ON public.iot_devices FOR SELECT TO anon
  USING (token IS NOT NULL);

-- 2. machine_readings — Leituras brutas do sensor
CREATE TABLE public.machine_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  total_rotations BIGINT NOT NULL,
  rpm NUMERIC NOT NULL DEFAULT 0,
  is_running BOOLEAN NOT NULL DEFAULT false,
  uptime_ms BIGINT,
  wifi_rssi INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_readings_machine_time ON machine_readings (machine_id, created_at DESC);

ALTER TABLE public.machine_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own machine_readings"
  ON public.machine_readings FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own machine_readings"
  ON public.machine_readings FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- 3. iot_shift_state — Estado do turno em andamento
CREATE TABLE public.iot_shift_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE UNIQUE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  current_shift TEXT NOT NULL,
  weaver_id UUID REFERENCES weavers(id),
  article_id UUID REFERENCES articles(id),
  partial_turns BIGINT NOT NULL DEFAULT 0,
  total_turns BIGINT NOT NULL DEFAULT 0,
  completed_rolls INTEGER NOT NULL DEFAULT 0,
  roll_position BIGINT NOT NULL DEFAULT 0,
  last_rpm NUMERIC DEFAULT 0,
  shift_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.iot_shift_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own iot_shift_state"
  ON public.iot_shift_state FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own iot_shift_state"
  ON public.iot_shift_state FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own iot_shift_state"
  ON public.iot_shift_state FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own iot_shift_state"
  ON public.iot_shift_state FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- 4. iot_downtime_events — Registro de paradas
CREATE TABLE public.iot_downtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  shift TEXT NOT NULL,
  weaver_id UUID REFERENCES weavers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_downtime_machine_time ON iot_downtime_events (machine_id, started_at DESC);

ALTER TABLE public.iot_downtime_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own iot_downtime_events"
  ON public.iot_downtime_events FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own iot_downtime_events"
  ON public.iot_downtime_events FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- 5. iot_machine_assignments — Associação tecelão ↔ máquina por turno
CREATE TABLE public.iot_machine_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  weaver_id UUID NOT NULL REFERENCES weavers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (machine_id, shift, active)
);

ALTER TABLE public.iot_machine_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own iot_machine_assignments"
  ON public.iot_machine_assignments FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own iot_machine_assignments"
  ON public.iot_machine_assignments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own iot_machine_assignments"
  ON public.iot_machine_assignments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own iot_machine_assignments"
  ON public.iot_machine_assignments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());
