CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_should_mirror boolean;
BEGIN
  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

  IF NOT v_should_mirror THEN
    DELETE FROM public.manual_stock_movements
    WHERE source_movement_id = OLD.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, billing_order_id,
     type, pieces, weight_kg, reason, source_movement_id, created_by, created_at)
  VALUES
    (NEW.company_id, NEW.article_id, NEW.client_id, NEW.machine_id, NEW.billing_order_id,
     NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
     NEW.reason, NEW.id, NEW.created_by, NEW.created_at)
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

DROP TRIGGER IF EXISTS trg_mirror_of_update_to_manual_stock ON public.stock_movements;
CREATE TRIGGER trg_mirror_of_update_to_manual_stock
AFTER UPDATE OF company_id, article_id, client_id, machine_id, billing_order_id,
  type, pieces, weight_kg, reason, created_by, created_at, is_second_quality
ON public.stock_movements
FOR EACH ROW
WHEN (
  OLD.company_id IS DISTINCT FROM NEW.company_id
  OR OLD.article_id IS DISTINCT FROM NEW.article_id
  OR OLD.client_id IS DISTINCT FROM NEW.client_id
  OR OLD.machine_id IS DISTINCT FROM NEW.machine_id
  OR OLD.billing_order_id IS DISTINCT FROM NEW.billing_order_id
  OR OLD.type IS DISTINCT FROM NEW.type
  OR OLD.pieces IS DISTINCT FROM NEW.pieces
  OR OLD.weight_kg IS DISTINCT FROM NEW.weight_kg
  OR OLD.reason IS DISTINCT FROM NEW.reason
  OR OLD.created_by IS DISTINCT FROM NEW.created_by
  OR OLD.created_at IS DISTINCT FROM NEW.created_at
  OR OLD.is_second_quality IS DISTINCT FROM NEW.is_second_quality
)
EXECUTE FUNCTION public.mirror_of_update_to_manual_stock();

REVOKE ALL ON FUNCTION public.mirror_of_update_to_manual_stock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_of_update_to_manual_stock() TO service_role;