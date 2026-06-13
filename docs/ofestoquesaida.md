# 📦 OFESTOQUESAIDA.MD — Integração Ordem de Faturamento ↔ Estoque de Malha

> **Status:** 📋 Plano aprovado — pendente implementação
> **Última revisão:** 13/06/2026
> **Abordagem:** Opção B — Tabela de movimentos (`stock_movements`) + RPCs transacionais

---

## 1. Visão geral

Hoje o **Estoque de Malha** (`docs/estoquemalhas.md`) é calculado como `Produzido − NF Saída`. Com a chegada da **Ordem de Faturamento (OF)** (`docs/of.md`), a baixa do estoque deixa de depender da NF de saída e passa a ser comandada pelo ciclo de vida da OF.

A OF passa por estes estados: `open → separating → ready → collected` (com desvios `cancelled` e edição/`open` retorno). Cada transição relevante gera um **movimento de estoque** imutável em `stock_movements`. O saldo é a soma dos movimentos + produção, calculada em tempo real.

### Regras-base confirmadas pelo usuário

1. **Somente OF coletada baixa o estoque.** NF de saída deixa de baixar estoque a partir do deploy. Um **alerta visual** será exibido onde houver risco de duplicidade (ver §9).
2. **Estorno de OF coletada:** somente **admin**, com **motivo escrito obrigatório**.
3. **Migração histórica:** estoque parte **do zero** na data do deploy (não retroage OFs ready/collected antigas).
4. **Aba Movimentações:** nova tab dentro da página **Estoque Malha**.
5. **Produção Pendente** (lançamentos do dia que ainda não foram digitados): entra **na Fase 1**, na versão simples.

---

## 2. Transições e efeito no estoque

| Transição                             | Físico | Reservado | Disponível | Movimento gerado            |
| ------------------------------------- | :----: | :-------: | :--------: | --------------------------- |
| `open → separating`                   |   =    |     =     |     =      | — (nenhum)                  |
| `separating → ready` (lançar dados)   |   =    |   **+**   |   **−**    | `reserve` (pç/kg reais)     |
| `ready → collected`                   | **−**  |   **−**   |     =      | `release` + `out`           |
| `ready → cancelled`                   |   =    |   **−**   |   **+**    | `release`                   |
| `collected → cancelled` (estorno)     | **+**  |     =     |   **+**    | `in`                        |
| `ready → open` (editar OF pronta)     |   =    |   **−**   |   **+**    | `release`                   |
| `open → cancelled`                    |   =    |     =     |     =      | — (nenhum)                  |

Definições:
- **Físico:** o que está fisicamente dentro da empresa.
- **Reservado:** físico já comprometido com uma OF em `ready`.
- **Disponível:** `Físico − Reservado` (o que pode ser usado para criar novas OFs).

---

## 3. Modelo de dados

### 3.1 Nova tabela `stock_movements`

| Coluna             | Tipo            | Notas                                                       |
| ------------------ | --------------- | ----------------------------------------------------------- |
| `id`               | `UUID` PK       | `gen_random_uuid()`                                         |
| `company_id`       | `UUID` NOT NULL | FK `companies` (multi-tenancy)                              |
| `article_id`       | `UUID` NOT NULL | FK `articles`                                               |
| `client_id`        | `UUID`          | FK `clients` (cache do artigo no momento)                   |
| `billing_order_id` | `UUID`          | FK `billing_orders` (nullable para ajustes manuais)         |
| `type`             | `ENUM`          | `reserve`, `release`, `out`, `in`, `adjust`                 |
| `pieces`           | `INTEGER`       | sempre positivo; o `type` define o sinal                    |
| `weight_kg`        | `NUMERIC(12,3)` | sempre positivo                                             |
| `reason`           | `TEXT`          | obrigatório para `adjust` e estorno (`in`)                  |
| `created_by`       | `UUID`          | FK `profiles`                                               |
| `created_at`       | `TIMESTAMPTZ`   | default `now()`                                             |

- **Enum** `stock_movement_type`: `reserve | release | out | in | adjust`.
- **Índices:** `(company_id, article_id, created_at)`, `(billing_order_id)`.
- **RLS:** `company_id = profiles.company_id` do usuário autenticado. `SELECT/INSERT` para `authenticated` do tenant; `UPDATE/DELETE` bloqueados (movimentos são imutáveis — correção feita com novo movimento `adjust`).
- **GRANT:** `SELECT, INSERT ON public.stock_movements TO authenticated; ALL TO service_role`.

