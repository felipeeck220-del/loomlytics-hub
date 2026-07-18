# Notas Fiscais (Trama) — `src/pages/Invoices.tsx`

**Rota:** `/:slug/invoices`
**Arquivo:** `src/pages/Invoices.tsx` (2141 linhas)
**Contexto do menu:** módulo "Notas Fiscais" da malharia — controla o **fluxo físico do fio** (o que entra do fornecedor, o que é vendido/repassado, o que sai enviado para tinturaria) e os **saldos derivados** (por marca, por tipo de fio e por facção terceirizada). Também administra os **Tipos de Fio** cadastrados (registry).

> Este documento descreve **100%** da página: banco de dados, RLS, hooks React, memos, mutações, filtros, dialogs, integrações com outros módulos e regras de negócio. Serve como fonte única para manutenção e refactor futuro (por exemplo, uma eventual migração para RPCs no padrão `docs/rpcoutsource.md`).

---

## 1. Visão geral de UX

A tela é um `Tabs` controlado que persiste a aba ativa na query string (`?tab=...`) e reage a `popstate` implícito pelo `useEffect` sobre `window.location.search`. As abas são:

| id da aba     | rótulo             | conteúdo                                                                     |
| ------------- | ------------------ | ---------------------------------------------------------------------------- |
| `entrada`     | Entrada de Fio     | NFs `type = 'entrada'` (compra de fio do fornecedor)                         |
| `venda_fio`   | Venda de Fio       | NFs `type = 'venda_fio'` (repasse de fio a cliente/malharia)                 |
| `saida_malha` | Saída Malha        | NFs `type = 'saida'` (envio de malha crua p/ tinturaria e/ou terceiros)      |
| `saldo`       | Saldo Fios         | Saldo por **marca** (recebido − vendido)                                     |
| `saldoGlobal` | Saldo Global       | Saldo por **tipo de fio** (compra − consumo produtivo − vendas)              |
| `efterceiro`  | Fio Terceiros      | Estoque de fio parado nas facções (`outsource_yarn_stock`)                   |
| `fios`        | Tipos de Fio       | Registry de `yarn_types` (nome, composição, cor, obs.)                       |

Cabeçalho fixo: `FileText` + título "Notas Fiscais" + subtítulo. O layout é responsivo — todas as listagens têm um bloco `md:hidden` (cards no mobile) e um bloco `hidden md:table` (Table shadcn no desktop), padrão registrado em `mem://ui`.

---

## 2. Banco de dados

### 2.1 `public.invoices` (cabeçalho da NF)

| coluna              | tipo             | null | default        | observação                                                  |
| ------------------- | ---------------- | ---- | -------------- | ----------------------------------------------------------- |
| `id`                | uuid             | NO   | `gen_random_uuid()` | PK                                                     |
| `company_id`        | uuid             | NO   | —              | Tenant, filtro RLS                                          |
| `type`              | text             | NO   | `'entrada'`    | `entrada` \| `venda_fio` \| `saida`                         |
| `invoice_number`    | text             | NO   | —              | Nº NF; `'S/N'` quando o usuário deixa em branco na entrada  |
| `access_key`        | text             | YES  | —              | Chave SEFAZ 44 dígitos (opcional)                           |
| `client_id`         | uuid             | YES  | —              | Sempre `null` no fluxo atual (legado)                       |
| `client_name`       | text             | YES  | —              | Sempre `null` no fluxo atual (legado)                       |
| `buyer_name`        | text             | YES  | —              | **Overload:** fornecedor (entrada), cliente (venda_fio) ou "terceiros" (saida) |
| `destination_name`  | text             | YES  | —              | Nome da **tinturaria** (só em `saida`)                      |
| `issue_date`        | **text**         | NO   | —              | ISO `YYYY-MM-DD` armazenado como texto (padrão do projeto)  |
| `total_weight_kg`   | numeric          | NO   | `0`            | Soma dos itens (persistida)                                 |
| `total_value`       | numeric          | YES  | `0`            | Soma dos subtotais                                          |
| `status`            | text             | NO   | `'pendente'`   | `pendente` \| `conferida` \| `cancelada`                    |
| `observations`      | text             | YES  | —              |                                                             |
| `created_by_name`   | text             | YES  | —              | Autoria                                                     |
| `created_by_code`   | text             | YES  | —              | Idem                                                        |
| `created_at`        | timestamptz      | NO   | `now()`        |                                                             |

