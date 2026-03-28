
CREATE TABLE public.payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  pix_code text,
  transaction_id text,
  paid_at timestamp with time zone,
  next_billing_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own payment_history" ON public.payment_history
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Service can insert payment_history" ON public.payment_history
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Service can update payment_history" ON public.payment_history
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());
