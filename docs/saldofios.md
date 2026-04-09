# 🧶 SALDOFIOS.MD — Saldo de Fios + Vínculo Artigo ↔ Tipo de Fio

> **⚠️ INSTRUÇÕES:**
> Este arquivo documenta a implementação conjunta do vínculo Artigo ↔ Tipo de Fio e da Tela de Saldo de Fios.
> Ambos devem ser implementados juntos pois o saldo depende do vínculo para calcular o consumo.

---

## 📌 Pré-requisito Obrigatório: Vínculo Artigo ↔ Tipo de Fio

### Problema
A coluna `yarn_type_id` já existe na tabela `articles` (adicionada na migration do módulo NF), mas **não aparece na UI** de cadastro/edição de artigos na página Clientes & Artigos.

### O que implementar

#### No formulário de Artigo (Clientes & Artigos):
- Adicionar campo **"Tipo de Fio"** como `<Select>` (ou `SearchableSelect`)
- Posição: após o campo "Cliente" e antes de "Peso por Rolo"
- Opções: lista de `yarn_types` da empresa (query `yarn_types` com `company_id`)
- **Opcional** — nem todo artigo precisa ter fio vinculado
- Ao selecionar, salvar o `yarn_type_id` no registro do artigo
- Exibir o nome do fio na listagem/tabela de artigos (coluna extra ou dentro do card)

#### Regras:
- Um artigo usa **1 tipo de fio** (relação N:1)
- Vários artigos podem usar o **mesmo tipo de fio**
- Se o artigo não tiver fio vinculado, ele **não aparece** nos cálculos de consumo do saldo de fios
- O vínculo pode ser alterado a qualquer momento (edição do artigo)

#### Fluxo do usuário:
```
1. Ir em Clientes & Artigos
2. Criar ou editar um artigo
3. No formulário, selecionar o "Tipo de Fio" no dropdown
4. Salvar → yarn_type_id é gravado na tabela articles
5. A partir de agora, toda produção desse artigo será contabilizada como consumo desse fio
```

### Dados necessários:
- **Leitura:** `yarn_types` (id, name) filtrado por `company_id`
- **Escrita:** `articles.yarn_type_id` no INSERT/UPDATE do artigo

### Sem migrations necessárias
- A coluna `yarn_type_id` já existe em `articles`
- A tabela `yarn_types` já existe com RLS configurado
- Apenas alteração de UI (frontend)

---

## 📊 Tela de Saldo de Fios

### Localização
- Aba **"Saldo de Fios"** dentro da página de Notas Fiscais (`/:slug/invoices`)
- Terceira aba (após Entrada e Saída)

### Fórmula de Cálculo

```
Saldo = Fio Recebido − Fio Consumido − Fio Vendido/Devolvido
```

| Componente       | Tabela fonte                          | Filtros                                          | Agrupamento                  |
|------------------|---------------------------------------|--------------------------------------------------|------------------------------|
| **Fio Recebido** | `invoice_items` JOIN `invoices`        | `invoices.type = 'entrada'` AND `status ≠ 'cancelada'` | `client_id` + `yarn_type_id` |
| **Fio Consumido**| `productions` JOIN `articles`          | `articles.yarn_type_id IS NOT NULL`              | `client_id` (do artigo) + `yarn_type_id` (do artigo) |
| **Fio Vendido**  | `invoice_items` JOIN `invoices`        | `invoices.type = 'venda_fio'` AND `status ≠ 'cancelada'` | `client_id` + `yarn_type_id` |

### Queries necessárias

#### 1. Fio Recebido (por cliente + tipo de fio)
```
invoices (type='entrada', status≠'cancelada')
  → invoice_items (yarn_type_id, weight_kg)
  → agrupado por invoices.client_id + invoice_items.yarn_type_id
  → soma weight_kg
```

#### 2. Fio Consumido (por cliente + tipo de fio)
```
productions (weight_kg)
  → articles (client_id, yarn_type_id) via article_id
  → filtro: articles.yarn_type_id IS NOT NULL
  → agrupado por articles.client_id + articles.yarn_type_id
  → soma productions.weight_kg
```

#### 3. Fio Vendido (por cliente + tipo de fio)
```
invoices (type='venda_fio', status≠'cancelada')
  → invoice_items (yarn_type_id, weight_kg)
  → agrupado por invoices.client_id + invoice_items.yarn_type_id
  → soma weight_kg
```

#### 4. Junção no frontend
```typescript
// Chave: `${client_id}_${yarn_type_id}`
// Para cada chave:
//   recebido = soma do grupo 1
//   consumido = soma do grupo 2
//   vendido = soma do grupo 3
//   saldo = recebido - consumido - vendido
```

### Layout da Tela

#### KPIs no topo:
| KPI                | Valor                              |
|--------------------|------------------------------------|
| Total Recebido     | Soma de todo fio recebido (kg)     |
| Total Consumido    | Soma de todo fio consumido (kg)    |
| Total Vendido      | Soma de todo fio vendido (kg)      |
| Saldo Total        | Recebido - Consumido - Vendido     |

