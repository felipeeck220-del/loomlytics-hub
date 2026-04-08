# 🧵 ESTOQUEMALHAS.MD — Controle de Estoque de Malha

> **⚠️ INSTRUÇÕES:**
> Este arquivo documenta a implementação da Tela de Estoque de Malha.
> Nenhuma migration é necessária — todos os dados já existem nas tabelas `productions`, `invoices` e `invoice_items`.

---

## 📌 Conceito

O **Estoque de Malha** mostra quanto de malha produzida ainda está na facção (não foi entregue ao cliente).

### Fórmula de Cálculo

```
Estoque = Malha Produzida − Malha Entregue (NFs de saída)
```

| Componente         | Tabela fonte                       | Filtros                                                     | Agrupamento                    |
|--------------------|------------------------------------|-------------------------------------------------------------|--------------------------------|
| **Malha Produzida**| `productions` JOIN `articles`      | `articles.client_id IS NOT NULL`                            | `client_id` (do artigo) + `article_id` |
| **Malha Entregue** | `invoice_items` JOIN `invoices`    | `invoices.type = 'saida'` AND `status ≠ 'cancelada'`       | `client_id` (da invoice) + `article_id` (do item) |

> **Importante:** Apenas NFs de saída do tipo `saida` contam como entrega de malha.
> NFs do tipo `venda_fio` NÃO entram nesse cálculo (são fios, não malha).

---

## 📍 Localização na UI

- Aba **"Estoque Malha"** dentro da página de Notas Fiscais (`/:slug/invoices`)
- Posição: após a aba "Saldo Global" e antes de "Fio Terceiros"
- Ordem das abas: `Entrada` → `Saída` → `Saldo Fios` → `Saldo Global` → `Estoque Malha` → `Fio Terceiros` → `Tipos de Fio`

---

## 📊 Queries Necessárias

### 1. Malha Produzida (por cliente + artigo)
```
productions (weight_kg, rolls_produced)
  → articles (client_id, name) via article_id
  → filtro: articles.client_id IS NOT NULL
  → agrupado por articles.client_id + productions.article_id
  → soma weight_kg e rolls_produced
```

**Dados disponíveis no projeto:**
- `productions` já é carregado no `useCompanyData` (campo `productions`)
- `articles` já é carregado (campo `articles`)
- O JOIN é feito no frontend usando `article_id`

### 2. Malha Entregue (por cliente + artigo)
```
invoices (type='saida', status≠'cancelada')
  → invoice_items (article_id, weight_kg, quantity_rolls)
  → agrupado por invoices.client_id + invoice_items.article_id
  → soma weight_kg e quantity_rolls
```

**Dados disponíveis no projeto:**
- `invoices` já é carregado (campo `invoices`)
- `invoice_items` já é carregado (campo `invoiceItems`)
- O JOIN é feito no frontend usando `invoice_id`

### 3. Junção no frontend
```typescript
// Chave: `${client_id}_${article_id}`
// Para cada chave:
//   produzido_kg = soma productions.weight_kg
//   produzido_rolos = soma productions.rolls_produced
//   entregue_kg = soma invoice_items.weight_kg (de NFs saida não canceladas)
//   entregue_rolos = soma invoice_items.quantity_rolls
//   estoque_kg = produzido_kg - entregue_kg
//   estoque_rolos = produzido_rolos - entregue_rolos
```

---

## 🖥️ Layout da Tela

### KPIs no topo (4 cards):

| KPI                | Valor                                  | Ícone sugerido |
|--------------------|----------------------------------------|----------------|
| Total Produzido    | Soma de toda malha produzida (kg)      | `Package`      |
| Total Entregue     | Soma de toda malha entregue (kg)       | `Truck`        |
| Em Estoque         | Produzido - Entregue (kg)              | `Warehouse`    |
| Rolos em Estoque   | Rolos produzidos - Rolos entregues     | `Layers`       |

### Filtros:

| Filtro       | Tipo     | Opções                                           |
|--------------|----------|--------------------------------------------------|
| **Período**  | Select   | `Todos`, meses do ano (YYYY-MM)                  |
| **Cliente**  | Select   | `Todos`, lista de clientes da empresa             |
| **Artigo**   | Select   | `Todos`, lista de artigos da empresa              |

- Botão "Limpar filtros" aparece quando algum filtro está ativo
- Filtro de período filtra `productions.date` e `invoices.issue_date`

### Tabela agrupada por cliente (Collapsible):

```
▼ Sul Brasil
  ┌─────────────────┬──────────────┬──────────┬──────────────┬──────────┬──────────────┬──────────┐
  │ Artigo           │ Produzido kg │ Rolos    │ Entregue kg  │ Rolos    │ Estoque kg   │ Rolos    │
  ├─────────────────┼──────────────┼──────────┼──────────────┼──────────┼──────────────┼──────────┤
  │ Malha Piquet     │ 1.200,0 kg   │ 48       │ 800,0 kg     │ 32       │ 400,0 kg     │ 16       │
  │ Ribana 1x1      │ 500,0 kg     │ 25       │ 500,0 kg     │ 25       │ 0,0 kg       │ 0        │
  │ Moletom Pesado   │ 300,0 kg     │ 10       │ 100,0 kg     │ 3        │ 200,0 kg     │ 7        │
  ├─────────────────┼──────────────┼──────────┼──────────────┼──────────┼──────────────┼──────────┤
  │ TOTAL            │ 2.000,0 kg   │ 83       │ 1.400,0 kg   │ 60       │ 600,0 kg     │ 23       │
  └─────────────────┴──────────────┴──────────┴──────────────┴──────────┴──────────────┴──────────┘

▶ Outro Cliente (clique para expandir)
```

