
-- Handle UPDATE and DELETE on needle_transactions to keep inventory balanced

CREATE OR REPLACE FUNCTION public.handle_needle_transaction_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reverse OLD effect
  IF OLD.type = 'entry' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity - OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  ELSIF OLD.type = 'exit' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity + OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  END IF;

  -- Apply NEW effect
  IF NEW.type = 'entry' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity + NEW.quantity, updated_at = now()
    WHERE id = NEW.needle_id;
  ELSIF NEW.type = 'exit' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity - NEW.quantity, updated_at = now()
    WHERE id = NEW.needle_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_needle_transaction_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'entry' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity - OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  ELSIF OLD.type = 'exit' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity + OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_handle_needle_transaction_update ON public.needle_transactions;
CREATE TRIGGER tr_handle_needle_transaction_update
BEFORE UPDATE ON public.needle_transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_needle_transaction_update();

DROP TRIGGER IF EXISTS tr_handle_needle_transaction_delete ON public.needle_transactions;
CREATE TRIGGER tr_handle_needle_transaction_delete
BEFORE DELETE ON public.needle_transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_needle_transaction_delete();
