-- 1. IDENTIFICAÇÃO E LIMPEZA DE MOVIMENTOS "FANTASMA" RECENTES
-- A análise mostrou múltiplos 'release' (liberação) para o mesmo palete no mesmo milissegundo em 09/08/2026.
-- Isso é sintoma de um loop de gatilho ou execução concorrente que gerou lixo.

-- Limpar movimentos manuais de reserva/liberação que não possuem correspondente exato e íntegro no stock_movements mestre.
DELETE FROM public.manual_stock_movements m
WHERE m.type IN ('reserve', 'release')
AND m.source_movement_id IS NOT NULL
AND m.source_movement_id NOT IN (SELECT id FROM public.stock_movements);

-- Limpar movimentos de reserva de ordens finalizadas (redundância de segurança)
DELETE FROM public.manual_stock_movements m
WHERE m.type IN ('reserve', 'release')
AND m.billing_order_id IN (SELECT id FROM public.billing_orders WHERE status IN ('collected', 'cancelled'));

-- 2. RE-SINCRONIZAÇÃO ESTRITA E IDEMPOTENTE
-- Reconstruímos a ponte apenas com o que existe no mestre agora.
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
LEFT JOIN public.billing_orders bo ON bo.id = sm.billing_order_id
WHERE (
    (sm.type::text IN ('reserve', 'release') AND bo.status NOT IN ('collected', 'cancelled'))
    OR sm.type::text = 'out'
    OR (sm.type::text = 'in' AND sm.billing_order_id IS NOT NULL)
)
AND COALESCE(sm.is_second_quality, false) = false
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL 
DO UPDATE SET
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    type = EXCLUDED.type;

-- 3. CORREÇÃO DE SALDO DISPONÍVEL (PREVENÇÃO DE NEGATIVOS FANTASMAS)
-- Se após a limpeza ainda houver discrepância por causa de entradas manuais mal registradas, 
-- o cálculo na RPC já trava em zero, mas vamos garantir que o dashboard não mostre "0" se houver entradas físicas.
-- A RPC get_manual_stock_estoque usa phys_final que faz GREATEST(0, ...).

-- Verificação final de saldo para o cliente Bil Têxtil
SELECT 
    a.name,
    SUM(CASE WHEN m.type IN ('adjust_in', 'in') THEN m.pieces ELSE 0 END) as total_in,
    SUM(CASE WHEN m.type IN ('adjust_out', 'out') THEN m.pieces ELSE 0 END) as total_out,
    SUM(CASE WHEN m.type = 'reserve' THEN m.pieces WHEN m.type = 'release' THEN -m.pieces ELSE 0 END) as current_reserve
FROM public.manual_stock_movements m
JOIN public.articles a ON a.id = m.article_id
WHERE a.name IN ('MALHA EXCLUSIVE', 'RIBANA 2x1 EXCLUSIVE')
GROUP BY a.name;