### Indicadores visuais:
- **Estoque positivo** → cor normal (`text-foreground`) — malha ainda na facção
- **Estoque negativo** → badge vermelho (`text-destructive`) — entregou mais do que produziu (possível erro)
- **Estoque zero** → cor muted (`text-muted-foreground`) — tudo entregue

---

## 🔧 Implementação Frontend

### Dados já disponíveis via `useCompanyData`:
- `productions` — registros de produção com `article_id`, `weight_kg`, `rolls_produced`
- `articles` — artigos com `client_id`, `name`
- `clients` — clientes com `id`, `name`
- `invoices` — NFs com `type`, `status`, `client_id`, `issue_date`
- `invoiceItems` — itens de NF com `invoice_id`, `article_id`, `weight_kg`, `quantity_rolls`

### Nenhuma query adicional necessária
Todos os dados já são carregados na página Invoices.

### Estrutura do código

```typescript
// Estado dos filtros
const [estoqueClient, setEstoqueClient] = useState('all');
const [estoqueArticle, setEstoqueArticle] = useState('all');
const [estoqueMonth, setEstoqueMonth] = useState('all');

// Cálculo com useMemo
const malhaEstoque = useMemo(() => {
  const map = new Map<string, Map<string, {
    producedKg: number;
    producedRolls: number;
    deliveredKg: number;
    deliveredRolls: number;
  }>>();

  const matchMonth = (date: string) => estoqueMonth === 'all' || date.startsWith(estoqueMonth);

  // 1. Somar produção por client_id + article_id
  for (const prod of productions) {
    if (!matchMonth(prod.date)) continue;
    const art = articles.find(a => a.id === prod.article_id);
    if (!art || !art.client_id) continue;

    if (!map.has(art.client_id)) map.set(art.client_id, new Map());
    const artMap = map.get(art.client_id)!;
    if (!artMap.has(prod.article_id)) {
      artMap.set(prod.article_id, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0 });
    }
    const entry = artMap.get(prod.article_id)!;
    entry.producedKg += Number(prod.weight_kg);
    entry.producedRolls += Number(prod.rolls_produced);
  }

  // 2. Somar entregas (NFs de saída não canceladas)
  const saidaInvoices = invoices.filter(inv =>
    inv.type === 'saida' && inv.status !== 'cancelada' && matchMonth(inv.issue_date)
  );
  for (const inv of saidaInvoices) {
    const items = invoiceItems.filter(it => it.invoice_id === inv.id);
    for (const item of items) {
      if (!item.article_id || !inv.client_id) continue;

      if (!map.has(inv.client_id)) map.set(inv.client_id, new Map());
      const artMap = map.get(inv.client_id)!;
      if (!artMap.has(item.article_id)) {
        artMap.set(item.article_id, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0 });
      }
      const entry = artMap.get(item.article_id)!;
      entry.deliveredKg += Number(item.weight_kg);
      entry.deliveredRolls += Number(item.quantity_rolls || 0);
    }
  }

  // 3. Montar resultado agrupado
  const result: Array<{
    clientId: string;
    clientName: string;
    articles: Array<{
      articleId: string;
      articleName: string;
      producedKg: number;
      producedRolls: number;
      deliveredKg: number;
      deliveredRolls: number;
      stockKg: number;
      stockRolls: number;
    }>;
    totalProducedKg: number;
    totalProducedRolls: number;
    totalDeliveredKg: number;
    totalDeliveredRolls: number;
    totalStockKg: number;
    totalStockRolls: number;
  }> = [];

  map.forEach((artMap, clientId) => {
    if (estoqueClient !== 'all' && clientId !== estoqueClient) return;
    const client = clients.find(c => c.id === clientId);
    const arts: typeof result[0]['articles'] = [];
    let tProdKg = 0, tProdRolls = 0, tDelKg = 0, tDelRolls = 0;

    artMap.forEach((vals, articleId) => {
      if (estoqueArticle !== 'all' && articleId !== estoqueArticle) return;
      const article = articles.find(a => a.id === articleId);
      const stockKg = vals.producedKg - vals.deliveredKg;
      const stockRolls = vals.producedRolls - vals.deliveredRolls;
      arts.push({
        articleId,
        articleName: article?.name || 'Artigo removido',
        producedKg: vals.producedKg,
        producedRolls: vals.producedRolls,
        deliveredKg: vals.deliveredKg,
        deliveredRolls: vals.deliveredRolls,
        stockKg,
        stockRolls,
      });
      tProdKg += vals.producedKg;
      tProdRolls += vals.producedRolls;
      tDelKg += vals.deliveredKg;
      tDelRolls += vals.deliveredRolls;
    });

    if (arts.length > 0) {
      result.push({
        clientId,
        clientName: client?.name || 'Cliente removido',
        articles: arts.sort((a, b) => a.articleName.localeCompare(b.articleName)),
        totalProducedKg: tProdKg,
        totalProducedRolls: tProdRolls,
        totalDeliveredKg: tDelKg,
        totalDeliveredRolls: tDelRolls,
        totalStockKg: tProdKg - tDelKg,
        totalStockRolls: tProdRolls - tDelRolls,
      });
    }
  });

  return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
}, [productions, invoices, invoiceItems, articles, clients, estoqueClient, estoqueArticle, estoqueMonth]);
```

