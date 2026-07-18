# `docs/clientInvoices.md` — Notas Fiscais (Clientes)

> Documentação 100% detalhada de `src/pages/ClientInvoices.tsx` (1803 linhas) — rota `/:slug/client-invoices`. Fonte única para manutenção e para uma futura migração server-side (RPCs).

---

## 1. Propósito do módulo

Controle de **NFs de ENTRADA de fio** enviadas pelos clientes (modelo facção — o cliente fornece o fio) e das **SAÍDAS de malha** produzidas com esse fio. Calcula:

- Saldo a enviar por NF de entrada (peso entrada − peso descontado em saídas).
- Consolidados por cliente (entrada, saída, saldo).
- Vínculo N:N entre saídas e entradas, com desconto por tipo de fio.

Complementa `src/pages/Invoices.tsx` (NFs de trama internas) — aqui é o "espelho" das NFs recebidas do cliente e da malha devolvida.

---

## 2. Banco de dados

Todas as tabelas moram no schema `public` com RLS por `company_id = get_user_company_id()`; `GRANT` para `authenticated`/`service_role` (padrão do projeto).

### 2.1 `client_invoices` — cabeçalho da NF

| Coluna | Tipo | Null | Default | Uso |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `company_id` | uuid | NOT NULL | — | Tenant (RLS) |
| `client_id` | uuid | NOT NULL | — | FK `clients.id` (CASCADE) |
| `type` | enum | NOT NULL | — | `'entrada' \| 'saida'` |
| `invoice_number` | text | NOT NULL | — | Número da NF (livre; NÃO é único) |
| `issue_date` | date | NOT NULL | — | Data de emissão |
| `observations` | text | NULL | — | Livre |
| `created_at` / `updated_at` | timestamptz | NOT NULL | `now()` | Auditoria |
| `created_by_name` | text | NULL | — | Preenchido via `useAuditLog().userTrackingInfo` |
| `created_by_code` | text | NULL | — | Idem |
| `parent_invoice_id` | uuid | NULL | — | **LEGADO** — vínculo 1:1 saída→entrada. Substituído por `client_invoice_exit_links`. CASCADE self-ref. |
| `supplier_name` | text | NULL | — | Fornecedor do fio (apenas para `type='entrada'`) |
| `composition` | jsonb | NULL | — | **Não mais gravado**; sempre `null` no UPDATE/INSERT. Composição de fios ficou obsoleta em favor dos `exit_links`. |

**Política RLS**: `Users can manage client_invoices of their company` FOR ALL — `company_id = get_user_company_id()`.

### 2.2 `client_invoice_items` — item da NF (1:1 na prática)

O modelo prevê múltiplos itens, mas o UI cadastra **exatamente 1 item por NF**. As mutations sempre leem/gravam `items[0]` (ver §5.4).

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | uuid | PK |
| `invoice_id` | uuid | FK `client_invoices.id` (CASCADE) |
| `company_id` | uuid | Tenant |
| `yarn_type_id` | uuid NULL | Preenchido em `entrada` (FK `yarn_types.id`, SET NULL) |
| `article_id` | uuid NULL | Preenchido em `saida` (FK `articles.id`, SET NULL) |
| `weight_kg` | numeric | Peso total do item |
| `created_at` | timestamptz | — |

**Política RLS**: FOR ALL — `company_id = get_user_company_id()`.

### 2.3 `client_invoice_exit_links` — vínculo N:N (saída → entrada por fio)

**Substitui** `client_invoices.parent_invoice_id` em cenários onde uma saída consome várias entradas (multi-fio ou multi-NF).

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | uuid | PK |
| `company_id` | uuid | Tenant |
| `exit_invoice_id` | uuid NOT NULL | FK `client_invoices.id` (CASCADE) — a saída |
| `entry_invoice_id` | uuid NOT NULL | FK `client_invoices.id` (CASCADE) — a entrada da qual descontar |
| `yarn_type_id` | uuid NULL | Fio abatido no vínculo (informativo — hoje sempre igual ao `yarn_type_id` da entrada) |
| `deduct_kg` | numeric NOT NULL default 0 | Kg descontados da entrada por esta saída |
| `created_at` | timestamptz | — |

**Políticas RLS separadas** (`tenant_select/insert/update/delete`), todas restritas por `company_id`.

### 2.4 Tabelas coadjuvantes

