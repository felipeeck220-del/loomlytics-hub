# 📊 FECHAMENTOMENSAL.MD — Fechamento Mensal Consolidado

> **⚠️ INSTRUÇÕES:**
> Este arquivo documenta a implementação completa do **Fechamento Mensal** do MalhaGest.
> O Fechamento Mensal é o relatório consolidado que reúne TODOS os dados financeiros e operacionais de um mês.
> É o documento mais importante da empresa — equivalente ao que é feito hoje manualmente no XLSX.
> **Nenhuma migration necessária** — todos os dados já existem nas tabelas do sistema.

---

## 📌 Conceito

O **Fechamento Mensal** é um relatório consolidado que resume toda a operação da malharia em um mês:
- Quanto fio comprou, consumiu e tem em estoque
- Quanto produziu (kg e rolos)
- Quanto faturou (produção própria + terceiros + resíduos + venda de fio)
- Quanto tem de malha em estoque (produzida e não entregue)
- Quanto de fio está em cada facção terceirizada
- Lucros e prejuízos com terceirizados

### Referência: XLSX de fechamento (modelo atual)

O XLSX que a empresa usa hoje contém estas seções (cada uma em uma "página"):

```
Página 1: FECHAMENTO KG (estoque inicial + compra − estoque final = produção)
Página 2: SALDO DE FIOS POR TIPO (compra / estoque / vendas por tipo de fio)
Página 3: ESTOQUE DE MALHA (malha produzida − entregue = em estoque, por cliente/artigo)
Página 4: RECEITAS PRÓPRIAS (produção interna por cliente: kg × valor/kg)
Página 5: RECEITAS DE TERCEIROS (produção terceirizada com lucro positivo)
Página 6: PREJUÍZOS DE TERCEIROS (produção terceirizada com lucro negativo)
Página 7: RECEITAS DIVERSAS — RESÍDUOS (vendas de papelão, plástico, etc.)
Página 8: VENDA DE FIO (NFs tipo venda_fio)
Página 9: ESTOQUE DE FIO EM TERCEIROS (fio em facções terceirizadas)
Página 10: FATURAMENTO TOTAL (consolidação de todas as receitas)
```

---

## 📍 Localização no Sistema

### Nova página: `/:slug/fechamento`

- **Rota:** `/:slug/fechamento`
- **Sidebar:** Novo item **"Fechamento"** com ícone `FileSpreadsheet`
- **Key no enabled_nav_items:** `fechamento`
- **Acesso:** Apenas `admin`
- **Posição na sidebar:** Após "Relatórios" e antes de "Configurações"

---

## 🖥️ Layout da Página

