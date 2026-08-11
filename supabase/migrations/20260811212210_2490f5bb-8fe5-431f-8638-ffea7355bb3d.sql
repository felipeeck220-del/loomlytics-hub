CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.status = 'collected' AND OLD.status != 'collected' THEN
        -- Remove registros de separação (paletes)
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = NEW.id;
        
        -- Garante que nenhuma reserva fique pendente após a coleta
        INSERT INTO public.stock_movements (
            company_id, type, article_id, client_id, machine_id, 
            pieces, weight_kg, reason, created_by, billing_order_id
        )
        SELECT 
            company_id, 'release', article_id, client_id, machine_id, 
            pieces, weight_kg, 'Auto-limpeza na coleta', NEW.collected_by, NEW.id
        FROM public.stock_movements 
        WHERE billing_order_id = NEW.id AND type = 'reserve';
    END IF;
    RETURN NEW;
END;
$function$;

DO $$
DECLARE
  v_of_id uuid := '2bb3396b-313b-4bf7-ace6-855ba7dc3197';
  v_company_id uuid := 'a664927c-a285-4997-8faa-8c90985c6fac';
  v_profile_id uuid := '3d480093-837e-42bd-8575-a578a06ff2b4'; -- Felipe #832
  v_of_number text := '558';
  v_had_out boolean;
BEGIN
  -- 1. Atualizar Status para collected
  UPDATE public.billing_orders SET 
    status = 'collected', 
    collected_by = v_profile_id, 
    collected_at = now(), 
    priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL, 
    updated_at = now() 
  WHERE id = v_of_id AND status = 'ready';

  -- 2. Movimentações de Estoque
  WITH netted AS (
    SELECT article_id, client_id, machine_id, 
      SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END)::numeric AS p_net,
      SUM(CASE WHEN type='reserve' THEN weight_kg ELSE -weight_kg END)::numeric AS w_net
    FROM public.stock_movements 
    WHERE billing_order_id = v_of_id AND type IN ('reserve','release')
    GROUP BY article_id, client_id, machine_id
  ),
  ins_rel AS (
    INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT v_company_id, article_id, client_id, machine_id, v_of_id, 'release', GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net), 'OF #' || v_of_number || ' coletada (libera reserva) - Mover Manual', v_profile_id
    FROM netted WHERE p_net > 0 OR w_net > 0 RETURNING 1
  ),
  ins_out AS (
    INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT v_company_id, article_id, client_id, machine_id, v_of_id, 'out', GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net), 'OF #' || v_of_number || ' coletada - Mover Manual', v_profile_id
    FROM netted WHERE p_net > 0 OR w_net > 0 RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM ins_out) > 0 INTO v_had_out;

  IF NOT v_had_out THEN
    IF EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = v_of_id AND own_article_id IS NULL) THEN
      INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
      SELECT v_company_id, article_id, client_id, machine_id, v_of_id, 'out', GREATEST(0, ROUND(SUM(pieces)))::int, GREATEST(0, SUM(weight_kg)), 'OF #' || v_of_number || ' coletada - Mover Manual', v_profile_id
      FROM public.billing_order_pallets WHERE billing_order_id = v_of_id AND own_article_id IS NULL GROUP BY machine_id;
    ELSE
      INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
      SELECT v_company_id, article_id, client_id, machine_id, v_of_id, 'out', GREATEST(0, ROUND(COALESCE(pieces_real, pieces_expected, 0)))::int, GREATEST(0, COALESCE(weight_real, weight_expected, 0)), 'OF #' || v_of_number || ' coletada - Mover Manual', v_profile_id
      FROM public.billing_orders WHERE id = v_of_id;
    END IF;
  END IF;

  -- 3. Auditoria
  PERFORM public._of_audit(v_company_id, v_of_id, 'billing_order_collect', 'Felipe', '832', jsonb_build_object('of', v_of_number, 'method', 'manual_move'));
END;
$$;