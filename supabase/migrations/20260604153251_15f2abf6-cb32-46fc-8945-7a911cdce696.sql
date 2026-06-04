CREATE OR REPLACE FUNCTION public.handle_needle_transaction_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company_id UUID;
BEGIN
    IF NEW.company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
        NEW.company_id := v_company_id;
    END IF;

    IF NEW.type = 'entry' THEN
        UPDATE public.needle_inventory
        SET current_quantity = current_quantity + NEW.quantity,
            updated_at = now()
        WHERE id = NEW.needle_id;
    ELSIF NEW.type = 'exit' THEN
        UPDATE public.needle_inventory
        SET current_quantity = current_quantity - NEW.quantity,
            updated_at = now()
        WHERE id = NEW.needle_id;

        IF NEW.exit_mode = 'troca_agulheiro' AND NEW.machine_id IS NOT NULL THEN
            UPDATE public.machines
            SET last_needle_change_at = NEW.date::timestamp with time zone
            WHERE id = NEW.machine_id;

            INSERT INTO public.machine_logs (
                id, machine_id, company_id, status, started_at, ended_at, started_by_name
            ) VALUES (
                gen_random_uuid(),
                NEW.machine_id,
                NEW.company_id,
                'troca_agulhas',
                NEW.date::timestamp with time zone,
                NEW.date::timestamp with time zone,
                NEW.created_by_name
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Remove dados de teste de agulhas e suas transações (caso ainda existam)
DELETE FROM public.needle_transactions WHERE needle_id IN ('79f173ed-4e93-4917-b0ae-bdc8790f177b','aac1f323-2424-4382-b4ec-6f8be56f4446');
DELETE FROM public.needle_inventory WHERE id IN ('79f173ed-4e93-4917-b0ae-bdc8790f177b','aac1f323-2424-4382-b4ec-6f8be56f4446');