- `clients` — nome do cliente (dropdown, aba dedicada por cliente).
- `yarn_types` — nome do fio (dropdown em entradas).
- `articles` — artigos de malha filtrados por `client_id` (dropdown em saídas).
- `companies` — apenas para carregar `name` e `logo_url` usados nos PDFs.

### 2.5 RPCs

**Nenhuma.** Todas as operações são queries diretas via PostgREST com filtro por `company_id` (RLS). Migração para RPC prevista (§15).

---

## 3. Arquitetura e dependências

```
ClientInvoices (default export)
├─ useSharedCompanyData()  → clients, articles, yarnTypes (in-memory)
├─ useQuery('client_invoices')             → SELECT * + items:client_invoice_items(*)
├─ useQuery('client_invoice_exit_links')   → SELECT *
├─ useEffect(companies)                    → logo_url + name (para PDF)
└─ Sub-componente <ClientDetailView />     → renderizado por aba de cliente aberto
```

### Contexto e hooks

- `useAuth()` — obtém `user.company_id`.
- `useSharedCompanyData()` — evita re-fetch de `clients`/`articles`/`yarn_types` (já vêm do `CompanyDataContext`).
- `useAuditLog()` — `logAction()` para auditoria + `userTrackingInfo` (`created_by_name`/`created_by_code`).
- `useQueryClient()` — invalida `['client_invoices']` e `['client_invoice_exit_links']` após mutations.

### Bibliotecas

- **UI**: `@/components/ui/*` (Card, Dialog, Table, Tabs, AlertDialog…), `lucide-react` (ícones).
- **Datas**: `date-fns` + `ptBR` (`format`).
- **Toasts**: `sonner`.
- **PDF**: `@/lib/clientInvoicePdf.ts` (`exportClientInvoicesGeneralPdf`, `exportClientInvoiceByNfPdf`) — `jsPDF` + `jspdf-autotable`, carregados dinamicamente dentro dos helpers.
- **Select com busca**: `@/components/SearchableSelect`.

---

## 4. Layout: 2 níveis de abas

### 4.1 Aba raiz `Tabs value={activeTabId}`

- **`search`** (Busca Geral) — lista todas as NFs da empresa, com busca livre e filtro de mês. Paginada a 15 por página (`SEARCH_PAGE_SIZE`).
- **Uma aba por cliente aberto** — instanciada dinamicamente a partir do `SearchableSelect` do topo (`handleAddTab`). Cada aba renderiza `<ClientDetailView clientId=tab.id />`. Fechável pelo `X` (`handleCloseTab`).

### 4.2 `ClientDetailView` (sub-abas por cliente)

3 KPIs no topo (Entrada, Saída, Saldo) sobre `stats` já filtrado por `localSearch`.

Sub-tabs (`activeSubTab`):

- **`aberto`** — NFs de entrada com `saldo > 0.001`. **Sem paginação** (assume-se poucas em aberto).
- **`encerrada`** — NFs de entrada com `saldo <= 0.001`. Paginada 15/página.
- **`historico`** — TODAS as NFs (entrada + saída) do cliente. Paginada 15/página. Colunas simplificadas (sem "Fornecedor", saldo `-`).

---

## 5. Fluxos de dados e mutations

### 5.1 Bootstrap

```ts
const { data: clientInvoices } = useQuery({
  queryKey: ['client_invoices', companyId],
  queryFn: () => supabase.from('client_invoices')
    .select('*, items:client_invoice_items(*)')
    .eq('company_id', companyId)
    .order('issue_date', { ascending: false }),
});

const { data: exitLinksAll } = useQuery({
  queryKey: ['client_invoice_exit_links', companyId],
  queryFn: () => supabase.from('client_invoice_exit_links').select('*').eq('company_id', companyId),
});
```

`companies.logo_url` / `.name` é carregado via `useEffect` sem cache — usado apenas nos PDFs.

### 5.2 Estado do formulário

- `dialogOpen` — abre `<Dialog>` de cadastro/edição.
- `formType` — `'entrada' | 'saida'`.
- `editingInvoice` — objeto sendo editado (ou `null` para criar).
- `parentInvoiceId` — usado apenas ao criar saída via "Registrar Saída" (`ArrowUpRight`) em uma entrada. Pré-alimenta um vínculo em `exitLinks`.
- `exitLinks: LinkRow[]` — `{ entry_invoice_id, yarn_type_id, deduct_kg }[]`. Editável no modal.
- `composition: CompRow[]` — legado; mantido no estado por compatibilidade, mas **não gravado** (sempre `composition: null` no update/insert).