**RLS (`authenticated`), 4 policies isolando por tenant:** `USING/WITH CHECK: (company_id = get_user_company_id())`.

### 2.2 `public.invoice_items` (linhas da NF)

| coluna            | tipo    | null | default | observação                                                        |
| ----------------- | ------- | ---- | ------- | ----------------------------------------------------------------- |
| `id`              | uuid    | NO   | `gen_random_uuid()` | PK                                                    |
| `invoice_id`      | uuid    | NO   | —       | FK lógica `invoices.id` (sem FK física)                           |
| `company_id`      | uuid    | NO   | —       | Redundante — RLS por tenant                                       |
| `yarn_type_id`    | uuid    | YES  | —       | Preenchido em `entrada`/`venda_fio`                               |
| `yarn_type_name`  | text    | YES  | —       | Snapshot do nome do fio (histórico estável)                       |
| `article_id`      | uuid    | YES  | —       | Preenchido em `saida` (opcional)                                  |
| `article_name`    | text    | YES  | —       | Snapshot ou texto livre em `saida`                                |
| `weight_kg`       | numeric | NO   | `0`     | Peso do item                                                      |
| `quantity_rolls`  | numeric | YES  | `0`     | Rolos                                                             |
| `quantity_boxes`  | numeric | YES  | `0`     | Caixas (`entrada`/`venda_fio`)                                    |
| `value_per_kg`    | numeric | YES  | `0`     | R$/kg                                                             |
| `subtotal`        | numeric | YES  | `0`     | `weight_kg * value_per_kg` gravado (não é generated)              |
| `brand`           | text    | YES  | —       | **Marca do fio** — chave do saldo por marca                       |
| `observations`    | text    | YES  | —       |                                                                   |
| `created_at`      | timestamptz | NO | `now()` |                                                                 |

**RLS:** 4 policies (`SELECT/INSERT/UPDATE/DELETE`) para `authenticated`, com `company_id = get_user_company_id()`.

> Não existe FK física entre `invoice_items.invoice_id` e `invoices.id` — integridade mantida pela aplicação. O `handleCancelInvoice` para `type='entrada'` faz `DELETE FROM invoices` sem tocar em `invoice_items`; para os demais tipos apenas seta `status='cancelada'`.

### 2.3 `public.yarn_types` (registry de tipos de fio)

| coluna         | tipo  | null | default             |
| -------------- | ----- | ---- | ------------------- |
| `id`           | uuid  | NO   | `gen_random_uuid()` |
| `company_id`   | uuid  | NO   | —                   |
| `name`         | text  | NO   | —                   |
| `composition`  | text  | YES  | —                   |
| `color`        | text  | YES  | —                   |
| `observations` | text  | YES  | —                   |
| `created_at`   | timestamptz | NO | `now()`         |

RLS: 4 policies padrão por tenant. Consumida por várias telas (Artigos, Estoque, OT). Deletar um `yarn_type` NÃO limpa `invoice_items.yarn_type_id` (o snapshot `yarn_type_name` mantém a leitura funcional).

### 2.4 `public.outsource_yarn_stock` (aba Fio Terceiros)

| coluna                  | tipo    | null | default             | observação                                        |
| ----------------------- | ------- | ---- | ------------------- | ------------------------------------------------- |
| `id`                    | uuid    | NO   | `gen_random_uuid()` | PK                                                |
| `company_id`            | uuid    | NO   | —                   | Tenant                                            |
| `outsource_company_id`  | uuid    | NO   | —                   | FK `outsource_companies.id` ON DELETE CASCADE     |
| `yarn_type_id`          | uuid    | NO   | —                   | FK `yarn_types.id` ON DELETE CASCADE              |
| `quantity_kg`           | numeric | NO   | `0`                 | Saldo em kg                                       |
| `reference_month`       | text    | NO   | —                   | `YYYY-MM`                                         |
| `observations`          | text    | YES  | —                   |                                                   |
| `created_at/updated_at` | timestamptz | NO | `now()`           |                                                   |

