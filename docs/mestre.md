- **16/08/2026 (Brasília) — Auditoria Técnica e Pente Fino de Inconsistências:**
    - Realizada auditoria completa em todas as RPCs de Faturamento (OF) para garantir o padrão de 6 argumentos na função `_of_audit`.
    - Validada a integridade referencial em `collect_billing_order` e `cancel_billing_order` (Profile ID UUID vs User ID).
    - Confirmada a eficácia das travas pessimistas (`FOR UPDATE`) para eliminar o "efeito fantasma" em transições de status.
    - Otimizada a performance do módulo de Mecânica com o bootstrap consolidado `get_mecanica_bootstrap`, reduzindo a carga inicial.
    - Verificada a exclusão total do módulo de Estoque Malha (Manual) antigo, garantindo que não restaram referências órfãs ou triggers ativos.
    - Estabilizado o hook `useBillingOrders.ts` com estratégia de invalidação agressiva e delay tático de 500ms.

- **16/08/2026 (Brasília) — Remoção do Módulo Estoque Malha (Manual):**
    - Excluído integralmente o módulo independente de Estoque Malha (Manual), incluindo tabelas (`manual_stock_movements`), RPCs e componentes de interface.
    - Revertidas referências no `AppLayout`, `Admin` e `StockMalha`.

- **14/08/2026 (Brasília) — Simplificação do Módulo de Faturamento (OF):**
    - Desvinculada integralmente a **Ordem de Faturamento (OF)** do **Estoque de Malha**.
    - Removida a lógica de reservas de estoque, limpeza de paletes e estorno automático ao coletar ou cancelar OFs.
    - O módulo agora funciona como um controle logístico e de faturamento puro, eliminando o "efeito fantasma" e latências causadas por triggers de estoque pesadas.
    - Removidas opções de "Origem do Estoque" (Cliente, Outro Artigo, Estoque Trama) do modal de paletes.
    - Reduzido o delay de sincronização no hook `useBillingOrders.ts` para **500ms**, tornando a interface muito mais rápida.
...



