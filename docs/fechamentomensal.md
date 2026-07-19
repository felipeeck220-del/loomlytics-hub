# 📊 Fechamento Mensal — Documentação Técnica Completa

> **Status:** 🚧 Em teste (badge âmbar no sidebar) · **Arquivo:** `src/pages/Fechamento.tsx` (~1.005 linhas) · **Rota:** `/:slug/fechamento` · **Chave `enabled_nav_items`:** `fechamento` · **Acesso:** apenas `admin` · **Última revisão:** 19/07/2026 (Brasília)

Documento com 100% de aderência ao código atual: propósito, banco de dados consumido, carregamento, cálculos por seção, agrupamentos, UI, exportação PDF e riscos. Fonte de verdade para qualquer refactor (inclusive migração para RPC).

---

## 1. Propósito

Consolidar em um único relatório mensal:

- Balanço de fio (compra, consumo, estoque, venda).
- Produção interna (kg + rolos).
- Estoque de malha por cliente/artigo (produzido − entregue).
- Receitas próprias por cliente + artigo.
- Receitas e prejuízos de terceirizados por cliente + artigo + malharia.
- Vendas de fio (NF `venda_fio`).
- Vendas de resíduos.
- Estoque de fio nas facções.
- Faturamento total (soma consolidada).

Substitui o XLSX manual de fechamento. Módulo 100% leitura — nenhuma tabela nova é criada.

---

## 2. Permissões e navegação

- Item de menu **"Fechamento"** (ícone `FileSpreadsheet`) posicionado entre "Relatórios" e "Configurações".
- Visível apenas quando `enabled_nav_items` contém `"fechamento"` e o usuário tem role `admin`.
- RLS de todas as tabelas usa `get_user_company_id()` — isolamento multi-tenant automático.

---

## 3. Banco de dados consumido (somente leitura)

| Tabela | Uso |
|---|---|
| `invoices` | Cabeçalho NF (`type` in `entrada`/`venda_fio`/`saida`), `issue_date` (text `yyyy-MM-dd`), `status` (linhas `cancelada` descartadas), `client_name`. |
| `invoice_items` | Peso, rolos, `value_per_kg`, `subtotal`, `yarn_type_id/name`, `article_id/name`. Ligados via `invoice_id`. |
| `productions` | `date`, `weight_kg`, `rolls_produced`, `revenue`, `article_id/name`. |
| `articles` | `client_id/name`, `yarn_type_id`, `value_per_kg` de referência. |
| `yarn_types` | Catálogo (id + nome). |
| `outsource_productions` | `weight_kg`, `rolls`, `client_value_per_kg`, `outsource_value_per_kg`, `total_revenue/cost/profit`, snapshots `client_name`, `article_name`, `outsource_company_name`. |
| `outsource_companies` | Fallback de nome. |
| `outsource_yarn_stock` | Filtrado por `outsource_company_id + yarn_type_id + reference_month`. **Único read já filtrado por `reference_month = selectedMonth`.** |
| `residue_sales` | `date`, `client_name`, `material_name`, `quantity`, `unit`, `unit_price`, `total`. |
| `companies` | Buscado só no PDF para `logo_url` e `name`. |

---

## 4. Arquitetura do arquivo