**Chave de conflito no upsert:** `(company_id, outsource_company_id, yarn_type_id, reference_month)` — um registro por facção × fio × mês.

RLS: 4 policies `authenticated` isolando por `company_id`. Também é lida/escrita pelo módulo Terceirizado (`_adjust_outsource_yarn_stock` chamado em `save/delete_outsource_production` — Fase 4 de `rpcoutsource.md`), o que a torna um **ponto de acoplamento**.

### 2.5 Tabelas relacionadas usadas apenas para leitura

- `outsource_companies` — dropdown de facções (aba EFT + campo "Terceiros" da NF de Saída).
- `articles` + `clients` (via `CompanyDataContext.getArticles/getClients`) — Saldo Global (consumo por `article.yarn_type_id`).
- `productions` (via `CompanyDataContext.getProductions`) — alimenta "Consumido (mês)" em Saldo Global.
- `companies` — buscada pontualmente no botão "Exportar" (venda de fio) para carregar `name` + `logo_url` no PDF.

**Tabelas `yarn_stock_entries/pallets/movements/machine_current/clients` NÃO são consumidas por Invoices.tsx.** Pertencem a `StockMalha.tsx` (`docs/estoquemalhas.md`).

---

## 3. Dependências e imports relevantes

```ts
import { BrazilianWeightInput } from '@/components/BrazilianWeightInput';       // input de peso PT-BR (1.234,56)
import { SearchableSelect }     from '@/components/SearchableSelect';           // dropdown com busca
import { DeleteConfirmDialog }  from '@/components/DeleteConfirmDialog';       // confirm custom
import { useAuth }              from '@/contexts/AuthContext';                  // user.company_id
import { useAuditLog }          from '@/hooks/useAuditLog';                     // logAction + userName/userCode
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';           // getClients/getArticles/getProductions
import { usePermissions }       from '@/hooks/usePermissions';                  // canSeeFinancial
import { supabase }             from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateYarnSalesReportPdf } from '@/lib/yarnSalesReportPdf';
import { formatCurrency, formatNumber, formatWeight, getDateLimits, isDateValid } from '@/lib/formatters';
import { getFriendlyErrorMessage } from '@/lib/utils';
```

Helpers locais:

- `sb = (table) => (supabase.from as any)(table)` — atalho para escapar de tipagem quando a tabela não está no `types.ts` gerado.
- `fetchAllPaginated<T>(table, companyId, orderCol, ascending)` — paginação client-side (1000/vez) até esgotar. Usada em `invoices`, `invoice_items`, `outsource_yarn_stock`. **Dívida técnica:** o loop cresce linearmente com o banco; RPCs análogas às de `docs/rpcoutsource.md` resolveriam.
- `formatYarnLabel({name, color, composition})` → `"Nome — Cor — (Composição)"`.

---

## 4. Estado e dados (topo do componente)

### 4.1 Queries (`useQuery`)

| queryKey                             | fonte                                                     | uso                                          |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| `['yarn_types', companyId]`          | `sb('yarn_types').select('*').order('name')`             | dropdowns + aba "Tipos de Fio"               |
| `['invoices', companyId]`            | `fetchAllPaginated<Invoice>('invoices', ...)`            | listagens + KPIs + saldos                    |
| `['invoice_items', companyId]`       | `fetchAllPaginated<InvoiceItem>('invoice_items', ...)`   | joins client-side com invoices               |
| `['outsource_companies', companyId]` | `sb('outsource_companies').select('id, name').order('name')` | dropdown Tinturaria/Terceiros + aba EFT  |
| `['outsource_yarn_stock', companyId]`| `fetchAllPaginated(...)`                                 | aba "Fio Terceiros"                          |

`clients`, `articles` e `productions` vêm do `CompanyDataContext` (compartilhados pelo app).

### 4.2 Estado local principal

