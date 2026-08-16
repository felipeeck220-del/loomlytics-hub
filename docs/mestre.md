- **14/08/2026 (Brasília) — Simplificação do Módulo de Faturamento (OF):**
    - Desvinculada integralmente a **Ordem de Faturamento (OF)** do **Estoque de Malha**.
    - Removida a lógica de reservas de estoque, limpeza de paletes e estorno automático ao coletar ou cancelar OFs.
    - O módulo agora funciona como um controle logístico e de faturamento puro, eliminando o "efeito fantasma" e latências causadas por triggers de estoque pesadas.
    - Removidas opções de "Origem do Estoque" (Cliente, Outro Artigo, Estoque Trama) do modal de paletes.
    - Reduzido o delay de sincronização no hook `useBillingOrders.ts` para **500ms**, tornando a interface muito mais rápida.

- **14/08/2026 (Brasília) — Estabilização Crítica e Refatoração de RPCs (OF):**
    - Corrigido erro de constraint FK (`billing_orders_collected_by_fkey` e `billing_orders_cancelled_by_fkey`) nas RPCs `collect_billing_order` e `cancel_billing_order`. As funções estavam tentando inserir o `auth.uid()` (ID do usuário) em colunas que exigem o Profile ID.
    - Refatoradas as RPCs para buscar o ID do perfil correto via `_of_current_profile_id` antes de realizar o update, garantindo integridade referencial com a tabela `profiles`.
    - Confirmada a transição atômica para os status `collected` e `cancelled` após a correção da integridade referencial.
    - Refatorada a RPC `start_billing_order_separation` para ser resiliente a contextos de sistema e corrigir erro de comparação de tipos (o status prioritário é uma flag booleana `priority`, não um valor do enum `status`).
    - Iniciada separação manualmente para a OF #626 (ID 8dd5aa93) via migração direta para resolver travamento na aba "Aberto".
    - Otimizadas as RPCs `collect_billing_order` e `launch_billing_order_ready` com travas pessimistas (`FOR UPDATE`) para eliminar o "efeito fantasma" e garantir atomicidade nas transições de status.
    - Refatorada a lógica do botão "Iniciar Separação" em `BillingOrders.tsx` para garantir visibilidade correta em ordens prioritárias.

- **13/08/2026 (Brasília) — Correção de Atrelação de OFs:**
    - Resolvido o erro "function public.link_billing_orders(p_author_code, p_author_name, p_company_id, p_ids) in the schema cache".
    - Sincronizada a assinatura da função `link_billing_orders` para aceitar 4 argumentos e realizar a auditoria canônica de 6 argumentos internamente.

- **13/08/2026 (Brasília) — Correção de Registro Duplicado de NF/Romaneio:**
    - Resolvido o erro "Documento já registrado" ao editar NF/Romaneio na RPC `set_billing_order_delivery_doc`.
    - Removida a trava de auditoria que impedia a atualização do número do documento quando ele já existia, permitindo correções de digitação sem conflitos de "already".

- **13/08/2026 (Brasília) — Movimentação Manual OF #569 e Estabilização de Coleta:**
    - Movimentada manualmente a OF #569 para "Coletadas" via RPC `collect_billing_order` (transação atômica).
    - Confirmada a preservação de peças (12) e peso (128.000) e a limpeza automática dos paletes.

- **13/08/2026 (Brasília) — Movimentação Manual OF #568 e Estabilização de Coleta:**
    - Movimentada manualmente a OF #568 para "Coletadas" via script SQL direto (transação atômica).
    - Confirmada a persistência de peças (120) e peso (2393.500) para a OF #568.

- **13/08/2026 (Brasília) — Pente Fino e Estabilização de Integridade (OF):**
    - Realizada auditoria técnica completa no módulo de faturamento (OF), consolidando gatilhos e eliminando redundâncias.
    - Validada a persistência de dados em OFs coletadas e realizado backfill preventivo para registros com valores zerados.
    - Reforçada a assinatura canônica de 6 argumentos na função de auditoria `_of_audit` em todo o backend.