### Cabeçalho
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Fechamento Mensal                                           │
│  Relatório consolidado de operações e faturamento               │
└─────────────────────────────────────────────────────────────────┘
```

### Controles (topo)

| Controle         | Tipo           | Descrição                                     |
|------------------|----------------|-----------------------------------------------|
| **Mês/Ano**      | Input month    | Seletor de mês (formato `YYYY-MM`)            |
| **Exportar PDF** | Button         | Gera o PDF completo multi-página              |

### Seções da Página (preview visual)

Cada seção é renderizada como um `Card` na página, mostrando os dados consolidados do mês selecionado. O usuário pode visualizar tudo antes de exportar o PDF.

---

## 📄 Seção 1: FECHAMENTO KG

### Dados do XLSX de referência:
```
FECHAMENTO FEVEREIRO 2026                      KG
ESTOQUE INICIAL 01/02/2026               109.847,00
COMPRA DE FIO FEVEREIRO 2026              398.778,03
(-) ESTOQUE FINAL                          52.263,03
PRODUÇÃO TOTAL                            454.869,00
ROLOS PRODUZIDOS                            21.732
```

### Cálculos:

| Linha                     | Fórmula                                                               | Fonte                                |
|---------------------------|-----------------------------------------------------------------------|--------------------------------------|
| **Estoque Inicial**       | Estoque final do mês ANTERIOR                                        | Cálculo: Compra acum. − Consumo acum. − Vendas acum. até mês anterior |
| **Compra de Fio**         | `Σ invoice_items.weight_kg` de NFs tipo `entrada`, status ≠ `cancelada`, no mês | `invoices` + `invoice_items`         |
| **(-) Estoque Final**     | Estoque acumulado até o final do mês selecionado                      | Compra total − Consumo total − Vendas total até o mês |
| **Produção Total (kg)**   | `Σ productions.weight_kg` no mês                                     | `productions`                        |
| **Rolos Produzidos**      | `Σ productions.rolls_produced` no mês                                | `productions`                        |
| **Vendas de Fio**         | `Σ invoice_items.weight_kg` de NFs tipo `venda_fio`, status ≠ `cancelada`, no mês | `invoices` + `invoice_items`     |

### Fórmula de consistência:
```
Estoque Inicial + Compra − Estoque Final ≈ Produção Total + Vendas de Fio + Perdas
```

### Layout no Card:
```
┌─────────────────────────────────────────────────────┐
│  FECHAMENTO KG — FEVEREIRO/2026                     │
│                                                     │
│  Estoque Inicial (01/02/2026)      109.847,00 kg    │
│  Compra de Fio Fevereiro/2026      398.778,03 kg    │
│  (-) Estoque Final                  52.263,03 kg    │
│  ─────────────────────────────────────────────      │
│  Produção Total                    454.869,00 kg    │
│  Rolos Produzidos                       21.732      │
│  Vendas de Fio                     199.194,60 kg    │
└─────────────────────────────────────────────────────┘
```

### Detalhes do cálculo de Estoque Inicial:

O **Estoque Inicial** de um mês é o **Estoque Final do mês anterior**. Para calculá-lo:

```typescript
// Estoque Final de um mês = 
//   Σ compras (NFs entrada até o final do mês)
//   − Σ consumo (produções até o final do mês)
//   − Σ vendas de fio (NFs venda_fio até o final do mês)

// Estoque Inicial do mês X = Estoque Final do mês (X-1)
// Exemplo: Estoque Inicial de Fev/2026 = Estoque Final de Jan/2026
```

Para o **primeiro mês** (sem dados anteriores), o Estoque Inicial é **0**.

---

## 📄 Seção 2: SALDO DE FIOS POR TIPO

### Dados do XLSX de referência:
```
FIO 30/1 OE
  COMPRA DE FEVEREIRO 2026    318.149,27 kg
  ESTOQUE                      73.756,00 kg
  VENDAS                      128.105,74 kg

FIO 30/1 PENTEADO
  COMPRA DE FEVEREIRO 2026     10.764,00 kg
  ESTOQUE                         702,00 kg
  VENDAS                              - kg
```

### Cálculos (por `yarn_type_id`):

| Métrica      | Fórmula                                                                              | Período         |
|--------------|--------------------------------------------------------------------------------------|-----------------|
| **Compra**   | `Σ invoice_items.weight_kg` de NFs `entrada`, status ≠ `cancelada`                   | Mês selecionado |
| **Estoque**  | Compra acumulada − Consumo acumulado − Vendas acumuladas (até o mês)                 | Acumulado       |
| **Vendas**   | `Σ invoice_items.weight_kg` de NFs `venda_fio`, status ≠ `cancelada`                 | Mês selecionado |

### Layout no Card:
```
┌──────────────────────┬──────────────┬──────────┬──────────┐
│ Tipo de Fio          │ Compra (mês) │ Estoque  │ Vendas   │
├──────────────────────┼──────────────┼──────────┼──────────┤
│ FIO 30/1 OE          │ 318.149,27   │ 73.756,0 │128.105,7 │
│ FIO 30/1 PENTEADO    │  10.764,00   │    702,0 │      -   │
│ ...                  │ ...          │ ...      │ ...      │
├──────────────────────┼──────────────┼──────────┼──────────┤
│ TOTAL                │ 398.778,03   │ 52.263,0 │199.194,6 │
└──────────────────────┴──────────────┴──────────┴──────────┘
```

### Fontes de dados:
- Já implementado na aba "Saldo Global" em Invoices
- Reutilizar a mesma lógica de cálculo

> **Referência:** `saldofiosglobal.md` — toda a lógica de cálculo está documentada lá.

---

## 📄 Seção 3: ESTOQUE DE MALHA

### Conceito:
Malha produzida que ainda não foi entregue ao cliente (sem NF de saída).

### Cálculos (por `client_id` + `article_id`):

| Métrica          | Fórmula                                                              |
|------------------|----------------------------------------------------------------------|
| **Produzido**    | `Σ productions.weight_kg` + `Σ productions.rolls_produced`           |
| **Entregue**     | `Σ invoice_items.weight_kg` + `quantity_rolls` de NFs `saida` não canceladas |
| **Em Estoque**   | Produzido − Entregue                                                 |

### Layout no Card:
```
▼ Sul Brasil
  ┌─────────────────────────┬───────────┬──────────┬──────────┬────────┐
  │ Artigo                  │ Produzido │ Entregue │ Estoque  │ Rolos  │
  ├─────────────────────────┼───────────┼──────────┼──────────┼────────┤
  │ MALHA 1,12-115 MISTO    │ 420 kg    │ 300 kg   │ 120 kg   │ 10     │
  │ MALHA 1,35-115 MISTO    │ 200 kg    │ 0 kg     │ 200 kg   │ 18     │
  ├─────────────────────────┼───────────┼──────────┼──────────┼────────┤
  │ TOTAL                   │ 620 kg    │ 300 kg   │ 320 kg   │ 28     │
  └─────────────────────────┴───────────┴──────────┴──────────┴────────┘