- **URL/tab:** `activeTab` (default = querystring ou `'entrada'`); onValueChange grava `?tab=` via `window.history.pushState` sem reload.
- **Paginação global das 3 abas de listagem:** `currentPage`, `itemsPerPage=20`. Reset automático em `activeTab | filterStatus | filterMonth | searchTerm`.
- **Filtros das listagens:** `searchTerm`, `filterStatus`, `filterMonth`.
- **Filtros de saldo:** `saldoYarn`, `saldoMonth`; `saldoGlobalYarn`, `saldoGlobalMonth`.
- **Filtros e form EFT:** `eftMonth/eftCompany/eftYarn` + `eftDialogOpen/eftEditing/eftFormCompany/eftFormYarn/eftFormMonth/eftFormQty/eftFormObs`.
- **Formulário de NF:** `formType`, `formInvoiceNumber`, `formAccessKey`, `formClientId` (legado), `formSupplierName`, `formBuyerName`, `formTinturariaName`, `formTerceirosName`, `formIssueDate` (default hoje), `formStatus` (default `'conferida'`), `formObservations`, `formItems: Array<{yarn_type_id?, article_id?, article_name_free?, weight_kg, quantity_rolls, quantity_boxes, value_per_kg, brand}>`.
- **Registry de fios:** `yarnDialogOpen`, `editingYarn`, `yarnName/yarnComposition/yarnColor/yarnObs`, `yarnSearchTerm`.
- **Dialogs auxiliares:** `viewDialogOpen/viewingInvoice`, `cancelConfirmInvoice`, `deleteYarnConfirm`, `deleteEftConfirmId`.

---

## 5. Leitor de código de barras (SEFAZ 44 dígitos)

`useEffect` global de `keydown` (ativo apenas com `dialogOpen === true`) buferiza dígitos e detecta padrão de scanner:

```ts
SCANNER_THRESHOLD_MS = 80;   // digitação humana > 80ms; scanner < 80ms
```

- Intervalo > 80 ms → reseta o buffer (digitação manual).
- Ao acumular 44 dígitos, `setFormAccessKey(buffer)` + toast "Chave de Acesso lida com sucesso!". Aceita `Enter` final. Qualquer tecla não-dígito (exceto `Shift`) descarta o buffer.

Mesmo padrão registrado em `mem://features/scanner-integration`.

---

## 6. Fluxos por aba

### 6.1 `entrada` / `venda_fio` / `saida_malha`

#### 6.1.1 KPIs

```ts
kpis = {
  count:      active.length,
  totalKg:    Σ active.total_weight_kg,
  totalValue: Σ active.total_value,
  pendentes:  active.filter(status==='pendente').length,
}   // active = filteredInvoicesBase.filter(status !== 'cancelada')
```

`Valor Total` só aparece com `canSeeFinancial`.

#### 6.1.2 Filtros + Ações

- Botões variam por aba: `Nova Entrada`, `Venda de Fio` + `Exportar`, `Saída Malha`.
- `Exportar` (venda_fio): `sb('companies').select('name, logo_url').eq('id', companyId).maybeSingle()` e chama `generateYarnSalesReportPdf({invoices, items, companyName, companyLogoUrl, filters, canSeeFinancial})`.
- Selects de Mês/Status + Input de busca + botão `Limpar`.

#### 6.1.3 Cálculo do dataset visível

```ts
filteredInvoicesBase = invoices
  .filter(por tab: entrada/venda_fio/saida)
  .filter(status ≠ 'all')
  .filter(mês ≠ 'all' → issue_date.startsWith(mês))
  .filter(searchTerm: casa em invoice_number/client_name/buyer_name/destination_name/access_key
          OU em invoice_items.yarn_type_name/article_name da NF)

filteredInvoices = filteredInvoicesBase.slice((page-1)*20, page*20)
totalPages       = ceil(filteredInvoicesBase.length / 20)
```

`availableMonths` é derivada de `invoices.issue_date` (+ mês corrente), filtrada `2020 ≤ year ≤ 2099`, DESC.

#### 6.1.4 Renderização da lista

- **Mobile (`md:hidden`):** cards empilhados com NF, entidade, tipo de fio ou artigo, terceiros (`saida_malha`), data + peso + valor, autoria e ações.
- **Desktop:** `Table` shadcn com as mesmas colunas.
- **Paginação:** janela deslizante de 5 números (`Anterior` + 5 botões + `Próxima`).
- **Empty states:** loading (`Loader2`), lista vazia ("Nenhuma NF encontrada").

