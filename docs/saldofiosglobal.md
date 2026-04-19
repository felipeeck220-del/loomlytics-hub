# 🧶 SALDOFIOSGLOBAL.MD — Saldo Global de Fios por Tipo (Compra / Estoque / Vendas)

> **Status:** ✅ **Em Produção** — saldo global de fios consolidado


> **⚠️ INSTRUÇÕES:**
> Este arquivo documenta a visão **global de fios por tipo** — diferente do `saldofios.md` que é por **cliente + tipo de fio**.
> Esta visão consolida TODOS os clientes e mostra por tipo de fio: quanto foi comprado, quanto está em estoque e quanto foi vendido.
> **Nenhuma migration necessária** — todos os dados já existem nas tabelas `invoices`, `invoice_items` e `productions`.

---

## 📌 Conceito

No XLSX de fechamento mensal, existe uma seção que mostra **por tipo de fio**:

```
FIO 30/1 OE
  COMPRA DE FEVEREIRO 2026    318.149,27 kg
  ESTOQUE                      73.756,00 kg
  VENDAS                      128.105,74 kg

FIO 30/1 PENTEADO
  COMPRA DE FEVEREIRO 2026     10.764,00 kg
  ESTOQUE                         702,00 kg
  VENDAS                              - kg

FIO 30/1 MESCLA
  COMPRA DE FEVEREIRO 2026      3.013,48 kg
  ESTOQUE                       2.536,00 kg
  VENDAS                              - kg

FIO 24/1 OE
  COMPRA DE FEVEREIRO 2026     13.662,38 kg
  ESTOQUE                       4.015,00 kg
  VENDAS                       25.630,48 kg

... (para cada tipo de fio)
```

### Diferença entre as duas visões de saldo:

| Aspecto           | Saldo de Fios (saldofios.md)                     | Saldo Global de Fios (este doc)                  |
|-------------------|--------------------------------------------------|--------------------------------------------------|
| **Agrupamento**   | Por **Cliente** → Tipo de Fio                    | Por **Tipo de Fio** (todos os clientes somados)  |
| **Perspectiva**   | "Quanto fio de cada cliente eu tenho?"            | "Quanto de cada tipo de fio eu comprei/tenho/vendi?" |
| **Onde aparece**  | Aba "Saldo Fios" na página Invoices               | Seção no PDF de Fechamento Mensal + possível aba  |
| **Colunas**       | Recebido, Consumido, Vendido, Saldo               | Compra (mês), Estoque (acumulado), Vendas (mês)  |
| **Uso principal** | Controle operacional diário                       | Fechamento mensal e visão gerencial               |

---

## 📊 Fórmulas de Cálculo

### Por tipo de fio (`yarn_type_id`):

| Métrica          | Fórmula                                                                                    | Período        |
|------------------|--------------------------------------------------------------------------------------------|----------------|
| **Compra**       | `Σ invoice_items.weight_kg` onde `invoice.type = 'entrada'` AND `status ≠ 'cancelada'`     | Mês selecionado |
| **Consumido**    | `Σ productions.weight_kg` onde `article.yarn_type_id = fio`                                | Mês selecionado |
| **Vendas**       | `Σ invoice_items.weight_kg` onde `invoice.type = 'venda_fio'` AND `status ≠ 'cancelada'`   | Mês selecionado |
| **Estoque**      | Compra acumulada (todos os meses) − Consumido acumulado − Vendas acumuladas                | Acumulado       |

### Fórmula do Estoque:

```
Estoque de fio (tipo X) = 
  Σ total comprado (todas as NFs entrada de fio X, todos os meses até o mês selecionado)
  − Σ total consumido (todas as produções com artigos que usam fio X, todos os meses até o mês selecionado)
  − Σ total vendido (todas as NFs venda_fio de fio X, todos os meses até o mês selecionado)
```

> **Importante:** O Estoque é um **saldo acumulado** (desde o início dos registros até o final do mês selecionado), não apenas do mês corrente. Já Compra e Vendas são valores **do mês selecionado**.

---

## 🔧 Queries Necessárias

### 1. Compra por Tipo de Fio (mês específico)
```
invoices (type='entrada', status≠'cancelada', issue_date no mês)
  → invoice_items (yarn_type_id, weight_kg)
  → agrupado por yarn_type_id
  → soma weight_kg
```