### 5.3 `saveInvoiceMutation` (mutation principal)

Fluxo em `CREATE`:

1. Validação client-side: campos obrigatórios + regras específicas de saída (§5.5).
2. `INSERT client_invoices` (retorna `invoice.id`).
3. `INSERT client_invoice_items` — se falhar, **rollback manual** (`DELETE client_invoices`).
4. Se `type='saida'` e há `validLinks`: `INSERT client_invoice_exit_links[]` — se falhar, **rollback manual** (delete de items + delete do invoice).

Fluxo em `UPDATE`:

1. `UPDATE client_invoices` (cabeçalho).
2. `UPDATE client_invoice_items` filtrando por `invoice_id` (edita o item único).
3. Se `type='saida'`: snapshot dos `exit_links` atuais → `DELETE` de todos os `exit_links` desta saída → `INSERT` dos novos. Se o INSERT falhar, tenta re-inserir o snapshot para não perder vínculos (best-effort — não é transacional).

**Riscos conhecidos** (documentados para futura RPC atômica):

- `delete+insert` de `exit_links` no update não é atômico. Uma falha entre os dois deixa a saída sem vínculos até o retry. O código faz best-effort de restauração.
- Rollback manual em CREATE compensa a falta de transação SQL — se qualquer passo do rollback falhar, sobra lixo.

### 5.4 `handleEditInvoice`

Carrega o estado do formulário a partir de `inv`:

- Cabeçalho + `items[0]` → `weightKg`, `yarnTypeId` ou `articleId`.
- Se `type='saida'`:
  - `composition` a partir de `inv.composition` (jsonb legado) ou `[{ '', '100' }]`.
  - `exitLinks` a partir de `exitLinksAll` filtrado por `exit_invoice_id=inv.id`. Fallback legado: se não há links mas há `parent_invoice_id`, cria 1 link sintético `{ parent_invoice_id, null, weight_kg }`.

### 5.5 Regras de negócio (saída)

Validadas em `saveInvoiceMutation.mutationFn` antes de qualquer INSERT/UPDATE:

- **Pelo menos 1 vínculo válido obrigatório** (`entry_invoice_id && deduct_kg > 0`).
- **Sem duplicidade** de `entry_invoice_id` na lista.
- **Σ `deduct_kg` ≤ `weight_kg + 0.001`** (tolerância de arredondamento). Descontar mais do que o peso da saída é bloqueado.

O UI **não** impede descontar mais do que o saldo remanescente de uma entrada (o servidor também não valida) — cabe ao usuário. O saldo é apenas informativo.

### 5.6 `handleDeleteInvoice` / `confirmDelete`

Sempre `DELETE` físico em `client_invoices` (nunca soft-delete).

- Se a nota é uma **entrada com saídas vinculadas** (via `parent_invoice_id` legado OU via `exit_links`), o CASCADE das FKs (`ON DELETE CASCADE` em `parent_invoice_id`, `exit_invoice_id`, `entry_invoice_id`) apaga também as saídas vinculadas / links. Um toast avisa: `"Nota excluída — saídas vinculadas podem precisar ser revisadas"`.
- Nenhuma checagem prévia impede a exclusão. Escolha intencional: o operador pode limpar entradas erradas mesmo com saídas apoiadas.

---

## 6. Auto-distribuir peso (`Wand2` no dialog de saída)

Botão que preenche automaticamente os campos `deduct_kg` de todos os vínculos com base no saldo disponível de cada NF de entrada:

1. Para cada `link.entry_invoice_id`, calcula `saldo = weight_entrada − Σ deduct_kg de outras saídas (excluindo o próprio invoice se estiver em edição)`.
2. Distribui proporcionalmente: `take = (totalKg * saldo) / totalSaldo`, cap no `saldo`.
3. O **último link válido** recebe o `remaining` para absorver diferenças de arredondamento (evita perder kg quando o último item do array é uma linha vazia).

Erros:
- Peso total 0 → toast "Informe o peso total antes de auto distribuir".
- Nenhum link com `entry_invoice_id` → toast "Adicione ao menos uma NF de entrada".
- Saldo total 0 → toast "Sem saldo disponível nas NFs selecionadas".