#### 6.1.5 Criação de NF

`openNewInvoice(type)` seta `formType`, chama `resetForm()` e abre `dialogOpen`. `handleSaveInvoice`:

1. **Validação por tipo:** `saida` → tinturaria + Nº NF; `entrada` → fornecedor; `venda_fio` → cliente. `isDateValid(formIssueDate)` (±5 anos). `formAccessKey` opcional; se preenchido, 44 dígitos numéricos.
2. **Filtragem de itens válidos:** `entrada`/`venda_fio` exigem `yarn_type_id`; `saida` exige `article_id` OU `article_name_free`; todos exigem `weight_kg > 0`.
3. **Totais:** `totalWeight`, `totalValue`.
4. **INSERT em `invoices`:** overload de `buyer_name` (fornecedor/cliente/terceiros) e `destination_name` (tinturaria). `.select('id').single()`.
5. **INSERT em `invoice_items`:** snapshot de `yarn_type_name` / `article_name`.
6. **Pós-save:** `invalidateQueries(['invoices','invoice_items'])`, `logAction('invoice_create')`, toast, `resetForm()`. **Não fecha o dialog** — permite lançar várias NFs em sequência.

#### 6.1.6 Confirmar / Cancelar / Excluir

- `handleConfirmInvoice(inv)`: `UPDATE status='conferida'` + `logAction('invoice_confirm')`.
- `handleCancelInvoice(inv)`:
  - `type === 'entrada'`: **DELETE físico** (itens ficam órfãos — intencional). `logAction('invoice_delete')`.
  - Caso contrário: `UPDATE status='cancelada'`. `logAction('invoice_cancel')`.
- Ambos via `DeleteConfirmDialog` (`cancelConfirmInvoice`) — sem `confirm()` nativo.

#### 6.1.7 Visualização

`handleViewInvoice(inv)` popula `viewingInvoice`; `viewItems = invoiceItems.filter(...)`. Layout: metadados + chave + observações + tabela de itens (colunas condicionais por `type` e `canSeeFinancial`) + autoria/timestamp.

### 6.2 `saldo` — Saldo Fios por marca

`yarnBalance` (useMemo): agrupa `invoice_items` por `it.brand || 'Sem marca'` sobre NFs `entrada`/`venda_fio` não canceladas, respeitando `saldoMonth`. Retorna `[{brand, received, sold, balance = received - sold}]`, filtrado por `saldoYarn`, ordenado por marca.

`saldoBrandOptions`: marcas já vistas em NFs ativas para popular o `SearchableSelect` de filtro.
`saldoKpis`: soma horizontal para os cards.

Renderização: 3 KPIs (Recebido/Vendido/Saldo) + filtros + tabela/cards com `Badge` "Alerta" vermelho quando `balance < 0`.

### 6.3 `saldoGlobal` — Saldo Global por tipo de fio

Consolida compra vs consumo produtivo vs venda por **tipo de fio**, incluindo estoque acumulado.

```ts
yarnGlobalBalance:
  para cada yarn_type y → { purchaseMonth, consumedMonth, salesMonth, stockAccumulated }

  1) COMPRA (invoices.type='entrada', não cancelada)
     ∀ item.yarn_type_id: se issue_date.startsWith(month) → purchaseMonth += weight
                          se issue_date ≤ endDate         → stockAccumulated += weight

  2) CONSUMO (productions do CompanyDataContext, via article.yarn_type_id)
     se prod.date.startsWith(month) → consumedMonth += weight
     se prod.date ≤ endDate         → stockAccumulated -= weight

  3) VENDAS (invoices.type='venda_fio', não cancelada)
     ∀ item.yarn_type_id: se issue_date.startsWith(month) → salesMonth += weight
                          se issue_date ≤ endDate         → stockAccumulated -= weight

  filtra fios com movimento; se saldoGlobalYarn ≠ 'all' → filtra o específico
```

`endDate = lastDayOfMonth(saldoGlobalMonth)` ou `'9999-12-31'` se `all`. O acumulado ignora o filtro de mês para representar o estoque real ao final do período.