### 2. Consumo por Tipo de Fio (mês específico)
```
productions (date no mês)
  → articles (yarn_type_id) via article_id
  → filtro: articles.yarn_type_id IS NOT NULL
  → agrupado por articles.yarn_type_id
  → soma productions.weight_kg
```

### 3. Vendas por Tipo de Fio (mês específico)
```
invoices (type='venda_fio', status≠'cancelada', issue_date no mês)
  → invoice_items (yarn_type_id, weight_kg)
  → agrupado por yarn_type_id
  → soma weight_kg
```

### 4. Estoque Acumulado por Tipo de Fio (até o mês X)
```
Para cada yarn_type_id:
  compraAcumulada = soma NFs entrada até final do mês
  consumoAcumulado = soma produções até final do mês
  vendaAcumulada = soma NFs venda_fio até final do mês
  estoque = compraAcumulada - consumoAcumulado - vendaAcumulada
```

### 5. Junção no frontend
```typescript
// Chave: yarn_type_id
// Para cada fio:
//   compraMes = soma NFs entrada do mês
//   consumoMes = soma produções do mês (opcional, para detalhe)
//   vendasMes = soma NFs venda_fio do mês
//   estoqueAcumulado = compra total - consumo total - vendas total (até o mês)
```

---

## 🖥️ Onde Aparece

### 1. PDF de Fechamento Mensal (obrigatório)

Seção dedicada: **"Saldo de Fios por Tipo"**

Layout no PDF:

```
╔═══════════════════════════════════════════════════════════════╗
║  SALDO DE FIOS — FEVEREIRO/2026                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ┌──────────────────────┬──────────────┬──────────┬──────────┐║
║  │ Tipo de Fio          │ Compra (mês) │ Estoque  │ Vendas   │║
║  ├──────────────────────┼──────────────┼──────────┼──────────┤║
║  │ FIO 30/1 OE          │ 318.149,27   │ 73.756,0 │128.105,7 │║
║  │ FIO 30/1 PENTEADO    │  10.764,00   │    702,0 │      -   │║
║  │ FIO 30/1 MESCLA      │   3.013,48   │  2.536,0 │      -   │║
║  │ FIO 24/1 OE          │  13.662,38   │  4.015,0 │ 25.630,5 │║
║  │ FIO 30/1 PA          │  26.182,65   │    725,0 │ 35.284,8 │║
║  │ FIO 75/36 PES        │   2.052,00   │      -   │      -   │║
║  │ FIO 75/144 PES PRETO │   1.008,00   │      -   │  1.008,0 │║
║  │ FIO 30/1 PAP         │       -      │ 11.577,0 │      -   │║
║  │ FIO 8/1 PA           │   9.032,55   │      -   │  3.032,6 │║
║  │ FIO 24/1 PA          │   5.825,00   │  1.560,0 │  4.103,8 │║
║  │ FIO 30/1 PP FIADO    │   6.000,00   │      -   │      -   │║
║  │ FIO 200/96 PES PRETO │     684,00   │      -   │    684,0 │║
║  │ FIO 200/96 PES       │     684,00   │      -   │    684,0 │║
║  │ FIO 150/48 PES       │   1.059,50   │      -   │      -   │║
║  │ FIO 150/144 PES PRETO│     661,20   │      -   │    661,2 │║
║  │ FIO 30/1 CARDADO     │       -      │ 14.976,0 │      -   │║
║  ├──────────────────────┼──────────────┼──────────┼──────────┤║
║  │ TOTAL                │ 398.778,03   │ 52.263,0 │199.194,6 │║
║  └──────────────────────┴──────────────┴──────────┴──────────┘║
╚═══════════════════════════════════════════════════════════════╝
```

### 2. Aba na página Invoices (opcional / futuro)

Poderia ser uma sub-visão dentro da aba "Saldo Fios" existente, com toggle:
- **Por Cliente** (visão atual) — agrupado por cliente → tipo de fio
- **Por Tipo de Fio** (nova visão) — agrupado só por tipo de fio, consolidando todos os clientes

> **Recomendação:** Implementar primeiro no PDF de Fechamento, depois avaliar se vale a aba dedicada.