```

### Período:
- Produzido: **acumulado** (todas as produções até o final do mês)
- Entregue: **acumulado** (todas as NFs de saída até o final do mês)
- Assim o estoque reflete o **saldo real** ao final do mês

> **Referência:** `estoquemalhas.md` — lógica de cálculo já documentada.

---

## 📄 Seção 4: RECEITAS PRÓPRIAS (Produção Interna)

### Conceito:
Receita gerada pela produção interna da malharia (não terceirizada).

### Cálculo (por `client_id`):

| Métrica              | Fórmula                                                    |
|----------------------|------------------------------------------------------------|
| **Kg Produzidos**    | `Σ productions.weight_kg` no mês                           |
| **Rolos Produzidos** | `Σ productions.rolls_produced` no mês                      |
| **Receita**          | `Σ productions.revenue` no mês (weight_kg × value_per_kg)  |

### Layout no Card:
```
┌─────────────────────────┬──────────┬────────┬───────────────┐
│ Cliente                 │ Kg       │ Rolos  │ Receita (R$)  │
├─────────────────────────┼──────────┼────────┼───────────────┤
│ Sul Brasil              │ 12.500   │ 580    │ R$ 62.500,00  │
│ Textil ABC              │  8.300   │ 410    │ R$ 41.500,00  │
│ Confecções XYZ          │  5.200   │ 260    │ R$ 26.000,00  │
├─────────────────────────┼──────────┼────────┼───────────────┤
│ TOTAL                   │ 26.000   │ 1.250  │ R$ 130.000,00 │
└─────────────────────────┴──────────┴────────┴───────────────┘
```

### Fontes de dados:
- `productions` filtrado por `date` no mês
- Agrupado por `client_name` (do artigo vinculado)
- `revenue` = `weight_kg × articles.value_per_kg`

---

## 📄 Seção 5: RECEITAS DE TERCEIROS

### Conceito:
Produção terceirizada onde a empresa teve **lucro** (client_value > outsource_value).

### Cálculo:

| Métrica              | Fórmula                                                        |
|----------------------|----------------------------------------------------------------|
| **Kg**               | `Σ outsource_productions.weight_kg` (onde `total_profit > 0`)  |
| **Rolos**            | `Σ outsource_productions.rolls`                                |
| **Receita (Cliente)**| `Σ outsource_productions.total_revenue`                        |
| **Custo (Repasse)**  | `Σ outsource_productions.total_cost`                           |
| **Lucro**            | `Σ outsource_productions.total_profit`                         |

### Filtro:
- `outsource_productions.date` no mês selecionado
- `outsource_productions.total_profit >= 0` (lucro positivo ou zero)

### Layout no Card:
```
┌────────────────────┬────────┬───────┬──────────────┬──────────────┬─────────────┐
│ Malharia           │ Kg     │ Rolos │ Receita (R$) │ Custo (R$)   │ Lucro (R$)  │
├────────────────────┼────────┼───────┼──────────────┼──────────────┼─────────────┤
│ Facção Leonardo    │ 8.500  │ 420   │ R$ 42.500    │ R$ 34.000    │ R$ 8.500    │
│ GTI Malhas         │ 5.200  │ 260   │ R$ 26.000    │ R$ 20.800    │ R$ 5.200    │
├────────────────────┼────────┼───────┼──────────────┼──────────────┼─────────────┤
│ TOTAL              │ 13.700 │ 680   │ R$ 68.500    │ R$ 54.800    │ R$ 13.700   │
└────────────────────┴────────┴───────┴──────────────┴──────────────┴─────────────┘
```

### Fontes de dados:
- `outsource_productions` filtrado por `date` no mês

---

## 📄 Seção 6: PREJUÍZOS DE TERCEIROS

### Conceito:
Produção terceirizada onde a empresa teve **prejuízo** (client_value < outsource_value).

### Cálculo:
Mesma estrutura da Seção 5, mas filtrado onde `total_profit < 0`.

### Layout no Card:
```
┌────────────────────┬────────┬───────┬──────────────┬──────────────┬──────────────┐
│ Malharia           │ Kg     │ Rolos │ Receita (R$) │ Custo (R$)   │ Prejuízo (R$)│
├────────────────────┼────────┼───────┼──────────────┼──────────────┼──────────────┤
│ Ricilon Malhas     │ 3.200  │ 160   │ R$ 12.800    │ R$ 14.400    │ -R$ 1.600   │
├────────────────────┼────────┼───────┼──────────────┼──────────────┼──────────────┤
│ TOTAL              │ 3.200  │ 160   │ R$ 12.800    │ R$ 14.400    │ -R$ 1.600   │
└────────────────────┴────────┴───────┴──────────────┴──────────────┴──────────────┘
```

### Regra:
- Se nenhum terceirizado teve prejuízo no mês, esta seção exibe "Nenhum prejuízo neste mês"
- Valores de prejuízo exibidos em vermelho (`text-destructive`)

---

## 📄 Seção 7: RECEITAS DIVERSAS — RESÍDUOS

### Conceito:
Vendas de materiais residuais (papelão, plástico, óleo sujo, etc.).

### Cálculo (por `material_id`):

| Métrica          | Fórmula                                           |
|------------------|----------------------------------------------------|
| **Quantidade**   | `Σ residue_sales.quantity` no mês                  |
| **Valor Total**  | `Σ residue_sales.total` no mês                     |

### Layout no Card:
```
┌────────────────────┬──────────┬───────┬───────────────┐
│ Material           │ Qtd      │ Und.  │ Total (R$)    │
├────────────────────┼──────────┼───────┼───────────────┤
│ Papelão            │ 1.200    │ kg    │ R$ 720,00     │
│ Plástico           │ 800      │ kg    │ R$ 400,00     │
│ Óleo Sujo          │ 200      │ L     │ R$ 300,00     │
├────────────────────┼──────────┼───────┼───────────────┤
│ TOTAL              │          │       │ R$ 1.420,00   │
└────────────────────┴──────────┴───────┴───────────────┘
```

### Fontes de dados:
- `residue_sales` filtrado por `date` no mês
- Agrupado por `material_name`
- `unit` para a coluna de unidade (kg, un, L, etc.)

---

## 📄 Seção 8: VENDA DE FIO

### Conceito:
Fio que foi vendido ou devolvido ao cliente sem ter sido tecido (NFs tipo `venda_fio`).

### Cálculo (por `client_id` + `yarn_type_id`):

| Métrica          | Fórmula                                                                    |
|------------------|-----------------------------------------------------------------------------|
| **Kg**           | `Σ invoice_items.weight_kg` de NFs `venda_fio`, status ≠ `cancelada`, no mês |
| **Valor/kg**     | `invoice_items.value_per_kg`                                               |
| **Total (R$)**   | `Σ invoice_items.subtotal`                                                 |

### Layout no Card:
```
┌─────────────────┬──────────────────┬──────────┬──────────┬───────────────┐
│ Cliente         │ Tipo de Fio      │ Kg       │ R$/kg    │ Total (R$)    │
├─────────────────┼──────────────────┼──────────┼──────────┼───────────────┤
│ Sul Brasil      │ FIO 30/1 OE      │ 5.000    │ R$ 12,50 │ R$ 62.500,00  │
│ Sul Brasil      │ FIO 24/1 PA      │ 2.000    │ R$ 11,00 │ R$ 22.000,00  │
│ Textil ABC      │ FIO 30/1 OE      │ 3.500    │ R$ 12,50 │ R$ 43.750,00  │
├─────────────────┼──────────────────┼──────────┼──────────┼───────────────┤
│ TOTAL           │                  │ 10.500   │          │ R$ 128.250,00 │
└─────────────────┴──────────────────┴──────────┴──────────┴───────────────┘
```

### Fontes de dados:
- `invoices` (type = `venda_fio`, status ≠ `cancelada`, `issue_date` no mês)
- `invoice_items` (weight_kg, value_per_kg, subtotal, yarn_type_name)

---

## 📄 Seção 9: ESTOQUE DE FIO EM TERCEIROS

### Conceito:
Quanto de fio da empresa está fisicamente em cada facção terceirizada ao final do mês.

### Cálculo:
Dados diretos da tabela `outsource_yarn_stock` para o `reference_month` selecionado.

### Layout no Card:
```
ESTOQUE DE FIO — FACÇÃO LEONARDO
  ┌──────────────────────────┬──────────────────┐
  │ Tipo de Fio              │ Quantidade (kg)   │
  ├──────────────────────────┼──────────────────┤
  │ FIO 2/70/68              │ 3.941,44         │
  │ FIO 30/1 PENTEADO        │ 25.024,61        │
  │ FIO 150/48 PES           │ 1.377,00         │
  │ FIO 30/1 OE              │ 12.699,00        │
  ├──────────────────────────┼──────────────────┤
  │ TOTAL                    │ 43.042,05        │
  └──────────────────────────┴──────────────────┘

