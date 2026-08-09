-- 1. Restaurar os movimentos do tipo 'out' e 'reserve'/'release' que sumiram devido ao filtro de status no trigger
INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id, billing_order_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    sm.reason, sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE (
    sm.type::text IN ('reserve', 'release', 'out')
    OR (sm.type::text = 'in' AND sm.billing_order_id IS NOT NULL)
)
AND COALESCE(sm.is_second_quality, false) = false
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
DO UPDATE SET
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    type = EXCLUDED.type,
    billing_order_id = EXCLUDED.billing_order_id;

-- 2. Corrigir a função de trigger principal para NÃO ignorar ordens coletadas/prontas.
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_article_id UUID;
    v_client_id UUID;
BEGIN
    SELECT client_id, article_id 
    INTO v_client_id, v_article_id
    FROM public.billing_orders
    WHERE id = NEW.billing_order_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.manual_stock_movements (
            company_id, client_id, article_id, machine_id,
            type, weight_kg, pieces, billing_order_id,
            created_at, source_movement_id, reason, created_by
        ) VALUES (
            NEW.company_id, v_client_id, v_article_id, NEW.machine_id,
            NEW.type::text, COALESCE(NEW.weight_kg, 0), COALESCE(NEW.pieces, 0), NEW.billing_order_id,
            NEW.created_at, NEW.id, NEW.reason, NEW.created_by
        )
        ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
        DO UPDATE SET
            weight_kg = EXCLUDED.weight_kg,
            pieces = EXCLUDED.pieces,
            type = EXCLUDED.type;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- 3. Limpeza de movimentos duplicados ou "fantasmas" sem origem (manter manuais puros e espelhos válidos)
DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NULL 
AND billing_order_id IS NOT NULL
AND type IN ('reserve', 'release', 'out');

-- 4. Reaplicar GRANTs (usando a assinatura correta descoberta via introspecção)
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated;
GRANT ALL ON TABLE public.manual_stock_movements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