#### Filtros:
- **Período** (mês/ano) — filtra NFs por `issue_date` e produções por `date`
- **Cliente** — filtrar por cliente específico
- **Tipo de Fio** — filtrar por fio específico

#### Tabela agrupada por cliente (Collapsible):

```
▼ Sul Brasil
  ┌──────────────────────┬───────────┬───────────┬──────────┬─────────┐
  │ Tipo de Fio          │ Recebido  │ Consumido │ Vendido  │ Saldo   │
  ├──────────────────────┼───────────┼───────────┼──────────┼─────────┤
  │ Algodão 30/1 branco  │ 800 kg    │ 620 kg    │ 50 kg    │ 130 kg  │
  │ Poliéster 150 preto  │ 300 kg    │ 150 kg    │ 0 kg     │ 150 kg  │
  ├──────────────────────┼───────────┼───────────┼──────────┼─────────┤
  │ TOTAL                │ 1.100 kg  │ 770 kg    │ 50 kg    │ 280 kg  │
  └──────────────────────┴───────────┴───────────┴──────────┴─────────┘

▶ Outro Cliente (clique para expandir)
```

#### Indicadores visuais:
- **Saldo positivo** → cor normal (fio ainda na facção)
- **Saldo negativo** → badge vermelho (alerta — produziu mais do que recebeu, possível erro)
- **Saldo zero** → cor muted (todo fio consumido/devolvido)

### Componentes UI sugeridos:
- `Collapsible` do shadcn/ui para agrupar por cliente
- `Table` do shadcn/ui para os dados internos
- `Badge` para indicar status do saldo
- `Select` para filtros de período/cliente/fio
- Cards de KPI no topo (mesmo padrão do Dashboard)

---

## 🔗 Dependências entre os dois

```
┌─────────────────────────────┐
│  Vínculo Artigo ↔ Fio (UI)  │ ← Implementar PRIMEIRO ou JUNTO
│  Campo yarn_type_id no form │
└──────────┬──────────────────┘
           │ sem isso, consumo = 0
           ▼
┌─────────────────────────────┐
│   Tela de Saldo de Fios     │
│   Aba em Notas Fiscais      │
│   Recebido - Consumido -    │
│   Vendido = Saldo           │
└─────────────────────────────┘
```

**Sem o vínculo Artigo ↔ Fio:**
- A coluna "Consumido" ficará sempre **0** (pois `articles.yarn_type_id` será null)
- O saldo será igual ao recebido (incorreto)
- Por isso ambos DEVEM ser implementados juntos

---

## 📋 Checklist de Implementação

### Fase 1: Vínculo Artigo ↔ Fio
- [x] Ler a página Clientes & Artigos atual
- [x] Adicionar campo "Tipo de Fio" no formulário de artigo (Select com yarn_types)
- [x] Salvar `yarn_type_id` no INSERT/UPDATE de artigos
- [x] Exibir nome do fio na listagem de artigos (coluna ou info extra)
- [x] Permitir limpar o vínculo (artigo sem fio = não contabiliza consumo)

### Fase 2: Aba Saldo de Fios
- [x] Criar aba "Saldo de Fios" na página Invoices
- [x] Query 1: buscar fio recebido (NFs entrada)
- [x] Query 2: buscar fio consumido (productions × articles.yarn_type_id)
- [x] Query 3: buscar fio vendido (NFs venda_fio)
- [x] Juntar dados e calcular saldo por client_id + yarn_type_id
- [x] Renderizar KPIs no topo
- [x] Renderizar tabela agrupada por cliente (Collapsible)
- [x] Filtros: período, cliente, tipo de fio
- [x] Indicadores visuais de saldo (positivo/negativo/zero)

### Fase 3: Validação
- [x] Testar com artigo SEM yarn_type_id → não deve aparecer no consumo
- [x] Testar com NF cancelada → não deve contar no saldo
- [x] Testar saldo negativo → deve exibir alerta visual
- [x] Testar com múltiplos clientes e fios → agrupamento correto

---

## 📐 Padrão Visual

Seguir o padrão estabelecido no projeto:
- Cards de KPI: mesmo estilo do Dashboard
- Tabelas: componente `Table` do shadcn/ui
- Filtros: `Select` com labels claras
- Cores: usar tokens semânticos do design system (nunca cores diretas)
- Responsivo: funcionar em mobile (cards empilhados)

---

## 🔐 Permissões

| Role       | Acesso ao Saldo de Fios |
|------------|------------------------|
| `admin`    | Visualização completa (com valores financeiros se houver) |
| `lider`    | Sem acesso (key `invoices` não está no `ROLE_ALLOWED_KEYS.lider`) |
| `mecanico` | Sem acesso |
| `revisador`| Sem acesso |

Herda as mesmas permissões da página de Notas Fiscais (key `invoices` no `enabled_nav_items`). Apenas `admin` tem acesso por padrão, mas pode ser concedido a outros roles via `permission_overrides`.

---

*Documento criado em: 03/04/2026*
*Status: ✅ IMPLEMENTADO — Aba "Saldo Fios" funcional na página Invoices. Vínculo Artigo ↔ Tipo de Fio implementado em Clientes & Artigos.*