ESTOQUE DE FIO — RICILON MALHAS
  ┌──────────────────────────┬──────────────────┐
  │ FIO 150/48 PES           │ 1.296,00         │
  │ FIO 30/1 OE              │ 16.838,30        │
  ├──────────────────────────┼──────────────────┤
  │ TOTAL                    │ 18.134,30        │
  └──────────────────────────┴──────────────────┘

TOTAL GERAL EM TERCEIROS: 92.423,35 kg
```

### Fontes de dados:
- `outsource_yarn_stock` filtrado por `reference_month` = mês selecionado
- Agrupado por `outsource_company_id` → `yarn_type_id`

> **Referência:** `estoquefioterceiro.md`

---

## 📄 Seção 10: FATURAMENTO TOTAL

### Conceito:
Consolidação de todas as receitas e custos do mês.

### Cálculo:

| Linha                          | Fórmula                                                 | Sinal |
|--------------------------------|---------------------------------------------------------|-------|
| **Receitas Próprias**          | Σ Seção 4 (total revenue produção interna)              | +     |
| **Receitas de Terceiros**      | Σ Seção 5 (total_profit dos terceiros com lucro)        | +     |
| **(-) Prejuízos de Terceiros** | Σ Seção 6 (total_profit negativo dos terceiros)         | -     |
| **Receitas Diversas (Resíduos)**| Σ Seção 7 (total residue_sales)                        | +     |
| **Venda de Fio**               | Σ Seção 8 (total NFs venda_fio)                        | +     |
| **═══════════════════**        |                                                         |       |
| **FATURAMENTO TOTAL**          | Receitas + Terceiros − Prejuízos + Resíduos + Venda Fio | =     |

### Layout no Card:
```
┌─────────────────────────────────────────────────────────┐
│  FATURAMENTO TOTAL — FEVEREIRO/2026                     │
│                                                         │
│  Receitas Próprias (Produção)        R$ 130.000,00      │
│  Receitas de Terceiros               R$  13.700,00      │
│  (-) Prejuízos de Terceiros          -R$  1.600,00      │
│  Receitas Diversas (Resíduos)        R$   1.420,00      │
│  Venda de Fio                        R$ 128.250,00      │
│  ───────────────────────────────────────────────         │
│  FATURAMENTO TOTAL                   R$ 271.770,00      │
└─────────────────────────────────────────────────────────┘
```

### Destaque visual:
- Linha de **FATURAMENTO TOTAL** em negrito, fonte maior, cor `primary`
- Prejuízos em `text-destructive`
- Demais linhas em `text-foreground`

---

## 📤 Exportação PDF (Multi-Página)

### Regra visual:
Seguir **obrigatoriamente** o padrão de PDF estabelecido em `Reports.tsx > addHeader()` (ver mestre.md § Padrão de Exportação PDF).

### Estrutura do PDF:

| Página | Título                                     | Conteúdo                                      |
|--------|--------------------------------------------|-----------------------------------------------|
| 1      | FECHAMENTO KG — [MÊS/ANO]                 | Estoque inicial, compra, estoque final, produção, rolos |
| 2      | SALDO DE FIOS — [MÊS/ANO]                 | Tabela por tipo de fio (compra, estoque, vendas) |
| 3      | ESTOQUE DE MALHA — [MÊS/ANO]              | Tabela por cliente/artigo (produzido, entregue, estoque, rolos) |
| 4      | RECEITAS PRÓPRIAS — [MÊS/ANO]             | Tabela por cliente (kg, rolos, receita)       |
| 5      | RECEITAS DE TERCEIROS — [MÊS/ANO]         | Tabela por malharia (kg, rolos, receita, custo, lucro) |
| 6      | PREJUÍZOS DE TERCEIROS — [MÊS/ANO]        | Tabela por malharia (kg, rolos, receita, custo, prejuízo) |
| 7      | RECEITAS DIVERSAS (RESÍDUOS) — [MÊS/ANO]  | Tabela por material (qtd, und, total)         |
| 8      | VENDA DE FIO — [MÊS/ANO]                  | Tabela por cliente/fio (kg, R$/kg, total)     |
| 9      | ESTOQUE FIO EM TERCEIROS — [MÊS/ANO]      | Tabela por facção/fio (kg) + total geral      |
| 10     | FATURAMENTO TOTAL — [MÊS/ANO]             | Resumo consolidado de todas as receitas       |

### Cabeçalho de cada página (padrão global):
```
┌─────────────────────────────────────────────────────────┐
│ [Logo]  │  TÍTULO DA SEÇÃO (14pt bold center)           │
│ Data    │                                    Período    │
└─────────────────────────────────────────────────────────┘
```

### Cores do PDF:
```javascript
const colors = {
  textDark: [17, 24, 39],      // Texto principal
  textMid: [75, 85, 99],       // Texto secundário
  grayBg: [249, 250, 251],     // Fundo do header
  border: [229, 231, 235],     // Bordas
};

