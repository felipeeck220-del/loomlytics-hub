-- 1. Limpar TODA a sincronização automática problemática para começar do zero (apenas para movimentos vindos de OFs)
-- Mantemos os lançamentos manuais legítimos (source_movement_id IS NULL AND billing_order_id IS NULL)
DELETE FROM public.manual_stock_movements 
WHERE billing_order_id IS NOT NULL 
   OR source_movement_id IS NOT NULL;

-- 2. Backfill COMPLETO e LIMPO de todos os movimentos de OF que devem estar no manual
-- Isso garante que reservas, liberações e saídas físicas (coletas) estejam presentes e consistentes.
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

-- 3. Limpeza de "fantasmas" manuais que tentaram corrigir saldo indevidamente
-- Identificados pelo motivo ou por serem ajustes de saída que neutralizam entradas válidas em datas críticas.
DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NULL 
AND reason ILIKE '%correção%estoque%' 
AND created_at >= '2026-08-08';

-- 4. Corrigir o trigger mirror_of_update_to_manual_stock para ser a fonte única de verdade (evitar mirror_of_to_manual_stock duplicado)
-- Desativamos o mirror_of_to_manual_stock e deixamos apenas o de UPDATE que lida com INSERT (NEW) também.
DROP TRIGGER IF EXISTS trg_mirror_of_to_manual_stock ON public.stock_movements;

CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_should_mirror boolean;
  v_client uuid;
BEGIN
  -- Definir o que deve ser espelhado
  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

  -- Se não deve espelhar, remover qualquer resquício anterior
  IF NOT v_should_mirror THEN
    DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
    RETURN NEW;
  END IF;

  -- Resolver o cliente (fallback para o cliente do artigo)
  v_client := NEW.client_id;
  IF v_client IS NULL THEN
    SELECT a.client_id INTO v_client FROM public.articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
  END IF;

  -- Inserir ou Atualizar (Idempotente por source_movement_id)
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
$function$;

-- 5. Garantir que o trigger dispare tanto no INSERT quanto no UPDATE
DROP TRIGGER IF EXISTS trg_mirror_of_update_to_manual_stock ON public.stock_movements;
CREATE TRIGGER trg_mirror_of_update_to_manual_stock
AFTER INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.mirror_of_update_to_manual_stock();
