CREATE TABLE public.email_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  old_email text NOT NULL,
  new_email text NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read email_history" ON public.email_history
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can insert email_history" ON public.email_history
  FOR INSERT TO authenticated
  WITH CHECK (true);