**Acoplamento:** o "consumo" depende de `article.yarn_type_id`. Sem esse vínculo, o consumo daquele artigo não é subtraído — o saldo cresce artificialmente. Regra alinhada com `mem://logic/yarn-balance-calculation` (o global é indicativo; a fonte primária é o saldo por marca).

`saldoGlobalKpis`: soma linha a linha para os 4 KPIs. Render espelha a aba anterior (tabela desktop + cards mobile + Badge de alerta).

### 6.4 `efterceiro` — Fio Terceiros

**Leitura:** `outsourceYarnStock` paginado; `eftGroups` agrupa por facção após aplicar filtros (`eftMonth/eftCompany/eftYarn`).

```ts
eftGroups = [{
  outsourceCompanyId, outsourceCompanyName,
  items: [{id, yarnTypeId, yarnTypeName, quantityKg, referenceMonth, observations}],
  totalKg: Σ item.quantity_kg,
}]
```

`eftKpis`: total kg + facções únicas + tipos de fio únicos. `eftAvailableMonths`: meses distintos em `outsource_yarn_stock.reference_month` + mês corrente, DESC.

**UI:** `Collapsible` por facção (aberto por padrão) com cards no mobile e `Table` no desktop. Cada linha tem `Pencil`/`Trash2` se `canSeeFinancial`.

**Formulário:**

- `openNewEft()` limpa e define `eftFormMonth` = mês corrente.
- `openEditEft(item, companyId)` preenche o form; `Facção`, `Fio` e `Mês` ficam **disabled** em edição (chave imutável).
- `handleSaveEft`:
  - Validação de campos + `qty > 0`.
  - Edição: `UPDATE quantity_kg + observations` no `id`.
  - Novo: **`upsert` com `onConflict: 'company_id,outsource_company_id,yarn_type_id,reference_month'`** — sobrescreve se já existir (fecha corrida com o helper do Terceirizado).
  - `logAction` (`outsource_yarn_stock_create/update`), invalidate `['outsource_yarn_stock']`, `toast`, **mantém o dialog aberto** limpando fio/qty/obs (preserva `eftFormCompany` p/ lançar vários fios da mesma facção).
- `handleDeleteEft(id)`: `DELETE` + `logAction`.

### 6.5 `fios` — Registry de Tipos de Fio

`Card` com busca (`yarnSearchTerm`, casa em `name/composition/color`) e botão "Novo Fio". Lista mobile em cards; desktop em Table (Nome, Composição, Cor, Ações).

**Formulário:**

- `handleSaveYarn`: valida nome; INSERT/UPDATE em `yarn_types`; `logAction('yarn_type_create'/'yarn_type_update')`; invalida `['yarn_types']`; fecha dialog.
- `handleDeleteYarn(y)`: DELETE + `logAction('yarn_type_delete')`. Não bloqueia se houver referências — o snapshot `invoice_items.yarn_type_name` mantém a leitura funcional ("Fio removido" quando o join falha).

---

## 7. Código morto conhecido

- **Aba "Estoque de Malha" (linhas 852-923):** o `useMemo` `malhaEstoque` e `estoqueKpis` seguem calculando, mas **não existe mais `TabsTrigger` nem `TabsContent`**. A funcionalidade migrou para `src/pages/StockMalha.tsx`. Custa 1 recomputo por render — candidato a remoção.
- `formClientId`, `selectedClient`, `clientArticles`: cadeia legada que hoje só é gravada como `null`. O UI usa `formSupplierName/formBuyerName/formTinturariaName` como campos livres.

---

## 8. Regras de negócio e invariantes

