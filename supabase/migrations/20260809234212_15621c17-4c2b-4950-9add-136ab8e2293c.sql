-- 1. DROP ALL POTENTIALLY REDUNDANT TRIGGERS
-- We found 'trg_mirror_of_to_manual_stock' and 'trg_mirror_of_update_to_manual_stock' in previous analysis.
DROP TRIGGER IF EXISTS trg_mirror_of_to_manual_stock ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_mirror_of_update_to_manual_stock ON public.stock_movements;

-- 2. RE-CREATE CONSOLIDATED TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_mirror boolean;
  v_client uuid;
BEGIN
  -- Definir o que deve ser espelhado: Reservas, Liberações e Saídas Físicas (out)
  -- Também incluímos 'in' se tiver billing_order_id (retorno de peças)
  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

  IF NOT v_should_mirror THEN
    DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
    RETURN NEW;
  END IF;

  -- Resolver o cliente
  v_client := NEW.client_id;
  IF v_client IS NULL THEN
    SELECT a.client_id INTO v_client FROM public.articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
  END IF;

  -- Sincronização Idempotente usando source_movement_id
  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, billing_order_id,
     type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine)
  VALUES
    (NEW.company_id, NEW.article_id, v_client, NEW.machine_id, NEW.billing_order_id,
     NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
     NEW.reason, NEW.id, NEW.created_by, NEW.created_at, false)
  ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
  DO UPDATE SET
    company_id = EXCLUDED.company_id,
    article_id = EXCLUDED.article_id,
    client_id = EXCLUDED.client_id,
    machine_id = EXCLUDED.machine_id,
    billing_order_id = EXCLUDED.billing_order_id,
    type = EXCLUDED.type,
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    reason = EXCLUDED.reason,
    created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

-- 3. RE-ATTACH CONSOLIDATED TRIGGER
CREATE TRIGGER trg_mirror_of_update_to_manual_stock
AFTER INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.mirror_of_update_to_manual_stock();

-- 4. CLEANUP: REMOVE ALL GHOST ENTRIES AND DUPLICATES
-- A) Remove movements that don't have a source_movement_id but have a billing_order_id 
-- (these were created by the old redundant trigger without linking)
DELETE FROM public.manual_stock_movements
WHERE billing_order_id IS NOT NULL 
AND source_movement_id IS NULL;

-- B) Remove manual corrections that were trying to fix the duplicities manually
DELETE FROM public.manual_stock_movements 
WHERE reason ILIKE '%correção%estoque%';

-- 5. RE-SYNC (BACKFILL)
-- Ensure every valid movement from stock_movements has exactly one mirror in manual_stock_movements
INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id, billing_order_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    sm.reason, sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE (
    sm.type::text IN ('reserve', 'release', 'out')
    OR (sm.type::text = 'in' AND sm.billing_order_id IS NOT NULL)
)
AND COALESCE(sm.is_second_quality, false) = false
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
DO UPDATE SET
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    type = EXCLUDED.type,
    billing_order_id = EXCLUDED.billing_order_id;
