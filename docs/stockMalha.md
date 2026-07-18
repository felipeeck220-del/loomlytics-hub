# 📦 StockMalha.tsx — Documentação Técnica Completa

> **Rota:** `/:slug/stock-malha`
> **Arquivo:** `src/pages/StockMalha.tsx` (~1550 linhas)
> **Permissão:** `admin` e `expedicao` (aba "Própria" restrita a `canOwnStock`).
> **Status:** Em produção — 100% leitura client-side (ainda sem RPCs).

---

## 1. Propósito

Consolida o **estoque físico de malha** produzido pela facção e ainda não entregue, incluindo:

1. **Estoque (1ª qualidade)** — Produzido − Entregue − Reservado, por cliente/artigo/máquina.
2. **Estoque Próprio** — malha da própria fábrica (não pertence a cliente terceiro).
3. **2ª Qualidade** — movimentações independentes com `is_second_quality = true`.
4. **Movimentações** — histórico (últimos 500) de `stock_movements`.

Aba padrão: `estoque`. Estrutura por `Tabs` do shadcn (`activeStockTab`).

---

## 2. Fórmulas centrais

```
Produzido      = Σ productions.weight_kg (com machine_id)
               + Σ stock_movements.adjust_in − adjust_out
               + stock_movements.in  (quando billing_order_id IS NULL — estorno manual)
Entregue Total = Σ stock_movements.out (com billing_order_id)
               − stock_movements.in   (quando billing_order_id — estorno de OF)
Reservado      = Σ stock_movements.reserve − Σ release
Físico   (kg)  = Produzido − EntregueTotal
Disponível(kg) = Físico − Reservado
```

- **NFs de saída (`invoices.type='saida'`) NÃO descontam estoque** — baixa exclusiva via `stock_movements.out` gerada por OF coletada (§9 do plano OF×Estoque).
- **Data de corte** (`company_settings.stock_cutoff_date`): produções/movimentos anteriores são ignorados no cálculo (preservados no histórico).
- **Filtro "Entregue"** (`entregueRange`) afeta APENAS colunas visíveis Entregue kg/rolos; Físico/Disponível usam `deliveredKgTotal` acumulado.
- Produções e movimentos **sem `machine_id` são ignorados** no estoque.

---

## 3. Tabelas do banco envolvidas

### 3.1 `stock_movements`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `company_id` | uuid | RLS `IN profiles.company_id` |
| `article_id` | uuid | FK articles |
| `client_id` | uuid | Herda do artigo |
| `billing_order_id` | uuid | FK billing_orders (indica origem em OF) |
| `machine_id` | uuid | FK machines — obrigatório p/ estoque |
| `type` | enum | `in`, `out`, `adjust_in`, `adjust_out`, `reserve`, `release` |
| `pieces` | int | Rolos |
| `weight_kg` | numeric | Peso |
| `is_second_quality` | bool | Segrega aba 2ª Qualidade |
| `reason` | text | Motivo livre |
| `created_by` | uuid | FK profiles |
| `created_at` | timestamptz | — |

RLS: `Tenant can view stock movements` (SELECT authenticated) + `Tenant can insert stock movements` (INSERT).

### 3.2 `productions`
Campos usados: `date`, `article_id`, `machine_id`, `weight_kg`, `rolls_produced`. RLS por `get_user_company_id()`.

### 3.3 `articles`
Resolve `client_id` do artigo (agrupamento) e `name`.

### 3.4 `invoices` + `invoice_items`
Carregados apenas para `availableMonths` (dropdown de mês). Não descontam estoque.

### 3.5 `own_stock_articles`
`id`, `name`, `observations`, `created_at` — artigo próprio.

### 3.6 `own_stock_movements`
`own_article_id`, `type` (`in`/`out`), `pieces`, `weight_kg`, `source` (`internal`/`outsource`), `outsource_company_id`, `yarn_type`, `of_number`, `reason`, `created_by`, `created_at`.

### 3.7 `company_settings.stock_cutoff_date`
Data-limite (YYYY-MM-DD) abaixo da qual histórico é ignorado.

### 3.8 Auxiliares p/ joins de exibição
`machines`, `clients`, `billing_orders`, `profiles`, `outsource_companies`, `companies` (logo).

---

## 4. Data fetching

### 4.1 Helper local
```ts
fetchAllPaginated<T>(table, companyId, selectCols='*'): Promise<T[]>
```
Paginação client-side em blocos de 1000 (order by `id`), filtrando por `company_id`.

### 4.2 CompanyDataContext (`useSharedCompanyData`)
`getProductions()`, `getClients()`, `getArticles()`, `getYarnTypes()`, `getMachines()`, `refreshData()`.

