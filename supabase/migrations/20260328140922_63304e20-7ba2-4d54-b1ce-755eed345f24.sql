
-- Add code column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS code text;

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  user_name text,
  user_role text,
  user_code text,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit_logs"
  ON public.audit_logs
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own audit_logs"
  ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());
