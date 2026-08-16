- **16/08/2026 (Brasília) — Ajuste de Layout no Lançamento Manual:**
    - Corrigido vazamento visual no modal de lançamento manual, alterando a disposição das opções de "Destino" (Expedição / Em máquina) de horizontal para vertical.

- **16/08/2026 (Brasília) — Controle de Paletes em Máquina no Estoque Malha (Manual):**
    - Implementada função "Em máquina" para separar peças em produção do estoque de expedição.
    - Adicionado KPI "Em maq." e colunas correspondentes nas listagens.
    - Criado botão "Palete" para máquinas que permite recontar saldo em máquina ou lançar para expedição.
    - Refatoradas as RPCs para considerar `on_machine` no cálculo do Saldo Disponível.

- **16/08/2026 (Brasília) — Ajustes Visuais e Mobile no Estoque Malha (Manual):**
    - Refatorados os KPIs de estoque para priorizar a visualização em **Peças** (número maior) sobre o Peso (número menor).
    - Removida a coluna "Disp. kg" das listagens para despoluir a interface, mantendo apenas "Disp. Peças".
    - Implementada visualização responsiva em **Cards** para mobile, eliminando scroll horizontal excessivo.
    - Sincronizado o mapeamento da coluna `description` no histórico de movimentações.

- **16/08/2026 (Brasília) — Estabilização de RLS no Estoque Malha (Manual):**
    - Refatoradas as políticas de segurança (RLS) da tabela `manual_stock_movements` para utilizar o padrão `user_active_company`.
    - Corrigido o erro de permissão que impedia administradores de realizar lançamentos manuais.
    - Sincronizada a lógica de isolamento multi-tenant com o restante do sistema (Faturamento/Mecânica).

- **16/08/2026 (Brasília) — Correção no Lançamento Manual de Estoque:**
    - Corrigido o erro no modal de lançamento manual onde tentava inserir na coluna inexistente `reason`. A coluna correta no banco é `description`.
    - Atualizada a RPC `get_manual_stock_estoque_independent` para suportar KPIs de Entrada e Saída.
    - Implementado layout colapsável Cliente > Artigo > Máquina e aba de Movimentações.
    - Restaurado item no Sidebar.


- **16/08/2026 (Brasília) — Limpeza de Sidebar:**
    - Removida a entrada "Estoque Malha (Manual)" do Sidebar, consolidando a exclusão do módulo.

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