1. **NF cancelada = ignorada** em todos os saldos e KPIs (`status !== 'cancelada'`).
2. **Snapshot de nomes:** `yarn_type_name` e `article_name` em `invoice_items` são gravados no INSERT (não são joins vivos) — mantém histórico consistente.
3. **Excluir NF de entrada é permanente e não estorna itens.** Trata "cancelar entrada" como "estornar uma compra que nunca aconteceu".
4. **Marca (`brand`) é a chave do saldo por marca**, não o `yarn_type_id`. Regra em `mem://logic/yarn-balance-calculation`.
5. **`buyer_name` overloaded** (fornecedor/cliente/terceiros conforme `type`). Refactor futuro poderia separar em colunas distintas.
6. **`issue_date` como `text`:** padrão do projeto (comparações lexicográficas via `>=/<=` funcionam por causa de `YYYY-MM-DD`). Cuidado ao portar para RPC — usar `substring(date,1,7)` ou cast (bug análogo já corrigido em `get_outsource_bootstrap`).
7. **Data ±5 anos:** `isDateValid()` bloqueia lançamentos absurdos (`mem://constraints/date-entry-validation`).
8. **Financeiro escondido por permissão:** `canSeeFinancial` (`usePermissions`) esconde R$ em KPIs, tabelas, formulários e no PDF de venda de fio.
9. **`upsert` do Fio Terceiros** garante que duplicidade (usuário + edge function do Terceirizado gravando o mesmo mês) resolva pela última escrita.

---

## 9. Auditoria

Toda mutação chama `logAction(actionType, payload)` gravando em `audit_logs`. Ações usadas:

| Ação                             | Contexto                                   |
| -------------------------------- | ------------------------------------------ |
| `invoice_create`                 | criar NF                                   |
| `invoice_confirm`                | conferir NF                                |
| `invoice_cancel`                 | cancelar NF (venda_fio/saida)              |
| `invoice_delete`                 | excluir NF de entrada                      |
| `yarn_type_create`               | novo fio                                   |
| `yarn_type_update`               | editar fio                                 |
| `yarn_type_delete`               | excluir fio                                |
| `outsource_yarn_stock_create`    | novo saldo em facção                       |
| `outsource_yarn_stock_update`    | editar saldo em facção                     |
| `outsource_yarn_stock_delete`    | excluir saldo em facção                    |

---

## 10. Integrações com outros módulos

- **Terceirizado (`src/pages/Outsource.tsx` + Fase 4 do `rpcoutsource.md`):** RPCs `save_outsource_production/delete_outsource_production` chamam `_adjust_outsource_yarn_stock`, que faz UPSERT/estorno em `outsource_yarn_stock` — mesma tabela editada aqui na aba EFT. Regra: peso da produção terceirizada **deduz** do saldo do fio da facção.
- **Estoque de Malha (`src/pages/StockMalha.tsx`):** consome NFs `type='saida'` para calcular entregas.
- **Faturamento Total, Relatórios, Fechamento Mensal:** leem `invoices/invoice_items` para receita (venda de fio) e movimentação de trama.
- **Dashboard/OFR/OM/OC/OT:** independentes; nenhuma leitura direta.

---

## 11. Pontos de dívida técnica (roadmap sugerido)

1. **Migrar para RPCs** no padrão `docs/rpcoutsource.md`: `get_invoices_bootstrap`, `get_invoices_list(type, filters, page)`, `get_yarn_balance_by_brand`, `get_yarn_global_balance`. Ganho relevante em empresas com > 10k NFs.
2. **Remover a aba morta "Estoque de Malha"** (§7).
3. **Separar `buyer_name`** em `supplier_name` / `buyer_name` / `outsource_terceiros_name` via migração + backfill.
4. **FK física `invoice_items.invoice_id → invoices.id ON DELETE CASCADE`** — tornaria o comportamento atual explícito.
5. **Realtime opcional** em `invoices/invoice_items/outsource_yarn_stock` (padrão `mem://features/ofr-realtime`).

---

## 12. Referências

- `mem://logic/yarn-balance-calculation` — regra de "saldo por marca".
- `mem://logic/yarn-type-identification` — `short_id` de 4 dígitos (não usado aqui, mas relacionado).
- `mem://features/invoices-stock-control-refined` — histórico do refactor anterior (tabs, `BrazilianWeightInput`, dedução de fio).
- `mem://features/scanner-integration` — padrão do listener USB < 80 ms.
- `mem://constraints/deletion-safety`, `mem://constraints/date-entry-validation`, `mem://constraints/numeric-validation-invoices`.
- `docs/rpcoutsource.md` — modelo para futura migração RPC desta página.
- `docs/estoquefioterceiro.md`, `docs/saldofios.md`, `docs/saldofiosglobal.md` — visões complementares.

*Última atualização: 18/07/2026 (Brasília).*