---

## 🔗 Relação com o Fechamento Mensal (XLSX)

No XLSX de fechamento, a seção de Saldo de Fios se conecta diretamente com a seção de **Fechamento KG**:

```
FECHAMENTO FEVEREIRO 2026               KG
ESTOQUE INICIAL 01/02/2026         109.847,00    ← estoque final do mês anterior
COMPRA DE FIO FEVEREIRO 2026       398.778,03    ← Σ compras do mês (todas as NFs entrada)
(-) ESTOQUE FINAL                   52.263,03    ← Σ estoque de todos os fios ao final do mês
PRODUÇÃO TOTAL                     454.869,00    ← Σ produção do mês (productions.weight_kg)
ROLOS PRODUZIDOS                    21.732       ← Σ produção do mês (productions.rolls_produced)
```

### Fórmula de consistência:
```
Estoque Inicial + Compra − Estoque Final ≈ Produção Total + Vendas de Fio + Perdas
```

Ou seja:
```
109.847 + 398.778 − 52.263 = 456.362 (disponível para produção)
Produção: 454.869 + Vendas de fio: (parcial) ≈ 456.362
```

> **Nota:** A pequena diferença pode ser perda de processo, desperdício ou arredondamento.

---

## 🔧 Implementação no Frontend

### Dados já disponíveis

Todos os dados necessários já estão carregados na página Invoices:

| Dado                      | Fonte                                       | Já carregado? |
|---------------------------|---------------------------------------------|---------------|
| NFs de entrada            | `invoices` (type='entrada')                 | ✅ Sim        |
| Itens das NFs             | `invoiceItems`                              | ✅ Sim        |
| Tipos de fio              | `yarnTypes`                                 | ✅ Sim        |
| Produções                 | `productions`                               | ✅ Sim        |
| Artigos (com yarn_type_id)| `articles`                                  | ✅ Sim        |
| NFs venda_fio             | `invoices` (type='venda_fio')               | ✅ Sim        |

### useMemo para cálculo

```typescript
interface YarnTypeBalance {
  yarnTypeId: string;
  yarnTypeName: string;
  purchaseMonth: number;    // compra no mês selecionado (kg)
  consumedMonth: number;    // consumido no mês (kg) - opcional
  salesMonth: number;       // vendas no mês selecionado (kg)
  stockAccumulated: number; // estoque acumulado até o mês (kg)
}

const yarnGlobalBalance = useMemo(() => {
  const selectedMonth = filterMonth; // ex: '2026-02'
  const map = new Map<string, YarnTypeBalance>();

  // Inicializar todos os tipos de fio
  for (const yt of yarnTypes) {
    map.set(yt.id, {
      yarnTypeId: yt.id,
      yarnTypeName: yt.name,
      purchaseMonth: 0,
      consumedMonth: 0,
      salesMonth: 0,
      stockAccumulated: 0,
    });
  }

  // 1. Compra do mês (NFs entrada)
  const entradaInvoices = invoices.filter(inv =>
    inv.type === 'entrada' && inv.status !== 'cancelada'
  );
  for (const inv of entradaInvoices) {
    const isMonth = selectedMonth === 'all' || inv.issue_date.startsWith(selectedMonth);
    const items = invoiceItems.filter(it => it.invoice_id === inv.id && it.yarn_type_id);
    for (const item of items) {
      const entry = map.get(item.yarn_type_id!);
      if (!entry) continue;
      if (isMonth) entry.purchaseMonth += Number(item.weight_kg);
      // Para estoque acumulado: soma se mês <= selecionado
      if (selectedMonth === 'all' || inv.issue_date <= lastDayOfMonth(selectedMonth)) {
        entry.stockAccumulated += Number(item.weight_kg);
      }
    }
  }

  // 2. Consumo (produções com artigos vinculados a fio)
  for (const prod of productions) {
    const art = articles.find(a => a.id === prod.article_id);
    if (!art || !art.yarn_type_id) continue;
    const entry = map.get(art.yarn_type_id);
    if (!entry) continue;
    const isMonth = selectedMonth === 'all' || prod.date.startsWith(selectedMonth);
    if (isMonth) entry.consumedMonth += Number(prod.weight_kg);
    if (selectedMonth === 'all' || prod.date <= lastDayOfMonth(selectedMonth)) {
      entry.stockAccumulated -= Number(prod.weight_kg);
    }
  }

  // 3. Vendas do mês (NFs venda_fio)
  const vendaInvoices = invoices.filter(inv =>
    inv.type === 'venda_fio' && inv.status !== 'cancelada'
  );
  for (const inv of vendaInvoices) {
    const isMonth = selectedMonth === 'all' || inv.issue_date.startsWith(selectedMonth);
    const items = invoiceItems.filter(it => it.invoice_id === inv.id && it.yarn_type_id);
    for (const item of items) {
      const entry = map.get(item.yarn_type_id!);
      if (!entry) continue;
      if (isMonth) entry.salesMonth += Number(item.weight_kg);
      if (selectedMonth === 'all' || inv.issue_date <= lastDayOfMonth(selectedMonth)) {
        entry.stockAccumulated -= Number(item.weight_kg);
      }
    }
  }

  // Filtrar fios que têm alguma movimentação
  return Array.from(map.values())
    .filter(y => y.purchaseMonth > 0 || y.salesMonth > 0 || y.stockAccumulated !== 0)
    .sort((a, b) => a.yarnTypeName.localeCompare(b.yarnTypeName));
}, [invoices, invoiceItems, productions, articles, yarnTypes, filterMonth]);
```

