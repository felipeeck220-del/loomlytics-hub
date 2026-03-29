
CREATE TABLE public.company_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  backup_date date NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, backup_date)
);

ALTER TABLE public.company_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read backups"
  ON public.company_backups
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete backups"
  ON public.company_backups
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_company_backups_company_date ON public.company_backups(company_id, backup_date DESC);