// Tabelas:
headStyles: { fillColor: [60, 60, 60] }
fontSize: 8
margins: 15mm
```

### Biblioteca:
- **jsPDF** + **jspdf-autotable** (já usados em Reports.tsx e Outsource.tsx)

---

## 🔧 Implementação Frontend

### Dados necessários

Todos os dados já existem no sistema. Queries necessárias:

| Dado                        | Tabela                      | Já disponível? |
|-----------------------------|-----------------------------|----------------|
| NFs (entrada, saída, venda) | `invoices`                  | ✅ Query direta |
| Itens das NFs               | `invoice_items`             | ✅ Query direta |
| Tipos de fio                | `yarn_types`                | ✅ Query direta |
| Produções                   | `productions`               | ✅ Query direta |
| Artigos (com yarn_type_id)  | `articles`                  | ✅ Query direta |
| Clientes                    | `clients`                   | ✅ Query direta |
| Terceirizados (produções)   | `outsource_productions`     | ✅ Query direta |
| Terceirizados (empresas)    | `outsource_companies`       | ✅ Query direta |
| Estoque fio terceiros       | `outsource_yarn_stock`      | ✅ Query direta |
| Vendas de resíduos          | `residue_sales`             | ✅ Query direta |
| Materiais de resíduos       | `residue_materials`         | ✅ Query direta |

### Queries Supabase

```typescript
const sb = (table: string) => supabase.from(table);

