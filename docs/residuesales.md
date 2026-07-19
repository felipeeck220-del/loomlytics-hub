# Vendas de Resíduos (`ResidueSales.tsx`)

> Documentação técnica 100% detalhada do módulo de Vendas de Resíduos.
> Fonte: `src/pages/ResidueSales.tsx` (~1.289 linhas).
> Complementa: `docs/Recycle.md` (visão de produto) e `docs/data/11-vendas-residuos.md` (esquema de banco).

---

## 1. Propósito

Registrar e controlar a venda de materiais residuais gerados na produção têxtil (papelão, plástico, óleo sujo, sucata, etc.) em um modelo **cliente-cêntrico**: cada comprador de resíduos mantém sua própria tabela de materiais e preços negociados. Ao registrar uma venda, o cliente é escolhido primeiro e o formulário passa a ofertar apenas os materiais vinculados àquele comprador, com o preço unitário pré-preenchido.

- **Rota:** `/:slug/residuos` (chave de sidebar `residuos`, ícone `Recycle`).
- **Acesso:** exclusivo para o perfil `admin` (controlado por `enabled_nav_items` + `usePermissions`).
- **Autoria e auditoria:** todo INSERT/UPDATE/DELETE dispara `useAuditLog.logAction` e grava snapshot `created_by_name` / `created_by_code` na tabela `residue_sales`.
- **Multi-tenant:** todas as tabelas isolam por `company_id = get_user_company_id()` via RLS (4 políticas por tabela).

---

## 2. Modelo de Dados

Quatro tabelas, todas com RLS ativo e 4 políticas (`SELECT/INSERT/UPDATE/DELETE`) baseadas em `get_user_company_id()`.

### 2.1 `residue_materials` — catálogo simples
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | `gen_random_uuid()` |
| `company_id` | uuid | RLS |
| `name` | text | Nome do material |
| `unit` | text | `'kg'` ou `'unidade'` |
| `default_price` | numeric | **Legado** — fixado em `0` na UI, mantido por compatibilidade |
| `created_at` | timestamptz | `now()` |

### 2.2 `residue_clients` — compradores
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | — |
| `company_id` | uuid | RLS |
| `name` | text | Nome do comprador |
| `created_at` | timestamptz | — |

### 2.3 `residue_client_prices` — tabela de preços por cliente
| Coluna | Tipo | Observação |
|---|---|---|
| `client_id` | uuid FK → `residue_clients` ON DELETE CASCADE | |
| `material_id` | uuid FK → `residue_materials` ON DELETE CASCADE | |
| `unit_price` | numeric | Preço negociado |
| **Constraint UNIQUE** | `(client_id, material_id)` | Cada material aparece no máximo uma vez por cliente |

