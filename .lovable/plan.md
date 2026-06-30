## Objetivo

Criar o módulo **Ordem de Manutenção (OM)** dentro de `/mecanica` no mesmo modelo da OF, transferir o controle de status das máquinas para a OM (removendo a troca manual em `/machines`), e adicionar uma aba de **Movimentações** com histórico geral e por máquina.

---

## 1. Novo papel: `lider_mecanica`

- Adicionar `lider_mecanica` na lista de roles aceitos (`src/types/user.ts`, `usePermissions`, telas de gestão de usuários em `Settings`/`Admin`).
- Permissões:
  - **admin + lider_mecanica** → criar / editar / cancelar OM, ver tudo.
  - **mecanico** → apenas iniciar e finalizar OMs já criadas; ver tudo.
  - Demais papéis: somente leitura (se o módulo Mecânica estiver habilitado).

## 2. Banco — novas tabelas

**`maintenance_orders`** (uma OM)
- `id`, `company_id`, `short_id` (auto sequencial por empresa estilo OF — `OM #001`)
- `machine_id` (FK machines)
- `type` (`manutencao_preventiva` | `manutencao_corretiva` | `troca_artigo` | `troca_agulhas`)
- `priority` (`normal` | `prioritaria`)
- `status` (`aberto` | `em_curso` | `finalizada` | `cancelada`)
- `description` (text) — motivo / serviço a executar
- `created_by_id/name`, `created_at`
- `started_at`, `started_by_id/name`
- `finished_at`, `finished_by_id/name`
- `duration_seconds` (calculado no fim)
- `machine_log_id` (FK opcional → `machine_logs`, criado quando inicia)

**`maintenance_order_items`** (peças trocadas — preenchido ao finalizar)
- `id`, `company_id`, `order_id`
- `item_type` (`agulha` | `platina` | `cilindro` | `outro`)
- `needle_id` / `sinker_id` / `cylinder_id` (FK opcionais)
- `description` (text — quando "outro")
- `quantity` (int)

RLS por `company_id = get_user_company_id()` + GRANTs padrão.

## 3. Fluxo da OM (espelha OF)

**Criar (admin/líder mecânica):** escolhe máquina, tipo, prioridade, descrição → status `aberto`.

**Iniciar (qualquer mecânico/líder/admin):**
- status → `em_curso`, `started_at = now()`
- cria um `machine_logs` (status = tipo da OM, `started_at = now`, sem `ended_at`) → guarda `machine_log_id` na OM
- a máquina passa a refletir esse status (assim como hoje quando muda manual em Máquinas)
- na tela aparece **timer correndo** (hh:mm:ss) igual ao painel atual de troca de status

**Finalizar (qualquer mecânico/líder/admin):**
- abre modal mostrando: data/hora início, agora=fim, **tempo total** parado
- bloco "Itens trocados" → adicionar várias linhas (tipo + ref/quantidade); validações de estoque para agulha/platina
- ao confirmar: `finished_at = now`, `duration_seconds` calculado, fecha `machine_logs.ended_at`, máquina volta para `ativa` automaticamente
- se `type = manutencao_preventiva` → atualiza data da última preventiva (já reflete na aba **Calendário** pois ela lê de `machine_logs`); o intervalo continua usando `machines.maintenance_interval_days` / `maintenance_kg_target`
- itens de agulha/platina geram `needle_transactions` / `sinker_transactions` de saída (com `exit_mode = troca_agulheiro/troca_platinas` quando aplicável)

**Cancelar OM** (admin/líder): só permitido se ainda `aberto`.

## 4. Abas em `/mecanica`

Ordem nova das abas:

```
OM | Calendário | Detalhes | Histórico | Cilindros | Agulhas | Platinas | Movimentações
```

### Aba "OM"
Sub-abas estilo OF: **Aberto** · **Em curso** · **Finalizadas** (com paginação 15/pg nas finalizadas, busca por máquina/OM/descrição, filtro de período).

Cards com: número OM, máquina, tipo (badge colorido igual já existe), prioridade, criado por, e:
- aberto → botão **Iniciar** (mecânico/líder/admin) + **Editar/Cancelar** (líder/admin)
- em curso → **timer ao vivo** + botão **Finalizar**
- finalizada → tempo total, lista de itens trocados, link "ver detalhes"

### Aba "Movimentações" (depois de Platinas)
Duas sub-abas:
1. **Geral** — feed unificado de TODAS as OMs finalizadas + trocas de agulha/platina + cilindros (ordenado por data desc, paginado).
2. **Por máquina** — seletor de máquina + timeline só daquela.

## 5. `/machines` — remover troca manual de status

- Remover o seletor/botão de **mudar status** (Ativa / Preventiva / Corretiva / Troca…) do card de máquina e do modal de detalhes.
- A coluna "Status" continua exibida normalmente (lendo `machines.status`) — só não é mais editável manualmente; passa a ser controlada exclusivamente pela OM.
- Tudo o mais em `/machines` permanece igual (cadastro, modelo, agulhas, etc.).

## 6. Atualizações de documentação

- `docs/mestre.md` — adicionar entrada datada com tudo acima.
- `docs/data/07-mecanica.md` — documentar `maintenance_orders` + `maintenance_order_items` e o novo papel.

---

## Pontos para você confirmar

1. **Líder de Mecânica pode finalizar OM?** (assumi que sim — mesmo poder do mecânico + também cria/cancela)
2. **OM corretiva sem agendamento prévio** — admin/líder cria e mecânico inicia na mesma hora, ok? (sem "agendar para data futura" por enquanto)
3. **Cancelar OM em curso** — bloqueado (só `aberto` pode cancelar). Confirma?
4. Quer que a OM finalizada **substitua** registros manuais antigos de manutenção (botão atual "Adicionar Registro Manual" na aba Calendário), ou mantemos o botão manual coexistindo?
