
CREATE TABLE public.tv_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  panel_type text NOT NULL DEFAULT 'machine_grid',
  enabled_machines jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_panels ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage their own company's panels
CREATE POLICY "Users can read own tv_panels"
ON public.tv_panels FOR SELECT TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own tv_panels"
ON public.tv_panels FOR INSERT TO authenticated
WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own tv_panels"
ON public.tv_panels FOR UPDATE TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own tv_panels"
ON public.tv_panels FOR DELETE TO authenticated
USING (company_id = get_user_company_id());

-- Anon can read panel by code (for TV code validation)
CREATE POLICY "Anon can read tv_panels by code"
ON public.tv_panels FOR SELECT TO anon
USING (code IS NOT NULL);

-- Enable realtime for tv_panels
ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_panels;

-- Index for fast lookup by code
CREATE INDEX idx_tv_panels_code ON public.tv_panels(code);
