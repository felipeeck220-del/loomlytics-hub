-- 1) Função e trigger para manter pieces_real/weight_real/weight_avg coerentes com os paletes
CREATE OR REPLACE FUNCTION public.sync_billing_order_from_pallets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_status text;
  v_pieces numeric;
  v_weight numeric;
BEGIN
  v_order_id := COALESCE(NEW.billing_order_id, OLD.billing_order_id);
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM public.billing_orders WHERE id = v_order_id;
  -- Só sincroniza quando a OF já foi finalizada (ready) ou coletada. Em 'separating'
  -- os campos pieces_real/weight_real ficam nulos por definição até a finalização.
  IF v_status NOT IN ('ready', 'collected') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
    INTO v_pieces, v_weight
  FROM public.billing_order_pallets
  WHERE billing_order_id = v_order_id;

  UPDATE public.billing_orders
     SET pieces_real = v_pieces,
         weight_real = v_weight,
         weight_avg  = CASE WHEN v_pieces > 0 THEN v_weight / v_pieces ELSE 0 END
   WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_billing_order_from_pallets ON public.billing_order_pallets;
CREATE TRIGGER trg_sync_billing_order_from_pallets
AFTER INSERT OR UPDATE OR DELETE ON public.billing_order_pallets
FOR EACH ROW EXECUTE FUNCTION public.sync_billing_order_from_pallets();

-- 2) Reconciliação retroativa: para toda OF em ready/collected que tem paletes,
--    força pieces_real/weight_real/weight_avg a refletirem a soma atual.
WITH sums AS (
  SELECT bo.id,
         COALESCE(SUM(p.pieces), 0)   AS sum_p,
         COALESCE(SUM(p.weight_kg),0) AS sum_w
    FROM public.billing_orders bo
    JOIN public.billing_order_pallets p ON p.billing_order_id = bo.id
   WHERE bo.status IN ('ready', 'collected')
   GROUP BY bo.id
)
UPDATE public.billing_orders bo
   SET pieces_real = s.sum_p,
       weight_real = s.sum_w,
       weight_avg  = CASE WHEN s.sum_p > 0 THEN s.sum_w / s.sum_p ELSE 0 END
  FROM sums s
 WHERE bo.id = s.id
   AND (bo.pieces_real IS DISTINCT FROM s.sum_p
        OR bo.weight_real IS DISTINCT FROM s.sum_w);