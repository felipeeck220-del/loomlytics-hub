-- Função para processar transações de agulhas e atualizar logs de máquina
CREATE OR REPLACE FUNCTION public.handle_needle_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_company_id UUID;
BEGIN
    -- Obter o company_id se não estiver presente (segurança)
    IF NEW.company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
        NEW.company_id := v_company_id;
    END IF;

    -- 1. Atualizar o estoque físico
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

        -- 2. Se for troca de agulheiro, atualizar a máquina e criar log
        IF NEW.exit_mode = 'troca_agulheiro' AND NEW.machine_id IS NOT NULL THEN
            -- Atualizar data na tabela machines
            UPDATE public.machines 
            SET last_needle_change_at = NEW.date::timestamp with time zone,
                updated_at = now()
            WHERE id = NEW.machine_id;

            -- Criar entrada automática em machine_logs para aparecer no calendário e detalhes
            INSERT INTO public.machine_logs (
                id, 
                machine_id, 
                company_id, 
                status, 
                started_at, 
                ended_at, 
                started_by_name
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar o trigger
DROP TRIGGER IF EXISTS tr_handle_needle_transaction ON public.needle_transactions;
CREATE TRIGGER tr_handle_needle_transaction
BEFORE INSERT ON public.needle_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_needle_transaction_trigger();