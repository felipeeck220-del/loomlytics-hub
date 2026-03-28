CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform_settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.platform_settings (key, value) VALUES
  ('trial_days', '90'),
  ('monthly_price', '47.00');