-- 1. LIMPEZA DEFINITIVA DE RESERVAS FANTASMAS
-- Removemos do estoque manual qualquer reserva ou liberação vinculada a ordens já coletadas ou canceladas.
-- Isso é necessário porque o cálculo de saldo subtrai Reservas Ativas do Físico. 
-- Se a reserva persistir após a coleta, o saldo zera.
DELETE FROM public.manual_stock_movements m
WHERE m.type IN ('reserve', 'release')
AND m.billing_order_id IN (
    SELECT id FROM public.billing_orders 
    WHERE status IN ('collected', 'cancelled')
);

-- 2. RE-SINCRONIZAÇÃO APENAS DE RESERVAS DE ORDENS ATIVAS
-- Garantimos que apenas o que é REALMENTE reserva atual esteja no sistema.
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
JOIN public.billing_orders bo ON bo.id = sm.billing_order_id
WHERE sm.type::text IN ('reserve', 'release')
AND bo.status NOT IN ('collected', 'cancelled')
AND COALESCE(sm.is_second_quality, false) = false
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL 
DO UPDATE SET
    pieces = EXCLUDED.pieces,
    type = EXCLUDED.type;

-- 3. AJUSTE DE TRIGGER PARA LIDAR COM DELEÇÃO DE RESERVAS COLETADAS
-- Garantimos que quando uma OF é coletada, o gatilho remova a reserva espelhada.
CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_mirror boolean;
  v_client uuid;
  v_bo_status text;
BEGIN
  -- Verificar o status da ordem se houver uma
  IF NEW.billing_order_id IS NOT NULL THEN
    SELECT status::text INTO v_bo_status FROM public.billing_orders WHERE id = NEW.billing_order_id;
  END IF;

  -- Se for uma reserva de uma ordem já coletada ou cancelada, não deve existir no manual
  IF NEW.type::text IN ('reserve', 'release') AND v_bo_status IN ('collected', 'cancelled') THEN
    DELETE FROM public.manual_stock_movements WHERE source_movement_id = NEW.id;
    RETURN NEW;
  END IF;

  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

  IF NOT v_should_mirror THEN
    DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
    RETURN NEW;
  END IF;

  v_client := NEW.client_id;
  IF v_client IS NULL THEN
    SELECT a.client_id INTO v_client FROM public.articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
  END IF;

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
