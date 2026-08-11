-- 1. Saneamento de reservas órfãs (usam article_id e pieces/weight_kg)
INSERT INTO public.stock_movements (
    company_id,
    type,
    article_id,
    client_id,
    machine_id,
    pieces,
    weight_kg,
    reason,
    created_by,
    billing_order_id
)
SELECT 
    m.company_id,
    'release',
    m.article_id,
    m.client_id,
    m.machine_id,
    m.pieces,
    m.weight_kg,
    'Saneamento: Liberação de reserva órfã (OF coletada)',
    m.created_by,
    m.billing_order_id
FROM public.stock_movements m
JOIN public.billing_orders o ON m.billing_order_id = o.id
WHERE o.status = 'collected' 
AND m.type = 'reserve'
AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sub 
    WHERE sub.billing_order_id = m.billing_order_id 
    AND sub.type = 'release' 
    AND sub.article_id = m.article_id
    AND (sub.machine_id = m.machine_id OR (sub.machine_id IS NULL AND m.machine_id IS NULL))
    AND sub.pieces = m.pieces
    AND sub.weight_kg = m.weight_kg
);

-- 2. Limpeza de paletes em ordens finalizadas
DELETE FROM public.billing_order_pallets
WHERE billing_order_id IN (
    SELECT id FROM public.billing_orders WHERE status = 'collected'
);

-- 3. Trigger para garantir integridade em futuras coletas
CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
RETURNS TRIGGER AS $$
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
            pieces, weight_kg, 'Auto-limpeza na coleta', NEW.updated_by, NEW.id
        FROM public.stock_movements 
        WHERE billing_order_id = NEW.id AND type = 'reserve';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_billing_order_status_integrity ON public.billing_orders;
CREATE TRIGGER tr_billing_order_status_integrity
    AFTER UPDATE OF status ON public.billing_orders
    FOR EACH ROW
    WHEN (NEW.status = 'collected')
    EXECUTE FUNCTION public.handle_billing_order_status_change();