### 4.3 React Query — chaves
| Chave | Objetivo |
|---|---|
| `invoices_for_stock` | Todas as NFs (para `availableMonths`) |
| `invoice_items_for_stock` | Itens (reservado para cálculos futuros) |
| `stock_movements_for_stock` | Movimentos (colunas específicas) usados nos cálculos |
| `stock_movements_history` | Últimos 500 movimentos + joins p/ aba Movimentações |
| `stock_cutoff_date` | `company_settings.stock_cutoff_date` |
| `company_info_for_stock_pdf` | Nome + logo p/ PDFs |
| `own_stock_articles` | Artigos próprios |
| `own_stock_movements` | Movimentos próprios + joins (author, outsource) |

### 4.4 Loading agregado
`isStockLoading = stockMovementsLoading || cutoffLoading || invoicesLoading || invoiceItemsLoading` — bloqueia render da tabela principal para evitar valores parciais.

---

## 5. Realtime

Canal `stock-malha-realtime-${companyId}` assina INSERT/UPDATE/DELETE em:
- `productions` → `refreshData()`.
- `stock_movements` → `refreshAllStock()` (invalida `stock_movements_for_stock` + `stock_movements_history`).
- `own_stock_movements` → `refreshOwnStock()`.

Também escuta `window.addEventListener('stock-movements-changed')` — evento emitido por outros módulos (ex.: OF ao coletar paletes) para sync local.

> **Memória OFR Realtime:** publication + `REPLICA IDENTITY FULL` + canal obrigatórios ao adicionar tabelas consumidas aqui.

---

## 6. Estado local

| Estado | Uso |
|---|---|
| `activeStockTab` | `'estoque' \| 'propria' \| 'segunda' \| 'movimentos'` |
| `estoqueClient` / `estoqueArticle` / `estoqueMonth` | filtros da aba estoque |
| `entregueRange` `{from,to}` | filtro exclusivo da coluna Entregue (default hoje) |
| `segClient` / `segArticle` / `segMonth` | filtros da aba 2ª qualidade |
| `expandedArticle` | linha expandida (`clientId::articleId`) — quebra por máquina |
| `expandedOwnArticle` | idem para aba própria |
| `manualOpen`, `manual2qOpen`, `ownManualOpen` | modais de lançamento |
| `movFilterType`, `movPage` | filtro e paginação (15/página) |
| `exportingArticleId` | trava anti-double-click do PDF |

---

## 7. Cálculos (useMemo)

### 7.1 `malhaEstoque`
`Map<clientId, Map<articleId, totals>>` com `producedKg/Rolls`, `deliveredKg/Rolls` (range), `deliveredKgTotal/RollsTotal` (acumulado), `reservedKg/Rolls`.

Regras aplicadas ao percorrer `stock_movements` (validando `!is_second_quality`, tipo válido, `machine_id`):

| type | efeito |
|---|---|
| `adjust_in` | +Produzido |
| `adjust_out` | −Produzido |
| `in` c/ `billing_order_id` | −EntregueTotal (estorno OF); −Entregue se dentro do range |
| `in` sem `billing_order_id` | +Produzido (entrada manual) |
| `out` | +EntregueTotal; +Entregue se dentro do range |
| `reserve` | +Reservado |
| `release` | −Reservado |

Deriva por artigo:
```
stockKg     = producedKg - deliveredKgTotal
availableKg = stockKg - reservedKg
```
Ordena grupos por `clientName`, artigos por `articleName`.

### 7.2 `byMachineMap`
Mesma lógica, particionada por `machine_id`. Chave `${clientId}::${articleId}` → `Map<machineId,totals>`. Alimenta o expand da linha e o PDF por artigo.

### 7.3 `segundaEstoque`
Só `stock_movements.is_second_quality=true`; sem cutoff nem produções. `in`/`adjust_in` = Entrada; `out`/`adjust_out` = Saída. Saldo = Entrada − Saída.

### 7.4 `ownSummary` + `ownDetailByArticle`
Agrega `own_stock_movements` por artigo próprio. Entradas ainda desagregadas por `yarn_type + of_number + source + outsource_company_id` para exibir lote-a-lote.

### 7.5 KPIs
`estoqueKpis`, `segundaKpis`, `ownKpis` — reduces sobre os arrays de grupos.

### 7.6 `availableMonths`
Distinct de `invoices.issue_date.substring(0,7)` + mês corrente, ordem decrescente.

### 7.7 Paginação Movimentações
`filteredMovements` (por tipo) → `paginatedMovements` (slice 15) + `movVisiblePages` (janela de 3).