### 3.2 Alterações em `billing_orders`

Novos campos puramente informativos para o estorno de coletada:

| Coluna                | Tipo            | Notas                                                |
| --------------------- | --------------- | ---------------------------------------------------- |
| `reverted_from`       | `ENUM`          | `ready | collected` (qual estado foi cancelado)      |
| `reversal_reason`     | `TEXT`          | obrigatório quando `reverted_from = 'collected'`     |
| `reversed_by`         | `UUID`          | FK `profiles` (admin que estornou)                   |
| `reversed_at`         | `TIMESTAMPTZ`   |                                                       |

(Mantemos os campos atuais `cancelled_*`; estes novos descrevem **de onde** veio o cancelamento.)

---

## 4. RPCs (todas `SECURITY DEFINER`, `search_path = public`)

Cada RPC roda em transação única (UPDATE + INSERT). Todas recebem `expected_status` para evitar corrida entre dispositivos — se o status atual não bater, a RPC retorna erro `CONFLICT` sem alterar nada.

1. **`of_mark_ready(_id, _pieces_real, _weight_real, _expected_status)`**
   - Valida `expected_status = 'separating'`.
   - UPDATE: `status='ready'`, `pieces_real`, `weight_real`, `weight_avg`, `separated_by`.
   - INSERT `reserve` em `stock_movements` (pç/kg reais).

2. **`of_mark_collected(_id, _expected_status)`**
   - Valida `expected_status = 'ready'`.
   - UPDATE: `status='collected'`, `collected_by`.
   - INSERT `release` (cancela a reserva) + INSERT `out` (baixa física).

3. **`of_cancel(_id, _reason, _expected_status)`**
   - `expected_status ∈ {open, separating, ready, collected}`.
   - UPDATE: `status='cancelled'`, `cancelled_by/at`, `cancellation_reason`, `reverted_from`.
   - Se `expected = 'ready'`: INSERT `release`.
   - Se `expected = 'collected'`: **somente admin**, `reason` obrigatório, INSERT `in` (devolve ao físico), grava `reversal_reason/reversed_by/reversed_at`.

4. **`of_revert_ready_to_open(_id, _note, _expected_status)`**
   - Usado pelo fluxo "Editar OF pronta".
   - UPDATE: `status='open'`, limpa `pieces_real/weight_real/weight_avg/separated_by`, grava `edit_note/last_edited_by/last_edited_at`.
   - INSERT `release`.

5. **`stock_adjust(_article_id, _pieces, _weight_kg, _reason)`** *(admin only)*
   - Ajuste manual (entrada ou saída). `pieces`/`weight_kg` podem ser negativos no parâmetro; salvos como positivos com `type='adjust'` e o sinal codificado por dois movimentos (um `adjust` positivo ou negativo via colunas adicionais? — **decisão:** manter `pieces/weight_kg` positivos e adicionar coluna `direction smallint` *apenas* para `adjust` — ou criar dois subtipos `adjust_in`/`adjust_out`).
   - **Decisão final:** criar dois enums `adjust_in` e `adjust_out` para manter o invariante "pç/kg ≥ 0" e simplificar o somatório.

Atualizar §3.1: enum vira `reserve | release | out | in | adjust_in | adjust_out`.

---

## 5. Cálculo de saldos (frontend)

Tudo é derivado de duas fontes:

```
físico(article) =
    Σ productions.weight_kg (do artigo, sem filtro de data)
  − Σ movements.out  (weight_kg)
  + Σ movements.in   (weight_kg)
  + Σ movements.adjust_in − Σ movements.adjust_out

reservado(article) =
    Σ movements.reserve − Σ movements.release

disponível(article) = físico − reservado
```

Mesma fórmula para `pieces` (usando `rolls_produced` do `productions`).

**Observação importante:** após o deploy, NF de saída **não** abate mais o estoque. Histórico antigo de NFs continua existindo mas é ignorado pelo cálculo novo — combinado com o usuário (estoque parte do zero).

### 5.1 Produção Pendente (Fase 1 — versão simples)

Hoje quando um cliente pede "colete tudo", o admin cria a OF baseado no estoque que **já foi lançado** no sistema. Mas pode haver produção do turno corrente ainda não digitada.

**Solução Fase 1:** ao abrir a aba **Estoque Malha** e o modal **Nova OF**, exibir um aviso amarelo:

