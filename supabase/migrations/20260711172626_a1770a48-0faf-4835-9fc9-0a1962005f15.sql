
-- ============================================================
-- Platinas: espelhar o modelo de Lotes (Agulhas) para Sinkers
-- ============================================================

-- 1) Tabela sinker_providers
CREATE TABLE IF NOT EXISTS public.sinker_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_providers TO authenticated;
GRANT ALL ON public.sinker_providers TO service_role;
ALTER TABLE public.sinker_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant all sinker_providers" ON public.sinker_providers
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());
CREATE TRIGGER trg_sinker_providers_updated_at
  BEFORE UPDATE ON public.sinker_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2) Tabela sinker_provider_prices
CREATE TABLE IF NOT EXISTS public.sinker_provider_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.sinker_providers(id) ON DELETE CASCADE,
  sinker_id uuid NOT NULL REFERENCES public.sinker_inventory(id) ON DELETE CASCADE,
  unit_price numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, sinker_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_provider_prices TO authenticated;
GRANT ALL ON public.sinker_provider_prices TO service_role;
ALTER TABLE public.sinker_provider_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant all sinker_provider_prices" ON public.sinker_provider_prices
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());
CREATE TRIGGER trg_sinker_provider_prices_updated_at
  BEFORE UPDATE ON public.sinker_provider_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3) Tabela sinker_lots
CREATE TABLE IF NOT EXISTS public.sinker_lots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.sinker_providers(id) ON DELETE CASCADE,
  sinker_id uuid NOT NULL REFERENCES public.sinker_inventory(id) ON DELETE CASCADE,
  lot_code text,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity integer NOT NULL DEFAULT 0,
  unit_price numeric(12,4) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_lots TO authenticated;
GRANT ALL ON public.sinker_lots TO service_role;
ALTER TABLE public.sinker_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant all sinker_lots" ON public.sinker_lots
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());
CREATE TRIGGER trg_sinker_lots_updated
  BEFORE UPDATE ON public.sinker_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_sinker_lots_provider ON public.sinker_lots(provider_id);
CREATE INDEX IF NOT EXISTS idx_sinker_lots_sinker ON public.sinker_lots(sinker_id);
CREATE INDEX IF NOT EXISTS idx_sinker_lots_company ON public.sinker_lots(company_id);

-- 4) Coluna lot_id em sinker_transactions (ON DELETE CASCADE — espelha needle_transactions atual)
ALTER TABLE public.sinker_transactions
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.sinker_lots(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sinker_transactions_lot ON public.sinker_transactions(lot_id);

-- 5) Coluna current_sinker_lot_id em machines
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS current_sinker_lot_id uuid REFERENCES public.sinker_lots(id) ON DELETE SET NULL;

-- 6) Substituir trigger update_sinker_inventory (que só faz saldo) por conjunto INSERT/UPDATE/DELETE
--    espelhado dos de needle: cria machine_logs troca_platinas + last_sinker_change_at

DROP TRIGGER IF EXISTS update_sinker_inventory_trigger ON public.sinker_transactions;

