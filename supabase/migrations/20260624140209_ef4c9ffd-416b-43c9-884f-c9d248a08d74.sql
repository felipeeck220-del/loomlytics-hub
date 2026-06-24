
ALTER TABLE public.client_invoices ADD COLUMN IF NOT EXISTS composition jsonb;

CREATE TABLE IF NOT EXISTS public.client_invoice_exit_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  exit_invoice_id uuid not null references public.client_invoices(id) on delete cascade,
  entry_invoice_id uuid not null references public.client_invoices(id) on delete cascade,
  yarn_type_id uuid,
  deduct_kg numeric not null default 0,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoice_exit_links TO authenticated;
GRANT ALL ON public.client_invoice_exit_links TO service_role;

ALTER TABLE public.client_invoice_exit_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.client_invoice_exit_links FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "tenant_insert" ON public.client_invoice_exit_links FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant_update" ON public.client_invoice_exit_links FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant_delete" ON public.client_invoice_exit_links FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE INDEX IF NOT EXISTS idx_ciel_exit ON public.client_invoice_exit_links(exit_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ciel_entry ON public.client_invoice_exit_links(entry_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ciel_company ON public.client_invoice_exit_links(company_id);
