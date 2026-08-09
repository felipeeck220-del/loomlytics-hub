
# Módulo OE (Ordem Elétrica) — plano de implementação

Espelha o funcionamento de OC/OM, adiciona role "Eletricista" e cria fluxo de escalonamento OC → OE (quando o mecânico identifica que o problema é elétrico).

---

## 1. Banco de dados (migração)

- **Enum `app_role`**: adicionar valor `eletricista`.
- **Enum `maintenance_order_type`**: adicionar valor `manutencao_eletrica`.
- **Enum `machine_status`**: adicionar valor `manutencao_eletrica` (para máquina ficar com status correto durante a OE).
- **Tabela `maintenance_orders`**: novas colunas
  - `oe_number` (int, sequencial por empresa — trigger análogo a `oc_number`)
  - `escalated_from_oc_id` (uuid, FK auto → `maintenance_orders.id`, `ON DELETE SET NULL`) — quando a OE nasce de uma OC
  - `escalated_to_oe_id` (uuid, FK auto → `maintenance_orders.id`, `ON DELETE SET NULL`) — na OC que originou a OE
- **RPC `get_maintenance_orders_list`**: continuar retornando todas as ordens; OE já vem embutida (mesma tabela).
- **Storage**: reutilizar bucket `oc-photos` para fotos de OE (mesmas policies, chave `{companyId}/{orderId}/{uuid}.ext`).
- **Trigger de numeração**: estender função existente que gera `oc_number` para também gerar `oe_number` quando `type = 'manutencao_eletrica'`.
- **Realtime**: sem mudanças (a publication já cobre `maintenance_orders` e `machine_maintenance_observations`).

## 2. Papéis e permissões (`src/hooks/usePermissions.ts`)

- Adicionar `eletricista` ao tipo `AppRole` e ao mapa `ROLE_ALLOWED_KEYS` liberando `mecanica-oe` (e `mecanica-oc` só para visualização, sem executar).
- Regras dentro de `MaintenanceOrdersTab` (modo `oe`):
  - **Criar OE**: admin, mecanico, lider, lider_noite.
  - **Iniciar / finalizar OE**: apenas admin e eletricista.
  - **Visualizar** (lista, notas, fotos): todos os papéis com acesso ao módulo mecanica (leitura).
- Cadastro de usuário Eletricista em Configurações usa o mesmo dropdown de papéis já existente.

## 3. Roteamento e navegação

- `src/App.tsx`: nova rota `mecanica/oe`.
- `src/components/AppSidebar.tsx`: novo item "OE" ao lado de OC (icon Zap), key `mecanica-oe`, com badge de abertos.
- `src/pages/Mecanica.tsx`: reconhecer path `/mecanica/oe` e renderizar `<MaintenanceOrdersTab mode="oe" ... />`.

## 4. Componente `MaintenanceOrdersTab`

- Aceitar `mode: 'om' | 'oc' | 'oe'` (default `om`).
- Constantes atualizadas: labels curtos/longos, cor da badge para OE (âmbar-elétrico / yellow-300).
- `modeOrders`: filtro por `type === 'manutencao_eletrica'` no modo OE.
- Reaproveitar todo o fluxo: Aberto, Em curso, Finalizadas, Canceladas, Relatórios (admin).
- No **modal de finalização de OE**, o campo "relatório" fica obrigatório (mesmo padrão hoje aplicado em OM/OC).
- Reaproveitar OCReportsTab renomeando textos condicionalmente (KPIs continuam válidos).

## 5. Ponte OC → OE (a peça nova)

Dentro do card/modal de OC **Em Curso**:

- Botão "Abrir OE" (ícone Zap, roxo). Visível para quem pode executar aquela OC.
- Abre modal "Escalonar para OE":
  - Textarea "Descrição do problema elétrico" (obrigatório).
  - Uploader de até **3 fotos** com preview/descrição (reaproveita `compressImage`).
  - Botão "Abrir OE e finalizar OC".
- Ao confirmar (transação sequencial, com rollback de storage se falhar):
  1. Cria nova ordem `type='manutencao_eletrica'`, status inicial `em_curso` (já iniciada), `escalated_from_oc_id = ocId`, `description = <texto do problema elétrico>`, mesma `machine_id`, autoria do usuário atual.
  2. Faz upload das fotos para `oc-photos/{companyId}/{oeId}/…` e grava `oc_photos` na OE.
  3. Finaliza a OC de origem: `status='finalizada'`, `finished_at=now`, `finished_by_*`, e adiciona `progress_notes` com registro automático: `"Problema elétrico. OE #NNN aberta. Descrição: … • N foto(s) anexada(s)"` + `escalated_to_oe_id = novaOeId`.
  4. Atualiza status da máquina para `manutencao_eletrica` (a OE já está em curso).
  5. Registra `audit_logs` `oc_escalated_to_oe` e `oe_created_from_oc`.
  6. Dispara push para eletricistas + admins.
- Realtime cuida da atualização em todos os clientes.

Na visualização da OC (modal "Ver relatório") e da OE, exibir um bloco "Escalonamento" com link clicável para a ordem contraparte.

## 6. Notificações push

Reutilizar o pipeline de OC/OM. Novos gatilhos:

- **OE criada** (direta ou via escalonamento): notificar eletricistas + admins.
- **OE finalizada**: notificar admins + mecânico que originou (se veio de OC).
- **OC escalonada para OE**: notificar eletricistas + admins.

## 7. Atualização de `docs/mestre.md`

Adicionar entrada com data de hoje descrevendo:
- Novo módulo OE, role Eletricista.
- Fluxo OC → OE.
- Enum values e coluna nova.

---

## Detalhes técnicos (referência interna)

- Colunas novas: `maintenance_orders.oe_number int`, `escalated_from_oc_id uuid`, `escalated_to_oe_id uuid`.
- Trigger `set_maintenance_order_number()` amplia branch: se `manutencao_eletrica`, próximo `MAX(oe_number)+1` por `company_id`.
- Notificações reutilizam edge function `send-push-notification` — apenas novos `source` (`OE`, `OC_ESCALATED`).
- Formulários mantêm `SearchableSelect` para máquina.
- Textos e labels em português; ícone `Zap` (lucide) para OE.
- `useMarkSourceAsRead('OE')` no modo OE.

Nenhuma tela ou fluxo existente é removido; a mudança é aditiva.