### 2.4 `residue_sales` — registros de venda
| Coluna | Tipo | Observação |
|---|---|---|
| `client_id` | uuid FK → `residue_clients` ON DELETE **SET NULL** | Preservado no histórico |
| `material_id` | uuid FK → `residue_materials` ON DELETE **CASCADE** | ⚠ Ver risco em §8 |
| `material_name` / `client_name` | text | **Snapshots** — não seguem renomeações |
| `date` | text (`yyyy-MM-dd`) | Comparação lexicográfica em filtros |
| `quantity`, `unit_price`, `total` | numeric | `total = quantity * unit_price` (calculado no cliente) |
| `unit` | text | Copiado do material no momento da venda |
| `romaneio`, `observations` | text nullable | Livre |
| `created_by_name`, `created_by_code` | text nullable | Apenas no INSERT (Nome #Código) |
| `created_at` | timestamptz | Usado para ordenação DESC |

> **Sem RPCs dedicadas** — todas as operações são via PostgREST direto (`sb(table)`), protegidas exclusivamente pela RLS.

---

## 3. Estrutura do Componente

```
ResidueSales (default export)
├── Estado global (companyId, companyName, companyLogoUrl, delete confirm ids)
├── 4 useQuery: materials, residueClients, clientPrices, sales
├── 3 blocos de CRUD (Material / Cliente / Preço-Cliente)
├── Bloco Sale CRUD (form + total calculado)
├── Filtros (mês / De-Até / busca) + paginação (20/pg)
├── KPIs derivados via useMemo (totalValue, kg, unidades, count)
├── exportPDF (jsPDF + autoTable)
└── Render: <Tabs> com 3 abas (sales / clients / materials) + 6 <Dialog>s
```

### 3.1 Tipagens locais
`ResidueMaterial`, `ResidueClient`, `ResidueClientPrice`, `ResidueSale` (linhas 35–77) — todas espelham 1:1 as colunas do banco.

### 3.2 Helper `sb`
```ts
const sb = (table: string) => (supabase.from as any)(table);
```
Casting para permitir consultar tabelas que não estão em `types.ts` sem quebrar tipagem.

---

## 4. Fluxos de Dados (React Query)

Chaves de cache utilizadas:
- `['residue_materials', companyId]`
- `['residue_clients', companyId]`
- `['residue_client_prices', companyId]`
- `['residue_sales', companyId]`

Todas as mutations invalidam a chave correspondente. `deleteClient` e `deleteMat` invalidam **também** `residue_client_prices` (porque o `ON DELETE CASCADE` no banco remove registros dependentes).

### 4.1 CRUD de Materiais
- `saveMat`: valida nome não-vazio → `INSERT/UPDATE` em `residue_materials` (`default_price` sempre `0`) → invalida cache → toast → auditoria (`residue_material_create/update`).
- `deleteMat`: `DELETE` direto → auditoria com nome antes da remoção → invalida materiais e preços por cliente.

### 4.2 CRUD de Clientes de Resíduos
- `saveClient`: nome obrigatório → `INSERT/UPDATE` → auditoria (`residue_client_create/update`).
- `deleteClient`: `DELETE` (cascade remove preços) → auditoria (`residue_client_delete`).
- `expandedClientId`: estado local para expandir 1 cliente por vez e exibir seus preços.

### 4.3 CRUD de Preços por Cliente
- `openAddPrice(clientId)` e `openEditPrice(price)` compartilham o mesmo diálogo.
- `availableMaterialsForClient(clientId)`: filtra materiais já cadastrados para aquele cliente (no modo edição, mostra todos para permitir manter a seleção atual).
- `savePrice`: exige material selecionado + preço > 0 → `INSERT/UPDATE` respeitando UNIQUE `(client_id, material_id)`.
- `deletePrice`: DELETE simples.

### 4.4 CRUD de Vendas (`residue_sales`)
Estado do formulário: `saleClientId`, `saleMaterialId`, `saleQty`, `salePrice`, `saleDate`, `saleRomaneio`, `saleObs`.

**Comportamentos automáticos:**
1. `useEffect([saleClientId])`: sempre reseta material e preço quando cliente muda — exceto quando `skipPriceAutoUpdate.current === true` (usado em edição para não apagar a seleção).
2. `useEffect([saleMaterialId, saleClientPrices])`: preenche `salePrice` com `unit_price` da tabela do cliente automaticamente.
3. `openEditSale`: seta `skipPriceAutoUpdate.current = true`, aplica campos básicos, e em `setTimeout(50)` aplica `material_id/qty/price`; após 100 ms libera o auto-update novamente. **Duplo setTimeout é intencional** para vencer a corrida com os dois `useEffect` acima.
4. `saleTotal = parseBR(qty) * parseBR(price)` (useMemo).

**Validações em `saveSale`:**
- Cliente e material obrigatórios.
- `isDateValid(saleDate)` (janela ±5 anos — regra global).
- `qty > 0`, `price > 0`.
- Salva snapshot `material_name` e `client_name` a partir dos arrays locais.
- Em INSERT preenche `created_by_name` / `created_by_code`.
- **UX de multi-lançamento**: após INSERT bem-sucedido o diálogo permanece aberto e apenas material/qty/preço/romaneio/obs são limpos; o cliente e a data permanecem para lançamentos em sequência. Em UPDATE o diálogo fecha.
- Auditoria: `residue_sale_create/update/delete` com `{material, client, date}`.

### 4.5 Helper de números BR
```ts
const parseBR = v => parseFloat(v.replace(/\./g,'').replace(',', '.')) || 0;
```
Aceita `1.234,56` como `1234.56`. `formatQtyInput` / `formatPriceInput` restringem a `\d,.`.

---

## 5. Filtros, Paginação e KPIs

Estados: `filterMonth` (`'all' | 'yyyy-MM'`), `dateFrom`, `dateTo` (ambos `Date | undefined`), `searchText`, `currentPage`, `itemsPerPage = 20`.

### 5.1 `availableMonths`
Set de todos os `date.substring(0,7)` das vendas (com validação `year 2020..2099`) + mês corrente, ordenado desc.

### 5.2 `filteredSales`
Cadeia de filtros:
1. Se `filterMonth !== 'all'` → `date.startsWith(filterMonth)`.
2. Se `dateFrom` → `date >= format(dateFrom,'yyyy-MM-dd')`.
3. Se `dateTo` → `date <= format(dateTo,'yyyy-MM-dd')`.
4. Se `searchText` → ILIKE em `material_name`, `client_name`, `romaneio`.

> Filtro mês e intervalo De/Até **não são mutuamente exclusivos** — se ambos forem preenchidos, agem em série.

### 5.3 Paginação
`paginatedSales = filteredSales.slice((page-1)*20, page*20)`. `useEffect` reseta `currentPage = 1` quando qualquer filtro muda. Render usa janela deslizante de 5 páginas em torno da página corrente.

### 5.4 KPIs (`kpis` useMemo)
- `totalValue`: `SUM(total)` do filtrado.
- `totalQtyKg`: soma de `quantity` apenas onde `unit === 'kg'`.
- `totalQtyUn`: soma onde `unit === 'unidade'`.
- `count`: `filteredSales.length`.

Três cards de KPI no topo da aba Registros de Venda: **Total Vendido (R$)**, **Peso/Qtd Total** (mostra `kg` e `un` separados), **Nº de Registros**.

---

## 6. Interface (3 abas)

### 6.1 Aba `sales` — Registros de Venda (padrão)
- Barra: `SearchableSelect` de mês, dois `Popover<Calendar>` para De/Até, `<Input>` de busca, botão **Limpar**, botão **Exportar PDF** (desabilitado se vazio), botão **Nova Venda**.
- 3 KPI cards.
- **Mobile:** listagem em cards empilhados (`md:hidden`), cada card com data, cliente, material, quantidade, total e ações edit/delete.
- **Desktop:** `<Table>` (`hidden md:table`) 8 colunas — Data, Material, Cliente, Qtd, Preço Unit., Total, Romaneio, Ações.
- Paginação inferior (janela de 5 páginas + Prev/Next).
- Dialog **Registrar venda** (`sm:max-w-lg`): `SearchableSelect` de cliente → `SearchableSelect` de material (filtrado por `saleClientMaterials`) → Data (Popover Calendar com `minDate/maxDate` de `getDateLimits`) → Quantidade → Preço → Romaneio → Observações → Total calculado exibido em destaque.

### 6.2 Aba `clients` — Clientes de Resíduos
- Botão **Novo Cliente** (rótulo curto no mobile).
- Lista de clientes como `<Card>` clicáveis; ícone `ChevronDown/Right` indica expansão.
- Ao expandir: painel com botão **+ Material** (desabilitado se todos os materiais já estão vinculados), e a lista de preços do cliente.
  - **Mobile:** cards com material, preço/unidade e ações.
  - **Desktop:** `<Table>` (Material, Unidade, Preço, Ações).
- Dialog **Novo/Editar Cliente**: apenas nome.
- Dialog **Adicionar/Editar Material do Cliente**: `SearchableSelect` do material (filtrado) + input de preço BR.

### 6.3 Aba `materials` — Catálogo
- Cadastro de materiais (nome + unidade `kg`/`unidade`).
- Sem preço (é definido por cliente).
- **Mobile:** cards; **Desktop:** tabela (Nome, Unidade, Ações).

### 6.4 Modais de confirmação
Quatro `DeleteConfirmDialog` distintos (material, cliente, preço, venda). Nenhum uso de `window.confirm` (regra global).

---

## 7. Exportação PDF (`exportPDF`)

`jsPDF landscape A4` + `jspdf-autotable`. Fluxo:
1. Carrega logo da empresa (`companyLogoUrl`) via `Image` + `canvas.toDataURL('image/png')` com `crossOrigin='anonymous'`. Falha silenciosa cai em fallback textual `companyName`.
2. **Cabeçalho 25 mm** com retângulo cinza `#F9FAFB`, borda `#E5E7EB`, logo à esquerda (`fitWithinBox` 24×14 mm), título centralizado `"Vendas de Resíduos"`, data/hora `dd/MM/yyyy 'às' HH:mm` no rodapé esquerdo, período à direita:
   - `filterMonth !== 'all'` → `MMMM yyyy`.
   - `dateFrom && dateTo` → `dd/MM/yyyy — dd/MM/yyyy`.
   - Caso padrão → `"Todo período"`.
3. Corpo: `autoTable` com 7 colunas — Data, Material, Cliente, Qtd (com unidade), Preço Unit., Total, Romaneio.
4. Rodapé: `Total: R$ ... | Registros: N`.
5. Arquivo: `vendas-residuos-yyyy-MM-dd.pdf`. Toast "PDF exportado".

Todos os textos passam por `sanitizePdfText` para eliminar caracteres não-Latin1 (regra global do projeto para jsPDF).

---

## 8. Regras Críticas e Riscos

1. **UNIQUE `(client_id, material_id)`** em `residue_client_prices` — o front filtra os materiais já cadastrados no dialog para não violar a constraint.
2. **Snapshots `material_name`/`client_name`** em `residue_sales` — históricos não mudam ao renomear.
3. **`ON DELETE CASCADE` de `material_id`** em `residue_sales`: excluir um material do catálogo **apaga também todas as vendas históricas** ligadas a ele. ⚠ Divergência com `client_id` que usa SET NULL; considerar migração para SET NULL para preservar histórico financeiro.
4. **Filtro de data + mês** aplicados em série (podem se anular).
5. **`date` como `text`** — comparações `>=`/`<=` funcionam somente porque o formato é ISO `yyyy-MM-dd`. Qualquer registro fora desse padrão quebra o filtro silenciosamente.
6. **`skipPriceAutoUpdate` ref** — evita que os dois `useEffect` do formulário limpem material/preço em modo edição; depende de dois `setTimeout` empilhados (50 ms + 100 ms). Frágil; qualquer mudança nos efeitos exige revalidar.
7. **`default_price` legado** em `residue_materials` — nunca é lido pela UI, mas continua obrigatório no INSERT (`default_price: 0`).
8. **Sem paginação server-side** — toda a tabela `residue_sales` da empresa é carregada e filtrada em memória (compatível com volumes atuais, mas gargalo potencial). Não há RPC dedicada.
9. **`SearchableSelect` de material só aparece se o cliente tem preços** — se um cliente novo não possui materiais vinculados, o formulário não permite lançar venda. A aba Clientes exibe alerta.
10. **Auditoria dispara antes do sucesso da invalidação** — `logAction` roda em `onSuccess`; se a query subsequente falhar, o log permanece coerente com a operação já commitada.
11. **Ordenação padrão de vendas**: `created_at DESC` (não `date DESC`) — mostra sempre a última **entrada**, não necessariamente a última **data de venda**.
12. **Total calculado no cliente** (`qty * price`) — o servidor recebe o total pronto. Divergências de arredondamento seriam responsabilidade do frontend.

---

## 9. Integrações

- **`FaturamentoTotal.tsx`**: consome `residue_sales.total` (via RPC `get_faturamento_total_metrics`) como uma das 3 fontes de receita (Malhas + Terceirizados + Resíduos).
- **`useAuditLog`**: fornece `userName`, `userCode` e `logAction` — usados em snapshot e em todos os logs (`residue_sale_*`, `residue_material_*`, `residue_client_*`).
- **`AuditHistoryModal`**: consome os eventos gravados por este módulo em `audit_logs`.

---

## 10. Checklist de Comportamento Esperado

1. Ao trocar o cliente no formulário, o material zera automaticamente.
2. Ao escolher o material, o preço unitário é preenchido com o valor da tabela `residue_client_prices`.
3. Editar uma venda preserva o material e o preço originais (não é sobrescrito pelo auto-preenchimento).
4. INSERT permanece com o dialog aberto e limpa apenas material/qtd/preço/romaneio/obs para lançamentos em série.
5. UPDATE fecha o dialog.
6. Deleção de material ou cliente invalida também `residue_client_prices`.
7. Filtros e busca acionam reset para página 1.
8. Botão **Exportar PDF** fica desabilitado enquanto `filteredSales.length === 0`.
9. Layout mobile usa cards, desktop usa tabelas — sem scroll horizontal em nenhuma aba.
10. Autoria (`Nome #Código`) só grava no INSERT e persiste no UPDATE (não é sobrescrita).
11. Todas as datas passam por `isDateValid` (±5 anos da data atual).
12. Dialogs de exclusão exigem confirmação explícita — não há `window.confirm`.

---

## 11. Ganchos Futuros (não implementado)

Migração para RPC seguindo o padrão consolidado do projeto (ex.: `rpcInvoices.md`, `rpcstockMalha.md`):
- `get_residue_sales_bootstrap` — companies + materials + clients + prices + available_months + KPIs globais.
- `get_residue_sales_list` — paginação server-side com filtros aplicados no banco (elimina array global no cliente).
- `save_residue_sale(p_id?, p_payload, p_author_name, p_author_code)` — atômica com validações espelho do frontend e snapshots server-side.
- `save_residue_client_price` respeitando UNIQUE server-side com `{ok, already, conflict}`.
- `get_residue_sales_export_payload` — payload pronto para PDF (dispensa carregar todas as vendas no cliente).
- Migrar `residue_sales.material_id` de `ON DELETE CASCADE` para `SET NULL` para preservar histórico.
- Migrar `residue_sales.date` de `text` para `date` (requer conversão cuidadosa dos registros existentes).

Todas SECURITY DEFINER, `search_path = public`, com `v_caller := get_user_company_id()` + `RAISE 'Acesso negado'` e `GRANT anon/authenticated/service_role`.

---
*Última atualização: 19/07/2026 (Brasília) — documentação apenas, sem alterações de código.*