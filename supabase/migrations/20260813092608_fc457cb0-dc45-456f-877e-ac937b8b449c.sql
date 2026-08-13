
BEGIN;

-- 1. Mover OF #613 para coletada manualmente para destravar o usuário
UPDATE public.billing_orders 
SET status = 'collected',
    collected_at = now(),
    updated_at = now()
WHERE of_number = '613' AND status != 'collected';

-- 2. Limpar paletes da #613 que possam estar prendendo ela na aba 'Pronto' por lógica de JOIN ou trigger
DELETE FROM public.billing_order_pallets 
WHERE billing_order_id IN (SELECT id FROM public.billing_orders WHERE of_number = '613');

-- 3. Reforçar a trigger de status para garantir que não haja recursão ou falha de limpeza
CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Se mudou para coletada ou cancelada, garante a limpeza de paletes
    IF (NEW.status = 'collected' OR NEW.status = 'cancelled') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Garantir que a trigger está ativa e é AFTER para não interferir na integridade do cabeçalho
DROP TRIGGER IF EXISTS tr_billing_order_status_change ON public.billing_orders;
CREATE TRIGGER tr_billing_order_status_change
    AFTER UPDATE OF status ON public.billing_orders
    FOR EACH ROW
    WHEN (NEW.status IN ('collected', 'cancelled') AND (OLD.status IS NULL OR OLD.status != NEW.status))
    EXECUTE FUNCTION public.handle_billing_order_status_change();

COMMIT;
