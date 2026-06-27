
-- 1) Header table for yarn entries
CREATE TABLE IF NOT EXISTS public.yarn_stock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  client_id UUID,
  client_name TEXT,
  yarn_type_name TEXT NOT NULL,
  supplier_name TEXT,
  invoice_number TEXT,
  notes TEXT,
  created_by_name TEXT,
  created_by_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_stock_entries TO authenticated;
GRANT ALL ON public.yarn_stock_entries TO service_role;

ALTER TABLE public.yarn_stock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yarn_entries company access"
  ON public.yarn_stock_entries FOR ALL
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE TRIGGER update_yarn_stock_entries_updated_at
  BEFORE UPDATE ON public.yarn_stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_yarn_stock_entries_company ON public.yarn_stock_entries(company_id, created_at DESC);

-- 2) Link pallets to entry
ALTER TABLE public.yarn_stock_pallets
  ADD COLUMN IF NOT EXISTS entry_id UUID REFERENCES public.yarn_stock_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_yarn_stock_pallets_entry ON public.yarn_stock_pallets(entry_id);

-- 3) Unique code per company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'yarn_stock_pallets_company_code_unique'
  ) THEN
    ALTER TABLE public.yarn_stock_pallets
      ADD CONSTRAINT yarn_stock_pallets_company_code_unique UNIQUE (company_id, code);
  END IF;
END $$;

-- 4) Realtime
ALTER TABLE public.yarn_stock_pallets REPLICA IDENTITY FULL;
ALTER TABLE public.yarn_stock_movements REPLICA IDENTITY FULL;
ALTER TABLE public.yarn_stock_machine_current REPLICA IDENTITY FULL;
ALTER TABLE public.yarn_stock_entries REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.yarn_stock_pallets; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.yarn_stock_movements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.yarn_stock_machine_current; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.yarn_stock_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