- **13/08/2026 (Brasília) — Ajuste de Filtro na Aba Aberto Prioritário (OF):**
    - Corrigido o filtro da aba "Aberto Prioritário" para exibir apenas OFs em estado inicial (Aberto/Priority).

- **13/08/2026 (Brasília) — Estabilização Definitiva da OF #613 e Coleta (Final):**
    - Reforçada a trigger `AFTER UPDATE` para garantir limpeza de paletes em qualquer transição para `collected/cancelled`.

- **12/08/2026 (Brasília) — Pente Fino e Estabilização Final (OF):**
    - Corrigida ambiguidade na RPC `cancel_billing_order` através da remoção de versões duplicadas e consolidação em uma única assinatura com tipos de argumentos flexíveis.
    - Confirmado que todas as RPCs operacionais utilizam `SECURITY DEFINER`, `search_path = public` e bloqueio de linha `FOR UPDATE`.
    - Padronizada a auditoria centralizada em `_of_audit` com 6 argumentos em todo o fluxo de faturamento.

- **12/08/2026 (Brasília) — Correção Definitiva de FK e Registro de NF em OF:**
    - Resolvido erro `violates foreign key constraint "billing_orders_delivery_doc_set_by_fkey"` na RPC `set_billing_order_delivery_doc`.

- **12/08/2026 (Brasília) — Localização da OF #567 e Ajuste Visual em Aguardando NF/ROM:**
    - Corrigida a filtragem na aba `Aguardando NF/ROM` para permitir a exibição de OFs com prioridade que estejam no status `ready` (separadas), mas sem documento.

- **11/08/2026 (Brasília) — Pente Fino e Estabilização Final do Módulo de Faturamento (OF):**
    - Corrigida a trigger `handle_billing_order_status_change` para consolidar o total de peças e peso dos paletes no cabeçalho da OF antes de deletá-los.

- **08/08/2026 (Brasília) — Mecânica: Remoção de Skeletons e otimização visual:**
    - Spinner discreto com animação de pulso e texto informativo durante o carregamento dos dados.

- **14/08/2026 (Brasília) — Ordem de Faturamento (OF): fotos na coleta tornadas opcionais:**
    - Removida a obrigatoriedade de anexo de foto para finalizar a coleta de OFs, tornando o processo mais ágil conforme solicitação.

- **02/08/2026 (Brasília) — Pente fino Estoque Malha (Manual):**
    - Auditoria completa do módulo após as últimas entregas.
    - Corrigida a reserva de OF para baixar o disponível na quantidade exata.

- **02/08/2026 (Brasília) — Pente fino de segurança: RPCs de Relatórios e Dashboard sem isolamento de empresa:**
    - Auditoria das funções `SECURITY DEFINER` injetando guarda de tenant `public.get_user_company_id()`.

- **14/08/2026 (Brasília) — Pente Fino Técnico e Auditoria de Segurança (OF):**
    - Realizada auditoria completa de todas as RPCs operacionais (`create`, `edit`, `start`, `ready`, `collect`, `cancel`, `link`).
    - Confirmado que todas utilizam `SECURITY DEFINER` com `search_path = public` e proteção de tenant via `public._of_current_profile_id`.
    - Validada a integridade do controle de múltiplos: trava de finalização no frontend e persistência no banco.
    - Sincronizadas as assinaturas de auditoria em todo o fluxo logístico para o padrão de 6 argumentos.
    - O módulo de Ordem de Faturamento (OF) está estabilizado como sistema logístico puro, sem dependências de triggers de estoque.
- **16/08/2026 (Brasília) — Remoção do Módulo Estoque Malha (Manual):**
    - Excluído integralmente o módulo independente de Estoque Malha (Manual), incluindo tabelas (`manual_stock_movements`), RPCs e componentes de interface.
    - Revertidas referências no `AppLayout`, `Admin` e `StockMalha`.


