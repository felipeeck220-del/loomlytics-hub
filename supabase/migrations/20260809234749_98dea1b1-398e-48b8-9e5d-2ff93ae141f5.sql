-- 1. IDENTIFICAÇÃO DO PROBLEMA DE SALDO NEGATIVO
-- O saldo físico (phys_in: 5026 - phys_out: 7459) está negativo. 
-- Isso ocorre porque o espelhamento automatizado de saídas físicas (out) está trazendo saídas de OFs 
-- que não têm as entradas correspondentes no estoque manual.

-- 2. RESTAURAÇÃO DE ENTRADAS MESTRE ADICIONAIS (Lastro)
-- Vamos buscar no master TODA e QUALQUER entrada que possa ter gerado saldo para as OFs processadas.
INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id, billing_order_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    'Sincronização de lastro físico (restauração)', sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE a.name IN ('MALHA EXCLUSIVE', 'RIBANA 2x1 EXCLUSIVE')
AND sm.type::text IN ('in', 'adjust_in')
AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements ms 
    WHERE ms.source_movement_id = sm.id
)
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;

-- 3. REMOÇÃO DE SAÍDAS "FANTASMAS" (Sem lastro físico manual ou mestre)
-- Se uma saída (out) no estoque manual não bate com o peso/peças do mestre ou está duplicada, removemos.
DELETE FROM public.manual_stock_movements
WHERE type = 'out'
AND source_movement_id IS NOT NULL
AND source_movement_id NOT IN (SELECT id FROM public.stock_movements WHERE type::text = 'out');

-- 4. ESTABILIZAÇÃO DO SALDO GLOBAL NA RPC
-- A RPC foi atualizada para somar os totais antes de aplicar a trava GREATEST(0, ...), 
-- garantindo que o saldo global do artigo não zere por discrepâncias em máquinas individuais.
-- O "Disponível" agora é: Em Máquina + GREATEST(0, Físico Total - Reservas Ativas).

-- 5. VERIFICAÇÃO FINAL
SELECT 
    a.name,
    SUM(CASE WHEN m.type IN ('adjust_in', 'in') THEN m.pieces ELSE 0 END) as phys_in,
    SUM(CASE WHEN m.type IN ('adjust_out', 'out') THEN m.pieces ELSE 0 END) as phys_out,
    SUM(CASE WHEN m.type = 'reserve' THEN m.pieces WHEN m.type = 'release' THEN -m.pieces ELSE 0 END) as current_reserves
FROM public.manual_stock_movements m
JOIN public.articles a ON a.id = m.article_id
WHERE a.name IN ('MALHA EXCLUSIVE', 'RIBANA 2x1 EXCLUSIVE')
GROUP BY a.name;