CREATE OR REPLACE FUNCTION public.handle_sinker_transaction_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_company_id uuid;
BEGIN
    IF NEW.company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
        NEW.company_id := v_company_id;
    END IF;

    IF NEW.type = 'entry' THEN
        UPDATE public.sinker_inventory
          SET current_quantity = current_quantity + NEW.quantity, updated_at = now()
        WHERE id = NEW.sinker_id;
    ELSIF NEW.type = 'exit' THEN
        UPDATE public.sinker_inventory
          SET current_quantity = current_quantity - NEW.quantity, updated_at = now()
        WHERE id = NEW.sinker_id;

        IF NEW.exit_mode = 'troca_platinas' AND NEW.machine_id IS NOT NULL THEN
            UPDATE public.machines
              SET last_sinker_change_at = NEW.date::timestamptz
            WHERE id = NEW.machine_id;

            INSERT INTO public.machine_logs (
              id, machine_id, company_id, status, started_at, ended_at, started_by_name
            ) VALUES (
              gen_random_uuid(), NEW.machine_id, NEW.company_id, 'troca_platinas',
              NEW.date::timestamptz, NEW.date::timestamptz, NEW.created_by_name
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_sinker_transaction_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.type = 'entry' THEN
    UPDATE public.sinker_inventory SET current_quantity = current_quantity - OLD.quantity, updated_at = now() WHERE id = OLD.sinker_id;
  ELSIF OLD.type = 'exit' THEN
    UPDATE public.sinker_inventory SET current_quantity = current_quantity + OLD.quantity, updated_at = now() WHERE id = OLD.sinker_id;
  END IF;

  IF NEW.type = 'entry' THEN
    UPDATE public.sinker_inventory SET current_quantity = current_quantity + NEW.quantity, updated_at = now() WHERE id = NEW.sinker_id;
  ELSIF NEW.type = 'exit' THEN
    UPDATE public.sinker_inventory SET current_quantity = current_quantity - NEW.quantity, updated_at = now() WHERE id = NEW.sinker_id;
  END IF;

  IF OLD.type = 'exit' AND OLD.exit_mode = 'troca_platinas' AND OLD.machine_id IS NOT NULL THEN
    DELETE FROM public.machine_logs
     WHERE machine_id = OLD.machine_id AND status = 'troca_platinas' AND started_at::date = OLD.date;
  END IF;

  IF NEW.type = 'exit' AND NEW.exit_mode = 'troca_platinas' AND NEW.machine_id IS NOT NULL THEN
    UPDATE public.machines SET last_sinker_change_at = NEW.date::timestamptz WHERE id = NEW.machine_id;
    INSERT INTO public.machine_logs (
      id, machine_id, company_id, status, started_at, ended_at, started_by_name
    ) VALUES (
      gen_random_uuid(), NEW.machine_id, NEW.company_id, 'troca_platinas',
      NEW.date::timestamptz, NEW.date::timestamptz, NEW.created_by_name
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_sinker_transaction_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.type = 'entry' THEN
    UPDATE public.sinker_inventory SET current_quantity = current_quantity - OLD.quantity, updated_at = now() WHERE id = OLD.sinker_id;
  ELSIF OLD.type = 'exit' THEN
    UPDATE public.sinker_inventory SET current_quantity = current_quantity + OLD.quantity, updated_at = now() WHERE id = OLD.sinker_id;
  END IF;

  IF OLD.type = 'exit' AND OLD.exit_mode = 'troca_platinas' AND OLD.machine_id IS NOT NULL THEN
    DELETE FROM public.machine_logs
     WHERE machine_id = OLD.machine_id AND status = 'troca_platinas' AND started_at::date = OLD.date;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER tr_handle_sinker_transaction
  BEFORE INSERT ON public.sinker_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_sinker_transaction_trigger();
CREATE TRIGGER tr_handle_sinker_transaction_update
  BEFORE UPDATE ON public.sinker_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_sinker_transaction_update();
CREATE TRIGGER tr_handle_sinker_transaction_delete
  BEFORE DELETE ON public.sinker_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_sinker_transaction_delete();

-- 7) Realtime
ALTER TABLE public.sinker_providers REPLICA IDENTITY FULL;
ALTER TABLE public.sinker_provider_prices REPLICA IDENTITY FULL;
ALTER TABLE public.sinker_lots REPLICA IDENTITY FULL;
ALTER TABLE public.sinker_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.machines REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sinker_providers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sinker_provider_prices; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sinker_lots; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 8) Migrar fornecedores existentes de sinker_inventory.provider (texto) para sinker_providers
INSERT INTO public.sinker_providers (company_id, name)
SELECT DISTINCT s.company_id, s.provider
  FROM public.sinker_inventory s
 WHERE s.provider IS NOT NULL AND btrim(s.provider) <> ''
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO public.sinker_provider_prices (company_id, provider_id, sinker_id, unit_price)
SELECT s.company_id, sp.id, s.id, 0
  FROM public.sinker_inventory s
  JOIN public.sinker_providers sp
    ON sp.company_id = s.company_id AND sp.name = s.provider
 WHERE s.provider IS NOT NULL AND btrim(s.provider) <> ''
ON CONFLICT (provider_id, sinker_id) DO NOTHING;

-- 9) sinker_inventory.provider vira opcional (mantém compat, mas UI passa a operar por lotes)
ALTER TABLE public.sinker_inventory ALTER COLUMN provider DROP NOT NULL;
