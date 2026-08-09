-- Backfill and Fix Trigger for Manual Stock Synchronization
-- 1. Fix trigger to handle NULL machine_id correctly (SEM MÁQUINA)
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client uuid;
BEGIN
  IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.type::text IN ('reserve','release','out')
     OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
  THEN
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
    ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mirror_of_to_manual_stock() TO service_role;

-- 2. Backfill missing 'out' movements from billing orders
INSERT INTO public.manual_stock_movements
  (company_id, article_id, client_id, machine_id, billing_order_id,
   type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine)
SELECT 
  sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
  sm.type::text, COALESCE(sm.pieces,0), COALESCE(sm.weight_kg,0),
  sm.reason, sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE sm.type = 'out' 
  AND sm.billing_order_id IS NOT NULL
  AND NOT COALESCE(sm.is_second_quality, false)
  AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements msm 
    WHERE msm.source_movement_id = sm.id
  )
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;
