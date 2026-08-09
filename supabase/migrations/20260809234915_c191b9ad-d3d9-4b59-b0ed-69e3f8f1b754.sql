-- 1. ADICIONAR CONSTRAINT UNIQUE PARA GARANTIR IDEMPOTÊNCIA (Se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_stock_movements_source_movement_id_key') THEN
        ALTER TABLE public.manual_stock_movements ADD CONSTRAINT manual_stock_movements_source_movement_id_key UNIQUE (source_movement_id);
    END IF;
END $$;

-- 2. LIMPEZA DE DUPLICIDADES E GHOST DATA (Agora com garantia de constraint)
DELETE FROM public.manual_stock_movements 
WHERE billing_order_id IS NOT NULL 
AND source_movement_id IS NULL;

-- 3. UNIFICAÇÃO DOS GATILHOS (Remoção da redundância que zera o estoque)
DROP TRIGGER IF EXISTS trg_mirror_of_to_manual_stock ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_mirror_of_update_to_manual_stock ON public.stock_movements;

CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.billing_order_id IS NULL AND NEW.type::text NOT IN ('in', 'adjust_in') THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.manual_stock_movements (
        company_id, article_id, client_id, machine_id, billing_order_id,
        type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
    )
    VALUES (
        NEW.company_id, NEW.article_id, NEW.client_id, NEW.machine_id, NEW.billing_order_id,
        NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
        COALESCE(NEW.reason, 'Sincronização Física'),
        NEW.id, NEW.created_by, NEW.created_at, false
    )
    ON CONFLICT (source_movement_id) 
    DO UPDATE SET 
        pieces = EXCLUDED.pieces,
        weight_kg = EXCLUDED.weight_kg,
        type = EXCLUDED.type,
        machine_id = EXCLUDED.machine_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mirror_of_update_to_manual_stock
AFTER INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.mirror_of_update_to_manual_stock();

-- 4. RESTAURAÇÃO DE LASTRO FÍSICO (Backfill das 5.000+ peças)
INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    'Restauração de saldo físico original', sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE sm.type::text IN ('in', 'adjust_in')
AND NOT EXISTS (SELECT 1 FROM public.manual_stock_movements ms WHERE ms.source_movement_id = sm.id)
ON CONFLICT (source_movement_id) DO NOTHING;

-- 5. VERIFICAÇÃO FINAL
SELECT 
    a.name as article,
    SUM(CASE WHEN m.type IN ('adjust_in', 'in') THEN m.pieces ELSE 0 END) as entradas,
    SUM(CASE WHEN m.type IN ('adjust_out', 'out') THEN m.pieces ELSE 0 END) as saídas,
    SUM(CASE WHEN m.type = 'reserve' THEN m.pieces WHEN m.type = 'release' THEN -m.pieces ELSE 0 END) as reservadas
FROM public.manual_stock_movements m
JOIN public.articles a ON a.id = m.article_id
WHERE a.name IN ('MALHA EXCLUSIVE', 'RIBANA 2x1 EXCLUSIVE')
GROUP BY a.name;