> ⚠️ **Atenção:** existe(m) X máquina(s) com turno ativo cujo lançamento de produção ainda não foi digitado. O estoque mostrado pode estar desatualizado. Confira com o tecelão antes de criar OF que esgote o saldo.

Detecção da pendência (frontend, sem migration nova):
- Para cada `iot_shift_state` ativo cujo `shift_end < now()` **e** que não tem `productions` daquele `(machine_id, date, shift)`.
- Ou, para empresas sem IoT, listar máquinas ativas sem `productions` no turno corrente fechado.

No futuro (Fase 2), evoluir para uma RPC `get_pending_production` que retorne kg/peças estimados a partir de `machine_readings` e os some como "Disponível previsto".

---

## 6. UI

### 6.1 Página `Estoque Malha`
- Substituir o cálculo atual (`Produzido − NF`) por (`Físico` calculado via §5).
- Colunas novas: **Físico**, **Reservado**, **Disponível** (pç e kg cada).
- Nova **tab "Movimentações"**: lista paginada de `stock_movements` (data, tipo, OF #, artigo, cliente, pç, kg, motivo, autor #ID). Filtros: artigo, cliente, tipo, período. Padrão: últimos 30 dias.
- Banner de Produção Pendente (§5.1) no topo da tab principal.

### 6.2 Modal **Nova OF**
- Após escolher artigo, mostrar: `Disponível: X pç / Y kg` (busca live).
- Se peças solicitadas > disponível → **bloqueio com toast** "Sem estoque disponível para este artigo. Disponível: X pç / Y kg".
- Banner de Produção Pendente se houver.

### 6.3 Aba **Separando — Lançar Dados**
- Validação dura no `pieces_real`: se `pieces_real > disponível + pieces_already_reserved_by_this_OF`, bloqueia.
- Mensagem específica: "Disponível: X pç. Outras OFs em `ready` consumiram Y pç desde a criação desta OF."

### 6.4 Aba **Coletadas** — botão **Estornar** (admin only)
- Visível apenas para `role = admin`.
- Abre modal com `<Textarea>` `Motivo do estorno` (obrigatório, min 5 chars).
- Confirma → chama `of_cancel` com `expected_status='collected'`.
- Histórico de quem estornou aparece na linha.

### 6.5 Tratamento de conflito (`CONFLICT`)
Já existente para mudança de status (§useBillingOrders). Estender para incluir o motivo "estoque insuficiente" devolvido pelas RPCs (`code = 'NO_STOCK'`), com modal explicativo idêntico ao padrão atual.

---

## 7. Concorrência e cenário "estoque negativo"

**Cenário levantado pelo usuário:**
> Cliente pede para coletar tudo. Estoque mostra 50 pç (último lançamento da noite). Até 11h da manhã produziu mais 10. Admin cria OF de 60, fica com estoque negativo até o lançamento da manhã ser digitado.

**Análise:**
- A regra dura de §6.2 bloquearia a criação dessa OF (60 > 50 disponível).
- Mas a produção **existe fisicamente** — só não foi digitada.

**Solução adotada:**
1. **Banner de Produção Pendente (§5.1)** alerta o admin antes.
2. No modal Nova OF, quando há pendência detectada, o bloqueio vira **soft** (override): exibe modal "Estoque disponível: 50 pç. Você está pedindo 60. Existe produção pendente não digitada — confirma assim mesmo?" Apenas **admin** pode confirmar; o pedido é registrado com flag `created_with_pending=true` em `billing_orders` (campo novo opcional, Fase 2).
3. Na hora de `Lançar Dados` (`separating → ready`), se ainda não houver físico suficiente, a RPC `of_mark_ready` aceita criar a reserva (físico pode ficar negativo temporariamente) **mas** loga `audit_logs` com `action='NEGATIVE_STOCK_RESERVE'`.
4. Quando o tecelão digitar a produção, o físico se ajusta automaticamente (movimentos `out` da OF + nova `productions` ⇒ físico volta ao positivo).

**Por que não bloquear duro?** Bloquear quebra o fluxo real da fábrica. O alerta + override admin + audit garante rastreabilidade sem travar a operação.

---

## 8. Migração histórica

**Decisão do usuário:** **NÃO** retroagir. O estoque parte do zero no momento do deploy.

Consequência prática:
- `stock_movements` nasce vazia.
- O cálculo de Físico passa a usar `productions` integrais **menos** apenas os `out` posteriores ao deploy.
- OFs `collected` anteriores ao deploy **não** geram `out` retroativo. O estoque exibido pode ficar momentaneamente "alto" — admin pode usar `stock_adjust` (§4.5) para zerar/ajustar por artigo manualmente nas primeiras semanas.
- Documentar isso no banner da página Estoque Malha: "Estoque reiniciado em DD/MM/AAAA. Use Ajuste Manual se precisar acertar saldo inicial."

---

## 9. Alerta de duplicidade OF × NF de saída

A partir do deploy, **somente OF coletada** baixa estoque. NF de saída deixa de descontar.

Para evitar engano operacional, exibir alerta nos seguintes pontos:

1. **Página Notas Fiscais — aba Saída**: banner permanente no topo:
   > ⚠️ A partir de DD/MM/AAAA, NFs de Saída são apenas documento fiscal — **não descontam estoque**. A baixa real ocorre quando a OF correspondente é marcada como **Coletada**.

2. **Modal "Nova NF de Saída"**: se já existe uma OF `collected` para o mesmo artigo/cliente nas últimas 7 dias, sugerir vincular (Fase 2 — campo `billing_order_id` em `invoices`).

3. **Estoque Malha — tab principal**: legenda explicativa ("Cálculo: Produzido − Movimentos de OF Coletada/Ajuste").

Sem bloqueios — apenas comunicação visual.

---

## 10. Auditoria

- Toda RPC grava `audit_logs` com `action ∈ { OF_MARK_READY, OF_MARK_COLLECTED, OF_CANCEL, OF_REVERT_READY, STOCK_ADJUST }` e `details` contendo `{ of_id, of_number, article_id, pieces, weight_kg, reason? }`.
- Conformidade com `docs/auditoria.md`: autor exibido como `Nome #ID — dd/mm/aaaa hh:mm` na lista de Movimentações.

---

## 11. Ordem de implementação

1. **Migration**
   - Enum `stock_movement_type`.
   - Tabela `stock_movements` (+ índices, RLS, GRANTs).
   - Colunas novas em `billing_orders` (`reverted_from`, `reversal_reason`, `reversed_by`, `reversed_at`).
   - RPCs `of_mark_ready`, `of_mark_collected`, `of_cancel`, `of_revert_ready_to_open`, `stock_adjust`.
2. **Hook `useStockMovements`** + ajuste de `useStockMalha` para nova fórmula.
3. **`useBillingOrders`**: substituir UPDATEs diretos por chamadas às RPCs.
4. **UI Estoque Malha**: colunas Físico/Reservado/Disponível, tab Movimentações, banner pendência, banner reinício de estoque, alerta OF×NF.
5. **UI BillingOrders**: live `Disponível` no Nova OF e Lançar Dados; bloqueio + override; botão Estornar (admin) com motivo obrigatório.
6. **UI Invoices**: banner alerta na aba Saída.
7. **Documentação**: atualizar `docs/mestre.md` (histórico), `docs/estoquemalhas.md` (nova fórmula), `docs/of.md` (efeito no estoque).

---

## 12. Ponto de reversão

Se algo der errado em produção:

```sql
-- 1. Voltar billing_orders para UPDATE direto (revert hook).
-- 2. Dropar RPCs e tabela:
DROP FUNCTION IF EXISTS public.of_mark_ready, public.of_mark_collected,
                         public.of_cancel, public.of_revert_ready_to_open,
                         public.stock_adjust;
DROP TABLE IF EXISTS public.stock_movements;
DROP TYPE  IF EXISTS public.stock_movement_type;
ALTER TABLE public.billing_orders
  DROP COLUMN IF EXISTS reverted_from,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS reversed_by,
  DROP COLUMN IF EXISTS reversed_at;
```

- Reativar a fórmula antiga (`Produzido − NF Saída`) em `StockMalha.tsx`.
- Remover banners de alerta OF×NF.

---

## 13. Resumo das decisões do usuário

| Pergunta                                    | Resposta                                                   |
| ------------------------------------------- | ---------------------------------------------------------- |
| OF coletada × NF de saída                   | **Somente OF** baixa estoque. NF vira só documento fiscal. Alerta visual. |
| Estorno de coletada                         | **Admin only**, **motivo escrito obrigatório**.            |
| Migração histórica                          | **Estoque parte do zero** no deploy.                       |
| Aba Movimentações                           | **Dentro de Estoque Malha** (nova tab).                    |
| Produção Pendente                           | **Fase 1**, versão simples (banner de alerta).             |