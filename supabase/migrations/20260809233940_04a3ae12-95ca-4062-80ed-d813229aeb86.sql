-- 1. IDENTIFICAÇÃO E LIMPEZA DE DUPLICIDADE
-- O bug de "saldo sumindo" foi causado pela coexistência de dois triggers (trg_mirror_of_to_manual_stock e trg_mirror_of_update_to_manual_stock)
-- que inseriram movimentos duplicados para as mesmas OFs, dobrando as reservas e as saídas.

-- Removemos TODOS os movimentos espelhados para reconstruir do zero de forma limpa.
DELETE FROM public.manual_stock_movements 
WHERE source_movement_id IS NOT NULL 
   OR billing_order_id IS NOT NULL;

-- 2. RECONSTRUÇÃO DA LINHA DO TEMPO (BACKFILL)
-- Inserimos apenas UM movimento para cada registro original do sistema principal.
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

-- 3. ESTABILIZAÇÃO DOS TRIGGERS
-- Removemos o trigger redundante e mantemos apenas o de UPDATE que agora lida com tudo (INSERT/UPDATE).
DROP TRIGGER IF EXISTS trg_mirror_of_to_manual_stock ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_mirror_of_update_to_manual_stock ON public.stock_movements;

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
  -- Definir o que deve ser espelhado (Reservas, Liberações e Saídas Físicas)
  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

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

  -- Sincronização Idempotente
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

CREATE TRIGGER trg_mirror_of_update_to_manual_stock
AFTER INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.mirror_of_update_to_manual_stock();

-- 4. LIMPEZA DE AJUSTES MANUAIS DE CORREÇÃO (FANTASMAS)
-- Removemos lançamentos manuais que foram feitos apenas para tentar "forçar" o saldo a aparecer,
-- já que o saldo real estava sendo engolido por duplicidade de reservas.
DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NULL 
AND (reason ILIKE '%correção%estoque%' OR reason ILIKE '%fantasma%' OR reason ILIKE '%reparar%')
AND created_at >= '2026-08-08';