---

## 7. Cálculo de saldo (`invoicesWithBalance`)

Executado em `ClientDetailView` via `useMemo`:

```
for each entrada in invoices:
  links = exitLinksAll.filter(l => l.entry_invoice_id === entrada.id)
  weightFromLinks = Σ links.deduct_kg
  linkedExitIds  = set(links.exit_invoice_id)
  legacy         = invoices.filter(i => i.type='saida' && i.parent_invoice_id=entrada.id && !linkedExitIds.has(i.id))
  weightLegacy   = Σ legacy.items[0].weight_kg
  saldo          = max(0, entrada.items[0].weight_kg − (weightFromLinks + weightLegacy))
  isEncerrada    = saldo <= 0.001
```

A regra `!linkedExitIds.has(i.id)` evita **contagem dupla** para saídas legadas que já foram migradas para `exit_links` (não descontar 2x). O `Math.max(0, …)` esconde inconsistências de saldos negativos.

O mesmo cálculo é replicado nos PDFs (`exportClientInvoicesGeneralPdf` e `exportClientInvoiceByNfPdf`).

---

## 8. Modal "Saídas vinculadas" (`linkedDialogOpen`)

Acessível pelo botão `List` em cada NF de entrada nas abas de cliente. Mostra:

- 4 KPIs — Cliente, Fio, Fornecedor, Peso Entrada.
- Barra de progresso — `consumido / entrada` (`amber` → `emerald` a 100%).
- Tabela das saídas vinculadas — mescla `linked` (via `exit_links`) + `legacy` (via `parent_invoice_id` sem link).
- Botão "Nova Saída de Malha" → dispara `onAddFromClient('saida', linkedParent.id, linkedParent.client_id)`.

---

## 9. Exportação PDF (modal `exportOpen`)

2 modos:

### 9.1 `general`

Filtros: `Tipo` (`ambos|entrada|saida`), `Mês`, `Data início/fim`. Aplica todos em cascata sobre `invoices` do cliente ativo → gera `exportInvoices`. Chama `exportClientInvoicesGeneralPdf({...})` — PDF paisagem A4, tabela com colunas `Data | NF | Cliente | Fio | Fornecedor | Peso Entrada | Peso Saída | Saldo`.

### 9.2 `by_nf`

Lista as 50 primeiras entradas do cliente (com busca opcional por NF). Botão "Exportar" por linha → `exportClientInvoiceByNfPdf({...})` — PDF retrato A4 com header em box (Cliente/Fio/Fornecedor/Peso Entrada/Total Saída/Saldo/Status) + tabela de saídas vinculadas.

Ambos os geradores estão em `src/lib/clientInvoicePdf.ts` e usam:
- `loadLogoForPdf(url)` — converte URL para dataURL via `<canvas>`.
- `drawHeader(...)` — cabeçalho padronizado com logo/nome + título + período + data de geração.
- `sanitizePdfText` (`src/lib/pdfUtils.ts`) — remove caracteres não suportados pelo helvetica padrão.

---

## 10. Auditoria

`useAuditLog().logAction(action, details)` grava em `audit_logs`:

| Ação | Payload |
|---|---|
| `NF CLIENTES: Criou nota` | `{ invoice_number, type }` |
| `NF CLIENTES: Editou nota` | `{ invoice_number, type }` |
| `NF CLIENTES: Excluiu nota` | `{ id, was_parent }` (`was_parent=true` se tinha saídas vinculadas) |

`created_by_name` e `created_by_code` também são gravados no próprio `client_invoices` via `userTrackingInfo`.

---

## 11. Responsividade

Padrão do projeto (memória `style/modal-sizing`):

- **Desktop (`md:`)** → `<Table>`.
- **Mobile (`< md`)** → cards empilhados (`md:hidden divide-y`).
- Modais: `w-[95vw] max-w-[95vw] sm:max-w-[80vw]` com `overflow-y-auto overflow-x-hidden`.
- Tabs de clientes rolam horizontal (`overflow-x-auto no-scrollbar`).

---

## 12. Integrações com outros módulos

