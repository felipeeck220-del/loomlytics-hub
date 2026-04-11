
CREATE TABLE public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL,
  user_name TEXT,
  user_code TEXT,
  user_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  location_country TEXT,
  location_city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own login_history"
ON public.login_history
FOR INSERT
TO authenticated
WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can read own login_history"
ON public.login_history
FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

CREATE INDEX idx_login_history_company_created ON public.login_history(company_id, created_at DESC);
CREATE INDEX idx_login_history_user ON public.login_history(user_id, created_at DESC);