```
src/pages/Fechamento.tsx
├── Utilitários  ............................  L1–L50
│   ├── monthNames + fmtMonth ("Janeiro/2026")
│   ├── normalizeStr + isSulBrasil (lower, sem acento, sem espaço extra)
│   ├── sb(table)  = supabase.from as any
│   ├── fetchAll(table, companyId, orderCol) — paginação em blocos de 1000
│   ├── isInMonth(date, "yyyy-MM") — startsWith
│   └── isUpToMonth(date, "yyyy-MM") — date <= "yyyy-MM-31" (comparação lexicográfica)
│
├── Componente Fechamento  ..................  L52+
│   ├── Estado (11 hooks): selectedMonth (default hoje), loading, loaded, exporting,
│   │   invoices, invoiceItems, productions, articles, yarnTypes,
│   │   outsourceProductions, outsourceCompanies, yarnStock, residueSales
│   │
│   ├── loadData()  .........................  L72–L101
│   │   9 fetches paralelos via Promise.all; invoices filtradas por status ≠ cancelada;
│   │   outsource_yarn_stock é o único NÃO paginado — filtrado por reference_month.
│   │
│   ├── Maps derivados (useMemo): invoiceMap, articleMap, yarnTypeMap,
│   │   outsourceCompanyMap, prevMonth (via date-fns).
│   │
│   ├── Helpers (useCallback):
│   │   sumItemsWeight(type, upToMonth)         — soma acumulada
│   │   sumItemsWeightMonth(type, month)        — soma somente do mês
│   │   sumConsumption(upToMonth)               — soma acumulada de productions cujo
│   │                                             article tem yarn_type_id
│   │
│   ├── section1..section10  ................  L175–L396  (10 blocos memoizados)
│   ├── handleExportPDF()  ..................  L401–L715  (jsPDF + autoTable, 10 páginas)
│   ├── SectionCard()  ......................  L718
│   └── JSX (controles + 10 SectionCards)  ... L727–L1005
```

Nenhum uso de `useSharedCompanyData` — a página busca tudo diretamente do Supabase para permitir carregar sob demanda apenas quando o usuário clicar em "Carregar Dados".

---

## 5. Fluxo de carregamento

1. Abertura → `loaded=false` → card "Selecione o mês e clique em Carregar Dados".
2. Usuário escolhe `<input type="month">`; qualquer mudança **reseta `loaded`** para forçar novo fetch.
3. Clique em **Carregar Dados** dispara `loadData()`:
   - 9 chamadas em paralelo via `Promise.all`.
   - `fetchAll(...)` pagina em blocos de 1000 linhas (`.range(from, from + 999)`), ordenando por `orderCol` ASC + `id` ASC para estabilidade.
   - Faturas canceladas removidas somente no cliente (`status !== 'cancelada'`).
   - Toast de erro genérico em exceção.
4. Após sucesso, `loaded=true` habilita o botão **Exportar PDF** e renderiza as 10 seções.

---

## 6. Seções — regras e fórmulas (aderente ao código)

Todas as datas são strings `yyyy-MM-dd`. `isUpToMonth` usa o truque `date <= "yyyy-MM-31"` (funciona lexicograficamente mesmo em meses com 28/30 dias).

### Seção 1 — FECHAMENTO KG

| Campo | Fórmula |
|---|---|
| `estoqueInicial` | `sumItemsWeight('entrada', prevMonth) − sumConsumption(prevMonth) − sumItemsWeight('venda_fio', prevMonth)` |
| `compraMes` | `sumItemsWeightMonth('entrada', selectedMonth)` |
| `estoqueAtual` | `sumItemsWeight('entrada', selectedMonth) − sumConsumption(selectedMonth) − sumItemsWeight('venda_fio', selectedMonth)` |
| `producaoMes` | Σ `productions.weight_kg` no mês |
| `rolosMes` | Σ `productions.rolls_produced` no mês |
| `vendasFioMes` | `sumItemsWeightMonth('venda_fio', selectedMonth)` |

`prevMonth` = `new Date(y, m-2, 1)` → `format 'yyyy-MM'`.

### Seção 2 — SALDO DE FIOS POR TIPO

Para cada `yarn_types`:
- `compraMes/compraTotal` — items de NF `entrada` filtrados por `yarn_type_id`.
- `vendasMes/vendasTotal` — items de NF `venda_fio`.
- `consumoTotal` — production cujo `articleMap.get(article_id).yarn_type_id === yt.id` (acumulado).
- `estoque = compraTotal − consumoTotal − vendasTotal`.

Linha exibida somente se `compraMes || estoque || vendasMes`.

### Seção 3 — ESTOQUE DE MALHA (somente cliente "Sul Brasil")