// 1. NFs do mês (e acumulado para estoque)
const { data: invoices } = await sb('invoices')
  .select('*').eq('company_id', companyId)
  .neq('status', 'cancelada');

// 2. Itens das NFs
const { data: invoiceItems } = await sb('invoice_items')
  .select('*').eq('company_id', companyId);

// 3. Produções
const { data: productions } = await sb('productions')
  .select('*').eq('company_id', companyId);

// 4. Artigos
const { data: articles } = await sb('articles')
  .select('*').eq('company_id', companyId);

// 5. Tipos de fio
const { data: yarnTypes } = await sb('yarn_types')
  .select('*').eq('company_id', companyId);

// 6. Clientes
const { data: clients } = await sb('clients')
  .select('*').eq('company_id', companyId);

// 7. Terceirizados
const { data: outsourceProductions } = await sb('outsource_productions')
  .select('*').eq('company_id', companyId);

// 8. Empresas terceirizadas
const { data: outsourceCompanies } = await sb('outsource_companies')
  .select('*').eq('company_id', companyId);

// 9. Estoque fio terceiros
const { data: yarnStock } = await sb('outsource_yarn_stock')
  .select('*').eq('company_id', companyId)
  .eq('reference_month', selectedMonth);

// 10. Vendas de resíduos
const { data: residueSales } = await sb('residue_sales')
  .select('*').eq('company_id', companyId);
