
CREATE TABLE public.machine_maintenance_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_log_id uuid NOT NULL,
  machine_id uuid NOT NULL,
  company_id uuid NOT NULL,
  observation text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_maintenance_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own maintenance observations"
  ON public.machine_maintenance_observations
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own maintenance observations"
  ON public.machine_maintenance_observations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can delete own maintenance observations"
  ON public.machine_maintenance_observations
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());