> ⚠️ Regra hard-coded: `isSulBrasil()` normaliza a string e compara com `"sul brasil"`. Demais clientes são descartados.

- `prodMap[article_id]` — Σ `weight_kg` + Σ `rolls_produced` de productions cujo artigo pertence a Sul Brasil (acumulado).
- `delivMap[article_id]` — Σ `weight_kg` + Σ `quantity_rolls` de `invoice_items` cuja NF é `saida` e cujo artigo/NF é Sul Brasil (checa `article.client_name` e depois `invoice.client_name`).
- Estoque = produzido − entregue (kg e rolos).
- Agrupamento por `client_id` (fallback `sul-brasil`).
- Grupos com pelo menos 1 artigo `stockKg !== 0` são retornados.

### Seção 4 — RECEITAS PRÓPRIAS (cliente + artigo)

`productions` do mês. Chave: `${client_id ?? clientName}::${article_id ?? articleName}`. Acumula `kg` e `revenue`. `valuePerKg` exibido é **recalculado** como `revenue / kg` (média praticada), com fallback para `article.value_per_kg` quando `kg === 0`. Ordena por cliente → artigo.

### Seções 5 e 6 — RECEITAS / PREJUÍZOS DE TERCEIROS

`outsource_productions` do mês. Chave: `${clientName}::${articleName}::${outsourceName}` (nome da malharia usa snapshot `outsource_company_name` com fallback via `outsourceCompanyMap`).

Cada lançamento vai para `profitGroups` ou `lossGroups` com base no **sinal de `total_profit` do próprio lançamento** (`profit < 0 → loss`). Portanto uma mesma tupla pode aparecer nas duas seções se houver lançamentos com sinais opostos no mês.

Cada grupo agrega `kg`, `revenue`, `profit`. `valuePerKg` exibido = `revenue / kg` (média). Ordenação: cliente → artigo → malharia.

### Seção 7 — RESÍDUOS (cliente + material)

`residue_sales` do mês, agrupado por `${clientName}::${materialName}`. Acumula `qty` e `total`. `unitPrice` exibido = `total / qty`. Unidade herdada do primeiro registro. Ordena por cliente → material.

### Seção 8 — VENDA DE FIO

Uma linha por `invoice_item` de NF `venda_fio` no mês (sem agregação): cliente da NF, nome do fio do item, kg, `value_per_kg`, `subtotal`. Ordem = ordem de fetch (`issue_date ASC` + `id ASC`).

### Seção 9 — ESTOQUE FIO EM TERCEIROS

`outsource_yarn_stock` já filtrado por `reference_month = selectedMonth`. Agrupa por `outsource_company_id`, nome via `outsourceCompanyMap` (fallback `"Desconhecido"`). Cada item guarda `yarnName` (via `yarnTypeMap`) e `kg`.

### Seção 10 — FATURAMENTO TOTAL

```
receitaPropria    = Σ section4.revenue
receitaTerceiros  = Σ section5.profit    ← apenas LUCRO dos positivos
prejuizoTerceiros = Σ section6.profit    ← valor negativo (já com sinal)
receitaResiduos   = Σ section7.total
vendaFio          = Σ section8.total
total             = soma dos 5 (o prejuízo entra somando porque já é negativo)
```

> ⚠️ Assimetria intencional: em Terceiros a soma usa **lucro** (não receita bruta); em Receitas Próprias soma **revenue** (bruto). Preservar em qualquer refactor.

---

## 7. Interface (JSX)

### Cabeçalho e controles

```
📊 Fechamento Mensal
Relatório consolidado de operações e faturamento

[input month] [Carregar Dados / Atualizar] [Exportar PDF] (só após loaded)
```
- `Loader2` animado em ambos os botões durante `loading` / `exporting`.
- `flex-wrap` garante quebra no mobile.

### `SectionCard`

Wrapper `Card + CardHeader (título) + CardContent (conteúdo)` com `shadow-material`.

### Renderização por seção

