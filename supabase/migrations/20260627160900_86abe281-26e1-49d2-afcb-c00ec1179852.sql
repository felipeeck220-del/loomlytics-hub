
-- ============ TYPES ============
CREATE TABLE public.yarn_stock_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_stock_types TO authenticated;
GRANT ALL ON public.yarn_stock_types TO service_role;
ALTER TABLE public.yarn_stock_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage yarn_stock_types" ON public.yarn_stock_types
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- ============ CLIENTS ============
CREATE TABLE public.yarn_stock_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_stock_clients TO authenticated;
GRANT ALL ON public.yarn_stock_clients TO service_role;
ALTER TABLE public.yarn_stock_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage yarn_stock_clients" ON public.yarn_stock_clients
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- ============ PALLETS ============
CREATE TABLE public.yarn_stock_pallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  code TEXT NOT NULL,
  yarn_type_id UUID REFERENCES public.yarn_stock_types(id) ON DELETE SET NULL,
  yarn_type_name TEXT,
  client_id UUID REFERENCES public.yarn_stock_clients(id) ON DELETE SET NULL,
  client_name TEXT,
  supplier_name TEXT,
  total_boxes INTEGER NOT NULL DEFAULT 0,
  remaining_boxes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available', -- available | in_machine | empty
  current_machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  notes TEXT,
  created_by_name TEXT,
  created_by_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX idx_yarn_stock_pallets_company ON public.yarn_stock_pallets(company_id);
CREATE INDEX idx_yarn_stock_pallets_status ON public.yarn_stock_pallets(company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_stock_pallets TO authenticated;
GRANT ALL ON public.yarn_stock_pallets TO service_role;
ALTER TABLE public.yarn_stock_pallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage yarn_stock_pallets" ON public.yarn_stock_pallets
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- ============ MOVEMENTS ============
CREATE TABLE public.yarn_stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  pallet_id UUID NOT NULL REFERENCES public.yarn_stock_pallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- entry | exit | assign_machine | unassign_machine
  boxes INTEGER NOT NULL DEFAULT 0,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  machine_name TEXT,
  notes TEXT,
  user_id UUID,
  user_name TEXT,
  user_code TEXT,
  user_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_yarn_stock_movements_company ON public.yarn_stock_movements(company_id, created_at DESC);
CREATE INDEX idx_yarn_stock_movements_pallet ON public.yarn_stock_movements(pallet_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_stock_movements TO authenticated;
GRANT ALL ON public.yarn_stock_movements TO service_role;
ALTER TABLE public.yarn_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage yarn_stock_movements" ON public.yarn_stock_movements
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- ============ MACHINE CURRENT (1 yarn per machine) ============
CREATE TABLE public.yarn_stock_machine_current (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  yarn_type_id UUID REFERENCES public.yarn_stock_types(id) ON DELETE SET NULL,
  yarn_type_name TEXT,
  client_id UUID REFERENCES public.yarn_stock_clients(id) ON DELETE SET NULL,
  client_name TEXT,
  set_by_name TEXT,
  set_by_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (machine_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yarn_stock_machine_current TO authenticated;
GRANT ALL ON public.yarn_stock_machine_current TO service_role;
ALTER TABLE public.yarn_stock_machine_current ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage yarn_stock_machine_current" ON public.yarn_stock_machine_current
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

-- ============ updated_at triggers ============
CREATE TRIGGER trg_yarn_stock_types_updated_at BEFORE UPDATE ON public.yarn_stock_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_yarn_stock_clients_updated_at BEFORE UPDATE ON public.yarn_stock_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_yarn_stock_pallets_updated_at BEFORE UPDATE ON public.yarn_stock_pallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_yarn_stock_machine_current_updated_at BEFORE UPDATE ON public.yarn_stock_machine_current
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