```

### Filtro de período

Todas as queries trazem dados completos. A filtragem por mês é feita no **frontend**:

```typescript
const isInMonth = (date: string, month: string) => date.startsWith(month);
// Ex: isInMonth('2026-02-15', '2026-02') → true

const isUpToMonth = (date: string, month: string) => date <= `${month}-31`;
// Ex: isUpToMonth('2026-01-20', '2026-02') → true (para cálculos acumulados)
```

### Estrutura do componente

```
src/pages/Fechamento.tsx
├── Estado: selectedMonth (YYYY-MM)
├── Queries: todas as 10 tabelas
├── useMemo: cálculos de cada seção
├── Render: Cards com preview de cada seção
├── Botão: Exportar PDF
└── Função: generatePDF() com jsPDF
```

---

## 🔗 Dependências

```
┌─────────────────────────────────────────────────┐
│                 FECHAMENTO MENSAL                │
│                                                  │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ invoices     │  │ outsource_productions    │ │
│  │ invoice_items│  │ outsource_companies      │ │
│  └──────┬───────┘  └──────────┬───────────────┘ │
│         │                     │                  │
│  ┌──────▼───────┐  ┌──────────▼───────────────┐ │
│  │ productions  │  │ outsource_yarn_stock     │ │
│  │ articles     │  └──────────────────────────┘ │
│  │ clients      │                                │
│  │ yarn_types   │  ┌──────────────────────────┐ │
│  └──────────────┘  │ residue_sales            │ │
│                     │ residue_materials        │ │
│                     └──────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Permissões

| Role       | Acesso                                         |
|------------|------------------------------------------------|
| `admin`    | Acesso total: visualizar + exportar PDF        |
| `lider`    | Sem acesso (dados financeiros sensíveis)       |
| `mecanico` | Sem acesso                                     |
| `revisador`| Sem acesso                                     |

- Key `fechamento` no `enabled_nav_items` em `company_settings`
- Controlável pelo admin da plataforma

---

## 📋 Checklist de Implementação

### Fase 1: Página base
- [ ] Criar `src/pages/Fechamento.tsx`
- [ ] Criar rota `/:slug/fechamento` em App.tsx
- [ ] Adicionar "Fechamento" à sidebar (ícone `FileSpreadsheet`, key `fechamento`)
- [ ] Adicionar `fechamento` ao array padrão de `enabled_nav_items`
- [ ] Permissão: apenas `admin`
- [ ] Seletor de mês no topo