### KPIs globais
```typescript
const estoqueKpis = useMemo(() => {
  return malhaEstoque.reduce((acc, g) => ({
    producedKg: acc.producedKg + g.totalProducedKg,
    deliveredKg: acc.deliveredKg + g.totalDeliveredKg,
    stockKg: acc.stockKg + g.totalStockKg,
    stockRolls: acc.stockRolls + g.totalStockRolls,
  }), { producedKg: 0, deliveredKg: 0, stockKg: 0, stockRolls: 0 });
}, [malhaEstoque]);
```

---

## 🔗 Dependências

```
┌─────────────────────────────────┐
│  productions (já existe)         │
│  → weight_kg, rolls_produced     │
│  → article_id → articles         │
│     → client_id                  │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Estoque de Malha (frontend)     │
│  Produzido - Entregue = Estoque  │
└──────────▲──────────────────────┘
           │
┌──────────┴──────────────────────┐
│  invoices (type='saida')         │
│  → invoice_items                 │
│     → article_id, weight_kg      │
│  → client_id                     │
└─────────────────────────────────┘
```

### Sem migrations necessárias
- Todas as tabelas e colunas já existem
- Todos os dados já são carregados na página Invoices via `useCompanyData`
- Implementação é 100% frontend

---

## 🎨 Componentes UI

| Componente | Uso |
|---|---|
| `Card` + `CardContent` | KPIs no topo |
| `Select` | Filtros (período, cliente, artigo) |
| `Collapsible` | Agrupar por cliente (expandir/colapsar) |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | Dados internos |
| `Badge` | Indicar estoque negativo |
| `Button` | Limpar filtros |
| `formatWeight` de `@/lib/formatters` | Formatar valores em kg |
| `formatNumber` de `@/lib/formatters` | Formatar contagem de rolos |

---

## 📐 Padrão Visual

Seguir o padrão já estabelecido na aba **Saldo de Fios**:
- KPIs: 4 cards em grid `grid-cols-2 sm:grid-cols-4`
- Filtros: dentro de um Card com flex-wrap
- Collapsible: Card com trigger mostrando nome do cliente + totais
- Tabela: componente `Table` do shadcn/ui
- Cores: tokens semânticos (`text-foreground`, `text-destructive`, `text-muted-foreground`, `text-success`)
- Responsivo: cards empilhados em mobile, tabela com scroll horizontal

---

## 🔐 Permissões

| Role       | Acesso ao Estoque de Malha |
|------------|---------------------------|
| `admin`    | Visualização completa     |
| `lider`    | Visualização completa     |
| `mecanico` | Sem acesso                |
| `revisador`| Sem acesso                |

Herda as mesmas permissões da página de Notas Fiscais (key `invoices` no `enabled_nav_items`).

---

## 📋 Checklist de Implementação

- [ ] Adicionar aba "Estoque Malha" na página Invoices (após "Saldo Fios")
- [ ] Criar estados de filtro (`estoqueClient`, `estoqueArticle`, `estoqueMonth`)
- [ ] Implementar `useMemo` para calcular `malhaEstoque` (produzido − entregue)
- [ ] Implementar `useMemo` para KPIs globais (`estoqueKpis`)
- [ ] Renderizar 4 KPIs no topo (Produzido, Entregue, Em Estoque kg, Em Estoque rolos)
- [ ] Renderizar filtros (período, cliente, artigo) com botão limpar
- [ ] Renderizar tabela agrupada por cliente usando `Collapsible`
- [ ] Linha de TOTAL por cliente (negrito)
- [ ] Indicadores visuais: positivo (normal), negativo (destructive), zero (muted)
- [ ] Estado vazio: mensagem orientando registrar produção e NFs de saída
- [ ] Testar com dados reais
- [ ] Validar responsividade em mobile

---

## 🔮 Futuro: Integração com Fechamento Mensal

Esta aba alimentará a seção **"Estoque de Malha"** no PDF de Fechamento Mensal:
- Resumo por cliente: rolos + kg em estoque
- Comparativo com mês anterior (quando implementado)
- Alerta de estoque negativo no relatório

---

*Documento criado em: 03/04/2026*
*Status: ✅ IMPLEMENTADO — Aba "Estoque Malha" funcional na página Invoices.*
