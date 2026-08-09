-- 1. IDENTIFICAÇÃO E LIMPEZA RIGOROSA DE DUPLICIDADE
-- Existem movimentos no manual_stock_movements que têm billing_order_id mas NÃO têm source_movement_id.
-- Estes foram criados pelo trigger trg_mirror_of_to_manual_stock (agora removido) que não gravava a origem.
-- Como eles coexistem com os movimentos do trg_mirror_of_update_to_manual_stock (que grava origem), as reservas dobram.

-- Remover movimentos "espelhados órfãos" (sem link de origem) que causam duplicidade no saldo.
DELETE FROM public.manual_stock_movements
WHERE billing_order_id IS NOT NULL 
AND source_movement_id IS NULL;

-- 2. LIMPEZA DE MOVIMENTOS COM ORIGEM INVÁLIDA OU FANTASMAS
-- Se por algum motivo existirem registros que não batem com o stock_movements principal, limpamos.
DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NOT NULL
AND source_movement_id NOT IN (SELECT id FROM public.stock_movements);

-- 3. RE-SINCRONIZAÇÃO COMPLETA (BACKFILL)
-- Agora que limpamos o lixo, garantimos que todos os movimentos legítimos da stock_movements estejam aqui.
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
