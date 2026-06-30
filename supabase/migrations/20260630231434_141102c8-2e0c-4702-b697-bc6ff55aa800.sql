
-- Maintenance Orders (OM)
CREATE TABLE public.maintenance_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  om_number integer NOT NULL,
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('manutencao_preventiva','manutencao_corretiva','troca_artigo','troca_agulhas')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','prioritaria')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_curso','finalizada','cancelada')),
  description text,
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  started_by_id uuid,
  started_by_name text,
  finished_at timestamptz,
  finished_by_id uuid,
  finished_by_name text,
  duration_seconds integer,
  cancelled_at timestamptz,
  cancelled_by_id uuid,
  cancelled_by_name text,
  cancellation_reason text,
  machine_log_id uuid REFERENCES public.machine_logs(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, om_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_orders TO authenticated;
GRANT ALL ON public.maintenance_orders TO service_role;

ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select maintenance_orders" ON public.maintenance_orders
  FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "tenant insert maintenance_orders" ON public.maintenance_orders
  FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "tenant update maintenance_orders" ON public.maintenance_orders
  FOR UPDATE TO authenticated USING (company_id = get_user_company_id()) WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "tenant delete maintenance_orders" ON public.maintenance_orders
  FOR DELETE TO authenticated USING (company_id = get_user_company_id());

CREATE INDEX maintenance_orders_company_status_idx ON public.maintenance_orders(company_id, status);
CREATE INDEX maintenance_orders_machine_idx ON public.maintenance_orders(machine_id);

-- Trigger updated_at
CREATE TRIGGER trg_maintenance_orders_updated
BEFORE UPDATE ON public.maintenance_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-numerate om_number per company
CREATE OR REPLACE FUNCTION public.assign_om_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.om_number IS NULL OR NEW.om_number = 0 THEN
    SELECT COALESCE(MAX(om_number), 0) + 1
      INTO NEW.om_number
      FROM public.maintenance_orders
      WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.maintenance_orders ALTER COLUMN om_number DROP NOT NULL;
CREATE TRIGGER trg_maintenance_orders_assign_number
BEFORE INSERT ON public.maintenance_orders
FOR EACH ROW EXECUTE FUNCTION public.assign_om_number();

-- Items trocados
CREATE TABLE public.maintenance_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.maintenance_orders(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('agulha','platina','cilindro','outro')),
  needle_id uuid REFERENCES public.needle_inventory(id) ON DELETE SET NULL,
  sinker_id uuid REFERENCES public.sinker_inventory(id) ON DELETE SET NULL,
  cylinder_id uuid REFERENCES public.cylinders(id) ON DELETE SET NULL,
  description text,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_order_items TO authenticated;
GRANT ALL ON public.maintenance_order_items TO service_role;

ALTER TABLE public.maintenance_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select maintenance_order_items" ON public.maintenance_order_items
  FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "tenant insert maintenance_order_items" ON public.maintenance_order_items
  FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "tenant update maintenance_order_items" ON public.maintenance_order_items
  FOR UPDATE TO authenticated USING (company_id = get_user_company_id()) WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "tenant delete maintenance_order_items" ON public.maintenance_order_items
  FOR DELETE TO authenticated USING (company_id = get_user_company_id());

CREATE INDEX maintenance_order_items_order_idx ON public.maintenance_order_items(order_id);