- **`ClientsArticles.tsx`** — origem de `clients` e `articles`. Alterações refletem no dropdown via `CompanyDataContext`.
- **`Invoices.tsx`** — NFs de trama internas. **Não compartilham tabelas** — são fluxos independentes (facção envia malha; malharia emite NF fiscal em `invoices`).
- **PDFs** — helpers em `src/lib/clientInvoicePdf.ts`.

---

## 13. Constraints e invariantes

1. `client_invoice_items` é 1:1 na prática (UI cadastra sempre 1 item, mutations sempre leem `items[0]`).
2. Todas as escritas passam por RLS (`company_id = get_user_company_id()`).
3. `exit_links.deduct_kg` NÃO tem trigger que atualize/valide saldo — validação só no cliente.
4. Sem transação SQL — CREATE e UPDATE de `saida` compõem múltiplas queries com **rollback manual** best-effort.
5. `parent_invoice_id` é LEGADO — todo código novo deve usar `client_invoice_exit_links`. `handleEditInvoice` migra automaticamente registros legados para o modelo novo ao editar.
6. Nenhuma verificação global de unicidade de `invoice_number` — a mesma NF pode ser cadastrada 2x (intencional: cliente/tipo diferentes podem repetir).
7. `composition` (jsonb) foi descontinuado — sempre `null` no INSERT/UPDATE.

---

## 14. Código morto / débitos técnicos

- `CompRow[] composition` + `setComposition` — mantidos no estado mas nunca gravados. Podem ser removidos.
- `historyDialogOpen` / `historySearch` — modal "Histórico por Nota" declarado em `ClientDetailView` mas nenhum botão o abre. Candidato a remoção.
- Best-effort de restauração de `exit_links` em falha de UPDATE — funciona na maioria dos casos mas não em falhas de rede parciais.

---

## 15. Roadmap RPC (padrão `docs/rpcoutsource.md` / `docs/rpcmecanica.md`)

Migração recomendada para eliminar não-atomicidade e reduzir número de queries:

### Fase 1 — Bootstrap (`get_client_invoices_bootstrap`)

Retorna JSON `{ invoices[], exit_links[], company{name, logo_url} }` em uma única RPC. Substitui 3 requests por 1.

### Fase 2 — Escritas atômicas

- `save_client_invoice(p_id uuid, p_payload jsonb, p_exit_links jsonb, p_author_name text, p_author_code text)`:
  - Único BEGIN/COMMIT.
  - `SELECT ... FOR UPDATE` na entrada quando a saída fecha o saldo.
  - Substitui todo o INSERT + rollback manual (§5.3).
  - Devolve `{ ok:true, id, already:false }` (idempotência opcional por chave natural).
- `delete_client_invoice(p_id uuid)`:
  - Retorna aviso quando a entrada tem saídas dependentes (`{ ok:true, cascade_count: N }`).
- `sync_client_invoice_exit_links(p_exit_invoice_id uuid, p_links jsonb)`:
  - DELETE + INSERT dentro da transação (elimina o snapshot manual em §5.3).

### Fase 3 — Cálculo de saldo server-side

`get_client_invoice_balances(p_company_id, p_client_id?, p_include_encerradas boolean)`:

- Retorna `{ id, weight_entrada, weight_saida, saldo, is_encerrada, has_linked_outputs }[]`.
- Elimina o `useMemo` pesado (`invoicesWithBalance`) para clientes com histórico longo.

### Fase 4 — Export PDF via RPC agregada

`get_client_invoices_export(p_company_id, p_client_id?, p_type?, p_month?, p_start?, p_end?)`:

- Devolve linhas pré-formatadas com `client_name`, `yarn_name`, `article_name`, `weight_entrada`, `weight_saida`, `saldo` já calculados. Cliente apenas monta a tabela do PDF.

---

## 16. Histórico rápido

- Modelo original: `client_invoices` + `client_invoice_items` + `parent_invoice_id` (1 saída ↔ 1 entrada).
- Evolução (2025): `client_invoice_exit_links` para suportar 1 saída ↔ N entradas (multi-fio). `parent_invoice_id` mantido para leitura de registros legados.
- Atual (2026): `composition` (jsonb de percentuais) descontinuado. Auto-distribuir passa a operar via `exit_links` e saldos reais.

---

_Fim — mantenha este documento atualizado ao alterar `ClientInvoices.tsx`, tabelas `client_invoices*` ou `src/lib/clientInvoicePdf.ts`._