### Função auxiliar
```typescript
function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}
```

---

## 🔗 Dependências

```
┌─────────────────────────────┐
│  invoices (type='entrada')   │─── NFs de compra de fio
│  + invoice_items             │    → yarn_type_id, weight_kg
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Saldo Global de Fios       │
│  Por yarn_type_id:           │
│    Compra = Σ NFs entrada    │
│    Consumo = Σ produção      │
│    Vendas = Σ NFs venda_fio  │
│    Estoque = acumulado       │
└──────────▲──────────────────┘
           │
┌──────────┴──────────────────┐     ┌────────────────────────────┐
│  productions + articles      │     │  invoices (type='venda_fio')│
│  → articles.yarn_type_id     │     │  + invoice_items            │
│  → soma weight_kg consumido  │     │  → yarn_type_id, weight_kg  │
└─────────────────────────────┘     └────────────────────────────┘
```

### Sem migrations necessárias
- Todas as tabelas e colunas já existem
- Todos os dados já são carregados na página Invoices
- Implementação é 100% frontend (cálculo + renderização)

---

## 📋 Checklist de Implementação

### No PDF de Fechamento Mensal:
- [x] Seção "Saldo de Fios por Tipo" como uma página do PDF
- [x] Tabela com colunas: Tipo de Fio, Compra (mês), Estoque (acumulado), Vendas (mês)
- [x] Linha de TOTAL no final
- [x] Formato pt-BR para números (1.234,56 kg)
- [x] Fios sem movimentação mas com estoque devem aparecer
- [x] Fios zerados em tudo não aparecem

### No Fechamento KG (primeira página do PDF):
- [x] Linha "COMPRA DE FIO [MÊS/ANO]" = Σ de todas as compras do mês (total da coluna Compra)
- [x] Linha "(-) ESTOQUE FINAL" = Σ de todos os estoques (total da coluna Estoque)
- [x] Linha "VENDAS DE FIO" = Σ de todas as vendas de fio (total da coluna Vendas)

### Aba na UI (futuro / opcional):
- [x] Toggle "Por Cliente / Por Tipo de Fio" na aba Saldo Fios
- [ ] Ou nova aba dedicada "Saldo Global"

---

## 🔐 Permissões

| Role       | Acesso                                   |
|------------|------------------------------------------|
| `admin`    | Visualização completa                    |
| `lider`    | Sem acesso (key `invoices` não está no `ROLE_ALLOWED_KEYS.lider`) |
| `mecanico` | Sem acesso                               |
| `revisador`| Sem acesso                               |

Herda as mesmas permissões da página de Notas Fiscais. Apenas `admin` tem acesso por padrão.

---

*Documento criado em: 03/04/2026*
*Status: ✅ IMPLEMENTADO — Aba "Saldo Global" funcional na página Invoices com KPIs, filtros e tabela.*