- **1 & 10:** linhas `flex justify-between`, bold nos totais, `text-destructive` para prejuízo.
- **2, 4, 5, 6, 7, 8:** `Table` shadcn com cabeçalho, corpo iterado e linha `TOTAL` `border-t-2 font-bold`. Estoque negativo em `text-destructive`. Receitas em `text-success`.
- **3 & 9:** `Collapsible` por cliente/facção; 3 fechado por padrão, 9 aberto (`defaultOpen`).
- Empty states: mensagem `text-muted-foreground` "Nenhum ... neste mês".
- Valores numéricos em `font-mono`; formatação via `formatWeight`, `formatCurrency`, `formatNumber` (locale BR, 2 casas, ponto de milhar).

---

## 8. Exportação PDF (`handleExportPDF`)

- Import dinâmico de `jspdf` e `jspdf-autotable`.
- A4 retrato, margem 15mm.
- Paleta: fundo `#F9FAFB`, borda `#E5E7EB`, texto `#111827` / `#4B5563`.
- **Logo:** busca `companies.logo_url` + `name`, carrega via `Image` com `crossOrigin='anonymous'`, desenha em `<canvas>` e converte para PNG dataURL. `fitWithinBox(w, h, 24, 14)` mantém proporção.
- **`addHeader(title, y)`** — cabeçalho 25mm com fundo cinza, logo à esquerda, data/hora `dd/MM/yyyy 'às' HH:mm` embaixo, título centralizado, período à direita. Devolve `y` inicial da tabela.
- **`tableOpts`** — fonte 8pt, `cellPadding: 2`, `headStyles` cinza escuro com texto branco.
- **Páginas** (sempre nesta ordem, uma por seção, sem paginação condicional):
  1. `FECHAMENTO KG` — tabela vertical Descrição/Valor com bold em Produção/Rolos.
  2. `SALDO DE FIOS` — linha TOTAL em bold.
  3. `ESTOQUE DE MALHA` — expande grupos em linhas Cliente/Artigo (sem TOTAL global).
  4. `RECEITAS PRÓPRIAS` — TOTAL com peso e faturamento.
  5. `RECEITAS DE TERCEIROS` — fallback "Nenhuma receita de terceiros neste mês".
  6. `PREJUÍZOS DE TERCEIROS` — fallback equivalente.
  7. `RECEITAS DIVERSAS (RESÍDUOS)` — coluna "Lucro (R$)".
  8. `VENDA DE FIO`.
  9. `ESTOQUE FIO EM TERCEIROS` — inclui linha `TOTAL GERAL`.
  10. `FATURAMENTO TOTAL` — última linha em bold 10pt; valor de prejuízos em vermelho (`RGB 220,38,38`).
- **Nome:** `Fechamento_{yyyy-MM}_{Nome_Empresa}.pdf` (espaços → `_`).
- Todos os textos passam por `sanitizePdfText()`.

---

## 9. Riscos e pontos frágeis

