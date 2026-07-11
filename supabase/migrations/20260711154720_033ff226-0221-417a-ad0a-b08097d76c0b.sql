
CREATE TABLE public.needle_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.needle_providers(id) ON DELETE CASCADE,
  needle_id uuid NOT NULL REFERENCES public.needle_inventory(id) ON DELETE CASCADE,
  lot_code text,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity integer NOT NULL DEFAULT 0,
  unit_price numeric(12,4) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.needle_lots TO authenticated;
GRANT ALL ON public.needle_lots TO service_role;

ALTER TABLE public.needle_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own needle_lots"
  ON public.needle_lots
  FOR ALL
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE TRIGGER trg_needle_lots_updated
  BEFORE UPDATE ON public.needle_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_needle_lots_provider ON public.needle_lots(provider_id);
CREATE INDEX idx_needle_lots_needle ON public.needle_lots(needle_id);
CREATE INDEX idx_needle_lots_company ON public.needle_lots(company_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.needle_lots;
ALTER TABLE public.needle_lots REPLICA IDENTITY FULL;

ALTER TABLE public.needle_transactions
  ADD COLUMN lot_id uuid REFERENCES public.needle_lots(id) ON DELETE SET NULL;

CREATE INDEX idx_needle_transactions_lot ON public.needle_transactions(lot_id);
