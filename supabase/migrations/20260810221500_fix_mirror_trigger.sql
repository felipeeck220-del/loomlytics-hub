CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client uuid;
BEGIN
  -- 1. Ignore second quality
  IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  -- 2. Only mirror if the Billing Order is NOT collected/cancelled (for reserve/release)
  -- Or if it IS a real physical movement (out/in)
  IF NEW.type::text IN ('reserve', 'release') THEN
    IF EXISTS (
      SELECT 1 FROM public.billing_orders bo 
      WHERE bo.id = NEW.billing_order_id 
        AND bo.status IN ('collected', 'cancelled')
    ) THEN
      RETURN NEW; -- Don't mirror reserves for closed orders
    END IF;
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

-- Cleanup existing inconsistent data
DO $$
BEGIN
    DELETE FROM public.manual_stock_movements msm
    USING public.billing_orders bo
    WHERE msm.billing_order_id = bo.id
      AND msm.type IN ('reserve', 'release')
      AND bo.status IN ('collected', 'cancelled');

    DELETE FROM public.manual_stock_movements
    WHERE type IN ('reserve', 'release')
      AND billing_order_id IS NOT NULL
      AND billing_order_id NOT IN (SELECT id FROM public.billing_orders);
END $$;