### Fase 2: Queries e cálculos
- [ ] Carregar todas as 10 tabelas via queries diretas
- [ ] Calcular Seção 1: Fechamento KG (estoque inicial, compra, estoque final, produção)
- [ ] Calcular Seção 2: Saldo de Fios por Tipo (compra, estoque, vendas)
- [ ] Calcular Seção 3: Estoque de Malha (produzido − entregue)
- [ ] Calcular Seção 4: Receitas Próprias (produção interna por cliente)
- [ ] Calcular Seção 5: Receitas de Terceiros (lucro positivo)
- [ ] Calcular Seção 6: Prejuízos de Terceiros (lucro negativo)
- [ ] Calcular Seção 7: Receitas Diversas — Resíduos
- [ ] Calcular Seção 8: Venda de Fio
- [ ] Calcular Seção 9: Estoque Fio em Terceiros
- [ ] Calcular Seção 10: Faturamento Total

### Fase 3: Preview visual
- [ ] Renderizar cada seção como Card na página
- [ ] Tabelas com dados formatados pt-BR
- [ ] KPIs de destaque (Faturamento Total, Produção, Estoque)
- [ ] Indicadores visuais (cores semânticas)

### Fase 4: Exportação PDF
- [ ] Implementar `generatePDF()` com jsPDF + autoTable
- [ ] 10 páginas (uma por seção)
- [ ] Cabeçalho padrão em cada página (logo, título, data, período)
- [ ] Cores e estilos conforme padrão global
- [ ] Formatação pt-BR em todos os valores
- [ ] Total por tabela em negrito
- [ ] Nome do arquivo: `Fechamento_[MES]_[ANO]_[Empresa].pdf`

### Fase 5: Validação
- [ ] Testar com mês que tem dados completos
- [ ] Testar com mês vazio (deve mostrar zeros/vazios, não erros)
- [ ] Testar Estoque Inicial (deve puxar estoque final do mês anterior)
- [ ] Testar fórmula de consistência (Estoque Inicial + Compra − Estoque Final ≈ Produção + Vendas)
- [ ] Verificar totais do PDF vs preview visual
- [ ] Testar responsividade em mobile
- [ ] Verificar permissões (líder/mecânico/revisador não acessam)

---

## ⚠️ Considerações Importantes

1. **Performance:** São 10 queries simultâneas — usar `Promise.all` ou `useQueries` para paralelizar
2. **Limite de 1000 rows:** Supabase retorna máx 1000 registros por query — se a empresa tiver mais, paginar ou usar `.range()`
3. **NFs canceladas:** SEMPRE excluir NFs com `status = 'cancelada'` dos cálculos
4. **Mês sem dados:** Exibir seção vazia com "Nenhum dado para este mês" em vez de ocultar
5. **Estoque Inicial do 1º mês:** Quando não há mês anterior, o estoque inicial é 0
6. **Arredondamento:** Usar 2 casas decimais para kg, 2 para R$
7. **Dados financeiros:** APENAS admin pode ver — toda a página é restrita
8. **PDF multi-página:** Seções que não cabem em uma página devem fazer `addPage()` automaticamente (autoTable já faz isso)
9. **Fio sem tipo:** Produções de artigos sem `yarn_type_id` vinculado não contam no consumo de fio
10. **Estoque Fio Terceiros:** Se não houver registro para o mês no `outsource_yarn_stock`, a seção fica vazia

---

## 🔮 Futuro (não implementar agora)

1. **Comparativo entre meses** — mostrar evolução mês a mês
2. **Exportação XLSX** — além do PDF, gerar planilha Excel formatada
3. **Dashboard com gráficos de fechamento** — tendências de faturamento
4. **Fechamento automático** — "fechar" o mês impedindo edições retroativas
5. **Aprovação de fechamento** — workflow com assinaturas digitais

---

*Documento criado em: 04/04/2026*
*Última atualização: 04/04/2026*
*Status: DOCUMENTADO — Aguardando implementação*
