
CREATE OR REPLACE FUNCTION public.handle_needle_transaction_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reverse OLD inventory effect
  IF OLD.type = 'entry' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity - OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  ELSIF OLD.type = 'exit' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity + OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  END IF;

  -- Apply NEW inventory effect
  IF NEW.type = 'entry' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity + NEW.quantity, updated_at = now()
    WHERE id = NEW.needle_id;
  ELSIF NEW.type = 'exit' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity - NEW.quantity, updated_at = now()
    WHERE id = NEW.needle_id;
  END IF;

  -- Clean machine_logs row if OLD was a needle change (troca_agulheiro)
  IF OLD.type = 'exit' AND OLD.exit_mode = 'troca_agulheiro' AND OLD.machine_id IS NOT NULL THEN
    DELETE FROM public.machine_logs
    WHERE machine_id = OLD.machine_id
      AND status = 'troca_agulhas'
      AND started_at::date = OLD.date;
  END IF;

  -- Recreate machine_logs row if NEW is troca_agulheiro
  IF NEW.type = 'exit' AND NEW.exit_mode = 'troca_agulheiro' AND NEW.machine_id IS NOT NULL THEN
    UPDATE public.machines
      SET last_needle_change_at = NEW.date::timestamptz
    WHERE id = NEW.machine_id;

    INSERT INTO public.machine_logs (
      id, machine_id, company_id, status, started_at, ended_at, started_by_name
    ) VALUES (
      gen_random_uuid(), NEW.machine_id, NEW.company_id, 'troca_agulhas',
      NEW.date::timestamptz, NEW.date::timestamptz, NEW.created_by_name
    );
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
  -- Reverse inventory effect
  IF OLD.type = 'entry' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity - OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  ELSIF OLD.type = 'exit' THEN
    UPDATE public.needle_inventory
      SET current_quantity = current_quantity + OLD.quantity, updated_at = now()
    WHERE id = OLD.needle_id;
  END IF;

  -- Clean machine_logs if it was troca_agulheiro
  IF OLD.type = 'exit' AND OLD.exit_mode = 'troca_agulheiro' AND OLD.machine_id IS NOT NULL THEN
    DELETE FROM public.machine_logs
    WHERE machine_id = OLD.machine_id
      AND status = 'troca_agulhas'
      AND started_at::date = OLD.date;
  END IF;

  RETURN OLD;
END;
$$;
