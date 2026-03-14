
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  monthly_plan_value numeric NOT NULL DEFAULT 0,
  platform_active boolean NOT NULL DEFAULT true,
  enabled_nav_items jsonb NOT NULL DEFAULT '["dashboard","machines","clients-articles","production","outsource","weavers","reports","settings"]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can manage this table
-- Authenticated users can only read their own company settings
CREATE POLICY "Users can read own company_settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());