1. **Volume no cliente.** `fetchAll` traz `invoices`, `invoice_items`, `productions`, `articles`, `residue_sales`, `outsource_productions` inteiros — sem filtro por período no servidor. TTFI cresce linearmente com o histórico.
2. **Sem RPC.** Cálculos 100% em JS; divergências com Faturamento Total, StockMalha ou Invoices precisam ser rastreadas aqui.
3. **`isUpToMonth` lexicográfico.** Depende de `date` ser exatamente `yyyy-MM-dd` (text). Migração para `date` real quebra o helper.
4. **Regra hard-coded "Sul Brasil"** (Seção 3) — outros clientes ficam invisíveis mesmo tendo estoque.
5. **Cancelamento aplicado só a `invoices`, não a `invoice_items`.** Itens sobreviventes que apontam para NF descartada são ignorados via `invoiceMap.get` retornando `undefined` (`if (!inv) return`). Basta um bug removendo esse guard para contaminar totais.
6. **`outsource_yarn_stock` filtrado por `reference_month`.** Ao trocar o mês, `setLoaded(false)` protege contra visualizar dados do mês anterior antes do próximo "Atualizar".
7. **Seção 6 usa `total_profit` já negativo.** Se algum dia o schema permitir `total_profit` positivo em prejuízo (ex.: correção manual), a bifurcação profit/loss quebra.
8. **Média `valuePerKg = revenue/kg`.** Se `kg > 0` mas `revenue == 0` (registro sem preço), a média cai para 0 e mascara o preço de tabela do artigo.
9. **PDF sem paginação inteligente.** Cada seção sempre inicia nova página, mesmo vazia (mostra apenas a mensagem de fallback). Intencional para manter numeração fixa; gera páginas "quase em branco".
10. **Sem auditoria de exportação.** Não há registro em `audit_logs` do download do fechamento.
11. **`invoiceMap` é dependência silenciosa** de `sumItemsWeight`/`sumItemsWeightMonth` (via `getItemInvoice`) — omitido do array de deps do `useCallback` porque `invoiceMap` é referência estável derivada de `invoices` (que já está listado). Trocar a estrutura exige revisar as deps.
12. **`companies` fetch dentro do PDF.** Cada exportação faz 1 request extra + carga do logo. Aceitável; facilmente memoizável.

---

## 10. Integrações e regras cruzadas

- **Faturamento Total (`/faturamento-total`):** usa RPC `get_faturamento_total_metrics`. Fechamento **não** consome essa RPC — recalcula tudo no cliente. Divergências entre os dois módulos indicam bug (geralmente no Fechamento, pelas regras das seções 3/5/6).
- **Estoque de Malha (`/estoque-malha`):** compartilha a lógica produzido − entregue. Fechamento restringe a Sul Brasil; Estoque exibe todos.
- **Saldo Global (aba em Invoices):** replica a lógica da Seção 2 para todos os clientes.
- **RLS:** todas as 9 tabelas usam políticas `authenticated` com `company_id = get_user_company_id()`. Nenhum uso de RPC `SECURITY DEFINER` neste módulo.

---

## 11. Checklist de comportamento esperado (QA visual)

- [ ] Cards vazios no primeiro load; nada é carregado até o clique.
- [ ] Trocar o mês reseta o estado `loaded`.
- [ ] Cabeçalho do PDF exibe logo da empresa (fallback: nome).
- [ ] Página 3 (UI e PDF) contém apenas artigos vinculados a "Sul Brasil".
- [ ] Estoques negativos aparecem em vermelho na UI.
- [ ] Linha `TOTAL` em todas as tabelas com corpo não-vazio.
- [ ] Seções sem dados exibem mensagem "Nenhum ... neste mês" tanto na UI quanto no PDF.
- [ ] `Faturamento Total (Seção 10)` = Σ seções conforme fórmula (prejuízo entra somando por já ser negativo).
- [ ] NFs canceladas ignoradas em todas as seções.
- [ ] Nome do PDF segue `Fechamento_{yyyy-MM}_{Nome_Empresa}.pdf`.

---

## 12. Ganchos futuros (fora do escopo deste doc)

Sem implementação — apenas orientação para planos futuros de refactor:

- `get_fechamento_bootstrap(p_month)` — payload único com as 10 seções + logo, evitando 9 selects paginados no cliente.
- `get_fechamento_export_payload(p_month)` — payload dedicado ao PDF com data-hora `America/Sao_Paulo` e strings pré-formatadas.
- Parametrizar o filtro "Sul Brasil" (Seção 3) por configuração da empresa (ex.: `enabled_nav_items.fechamento_clientes_estoque`).
- Registrar exportação em `audit_logs` (`action = 'fechamento_export'`).
- Persistir snapshots por mês (`fechamento_snapshots`) para congelar o resultado mesmo com edições históricas.

> Este documento reflete o estado do código em 19/07/2026. Qualquer alteração em `src/pages/Fechamento.tsx` deve atualizar as seções correspondentes aqui.