---

## 8. UI — Aba Estoque

- **KPIs (grid 2/4/6):** Produzido, Entregue (range), Físico, Rolos físicos, Reservado, Disponível.
- **Filtros:** Mês (Select), Cliente/Artigo (`SearchableSelect`), range Entregue (`Popover + Calendar mode=range`), botão Hoje/Limpar.
- **Tabela:** `Collapsible` por cliente. Header mostra Produzido/Reservado/Disponível. Corpo: linhas por artigo (Produzido kg/rolos, Entregue kg/rolos, Físico kg, Rolos reservados, Reservado kg, Disponível kg, Disp. rolos). Click expande a **quebra por máquina** (`byMachineMap`). Botão download por artigo → PDF (§12).
- Mobile: cards responsivos (pente-fino já registrado em `docs/mestre.md`).

## 9. UI — Aba Própria
KPIs Entradas/Saídas/Saldo (kg + pç). Tabela agregada por artigo próprio com expand listando lotes (`ownDetailByArticle`). Botão "Lançamento Manual (Fábrica)" abre `OwnStockManualModal`. Acesso restrito por `canOwnStock`.

## 10. UI — Aba 2ª Qualidade
Mesmo padrão KPI+tabela agrupada. Sem cutoff nem range Entregue. Botão abre `ManualStockEntryModal` com `secondQuality=true`.

## 11. UI — Aba Movimentações
Select para `type`. Tabela paginada 15/página (Data, Autor, OF, Cliente, Artigo, Tipo, Peso, Rolos, Motivo, badge 2ª qualidade). Prev/Next + janela 3 páginas.

---

## 12. Exportação PDF (`handleExportArticlePdf`)
Import dinâmico (`jsPDF` + `jspdf-autotable`):
1. Header com logo + nome + data/hora.
2. Título "ESTOQUE DE MALHA POR ARTIGO" + subtítulo `Artigo — Cliente`.
3. Corpo: uma linha por máquina com `availableRolls ≥ 1` (colunas MÁQUINA, DISP. ROLOS, ARTIGO). Última linha TOTAL destacada.
4. Sanitização via `sanitizePdfText`.
5. Trava anti-double-click via `exportingArticleId`.
6. Sem máquinas com saldo ≥ 1 → `toast.info` e aborta.

---

## 13. Modais dependentes

| Modal | Ação no banco |
|---|---|
| `ManualStockEntryModal` (`src/components/ManualStockEntryModal.tsx`) | Insere em `stock_movements` (1ª ou 2ª qualidade) |
| `OwnStockManualModal` (`src/components/OwnStockManualModal.tsx`) | Cadastra artigos próprios + insere em `own_stock_movements` |

Ambos invalidam os caches respectivos ao salvar.

---

## 14. Permissões

| Role | Estoque | 2ª qual. | Própria | Movimentações |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| expedição | ✅ | ✅ | ✅ | ✅ |
| líder / mecânico / revisador | ❌ | ❌ | ❌ | ❌ |

Controle central via chave `stock_malha` em `enabled_nav_items` (Modular Navigation Control).

---

## 15. Riscos e observações

- **Peso client-side:** carrega `stock_movements`, `invoices`, `invoice_items` inteiros. Candidato natural a RPC (padrão `docs/rpcInvoices.md`).
- **Cutoff:** operações anteriores não somam, mas ainda aparecem em Movimentações (limit 500). Configuração em Configurações → Empresa.
- **`entregueRange` só afeta colunas Entregue** — não confundir com Físico.
- **NFs de saída não descontam** — regra do plano OF×Estoque; regressões quebram o Físico.
- **`machine_id` obrigatório** — cadastros antigos sem máquina somem do estoque; auditar antes de reportar divergência.
- **Realtime obrigatório** para toda tabela consumida (regra OFR Realtime).

---

## 16. Localização
GMT-3, `dd/MM/yyyy` via `date-fns`, pesos via `formatWeight` (kg, 2 decimais), contagens via `formatNumber`. Toasts em `sonner`.

---

## 17. Ganchos futuros (não implementados)
- RPCs: `get_stock_malha_bootstrap`, `get_stock_malha_movements` (paginação server-side), `save_manual_stock_movement` (atômica com auditoria).
- Integração ampliada com Fechamento Mensal.
- Aba "Reservas" listando `reserve` sem `release` correspondente.

---

*Documento criado a partir de `src/pages/StockMalha.tsx` (revisão 18/07/2026). Atualize junto com refactors relevantes e registre em `docs/mestre.md`.*
