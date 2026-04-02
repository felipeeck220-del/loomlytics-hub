-- Create accounts_payable table
CREATE TABLE public.accounts_payable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  paid_at TIMESTAMPTZ,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own accounts_payable"
  ON public.accounts_payable FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own accounts_payable"
  ON public.accounts_payable FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own accounts_payable"
  ON public.accounts_payable FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own accounts_payable"
  ON public.accounts_payable FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id());

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_accounts_payable_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW
  EXECUTE FUNCTION public.update_accounts_payable_updated_at();