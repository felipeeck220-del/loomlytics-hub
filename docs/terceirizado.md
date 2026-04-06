# 📋 Terceirizado — Documentação Completa

> Módulo de gestão de produção terceirizada (`src/pages/Outsource.tsx`)

---

## 📌 Visão Geral

O módulo **Terceirizado** gerencia a produção realizada por malharias externas (terceirizadas). No modelo de facção, a empresa recebe pedidos de clientes e pode repassar parte da produção para malharias parceiras, cobrando uma margem sobre o valor pago pelo cliente.

**Rota:** `/:slug/outsource`
**Permissão:** Apenas `admin`
**Arquivo:** `src/pages/Outsource.tsx` (~2400 linhas)

---

## 🗄️ Modelo de Dados

### Tabela `outsource_companies`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | ID único |
| company_id | uuid (FK) | Empresa dona |
| name | text | Nome da malharia terceirizada |
| contact | text? | Telefone/email |
| observations | text? | Observações |
| created_at | timestamptz | Data de criação |

### Tabela `outsource_productions`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | ID único |
| company_id | uuid (FK) | Empresa dona |
| outsource_company_id | uuid (FK) | Malharia terceirizada |
| article_id | uuid (FK) | Artigo produzido |
| article_name | text? | Nome do artigo (snapshot) |
| outsource_company_name | text? | Nome da malharia (snapshot) |
| client_name | text? | Nome do cliente (snapshot) |
| date | text | Data da produção (yyyy-MM-dd) |
| weight_kg | numeric | Peso produzido em kg |
| rolls | integer | Quantidade de rolos |
| client_value_per_kg | numeric | Valor que o cliente paga por kg |
| outsource_value_per_kg | numeric | Valor de repasse à malharia por kg |
| freight_per_kg | numeric (default 0) | Custo de frete por kg (opcional) |
| profit_per_kg | numeric | Lucro por kg = cliente - repasse - frete |
| total_revenue | numeric | Receita total = peso × valor_cliente |
| total_cost | numeric | Custo total = peso × valor_repasse |
| total_profit | numeric | Lucro total = peso × lucro_por_kg |
| nf_rom | text? | Número da NF ou Romaneio |
| observations | text? | Observações |
| created_by_name | text? | Nome de quem registrou |
| created_by_code | text? | Código (#ID) de quem registrou |
| created_at | timestamptz | Data/hora de criação |

**RLS:** Ambas as tabelas usam `company_id = get_user_company_id()` para isolamento multi-tenant.

---

## 🏗️ Arquitetura do Componente

### Estrutura de Abas (Tabs)
1. **Produções** — Registro e listagem de produções terceirizadas
2. **Malharias** — CRUD de empresas terceirizadas
3. **Relatórios** — Filtros avançados, resumos e exportação PDF

### Queries (React Query)
- `outsource_companies` — Lista malharias da empresa
- `outsource_productions` — Lista produções com paginação (PAGE_SIZE=1000)
- `articles` — Lista artigos para seleção no modal

### Fetching com Paginação
```typescript
// Pagina automaticamente para superar o limite de 1000 rows do Supabase
while (hasMore) {
  const { data } = await sb('outsource_productions')
    .select('*').eq('company_id', companyId)
    .order('date', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  // ...
}
```

---

## 📊 KPIs (Cards no Topo)

| Card | Ícone | Cálculo | Cor |
|------|-------|---------|-----|
| Rolos | Package | `sum(rolls)` | amber |
| Peso Total | Scale | `sum(weight_kg)` | orange |
| Receita (Empresa) | DollarSign | `sum(total_revenue)` | emerald |
| Custo (Repasse) | DollarSign | `sum(total_cost)` | red |
| Frete Total | Truck | `sum(freight_per_kg × weight_kg)` | blue |
| Lucro (Empresa) | TrendingUp | `sum(total_profit)` | primary/destructive |
| Prejuízos | TrendingUp | `sum(total_profit) where profit < 0` | destructive |

**Os KPIs refletem os filtros ativos** (mês, período).

---

## 📝 Modal de Registro — Produção Terceirizada

### Campos do Formulário
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Malharia | Select | ✅ | Empresa terceirizada |
| Data | date | ✅ | Data da produção |
| Artigo | Searchable dropdown | ✅ | Artigo com busca por nome/cliente |
| Peso (kg) | text (decimal BR) | ✅ | Peso produzido |
| Rolos | number | ❌ | Quantidade de rolos |
| Valor Repasse (R$/kg) | text (auto-format) | ✅ | Valor pago à malharia |
| Frete (R$/kg) | text (auto-format) | ❌ | Custo de frete por kg (opcional) |
| NF/ROM | text | ❌ | Número da NF ou Romaneio |
| Observações | textarea | ❌ | Observações livres |

### Formatação de Inputs
- **Peso:** Formato brasileiro com separador de milhar (`.`) e decimal (`,`) — ex: `1.234,56`
- **Repasse e Frete:** Auto-format para valores < 10 — digitar `120` → `1,20`

### Cálculos em Tempo Real (Prévia)
```
Valor Cliente/kg = artigo.value_per_kg (automático pelo artigo selecionado)
Lucro/kg = Valor Cliente - Valor Repasse - Frete
Receita = Peso × Valor Cliente
Custo = Peso × Valor Repasse
Frete Total = Peso × Frete/kg
Lucro Total = Peso × Lucro/kg
```

### Frete (Funcionalidade)
- **Opcional:** Quando não preenchido (ou 0), não afeta os cálculos — comportamento idêntico ao anterior
- **Quando preenchido:** É descontado do lucro por kg: `lucro = cliente - repasse - frete`
- **Na prévia:** Se frete > 0, exibe colunas extras "Frete" e "Frete Total" com cor azul
- **Na listagem:** Coluna "Frete/kg" exibe o valor em azul, ou "—" quando zero
- **Nos KPIs:** Card "Frete Total" exibe a soma de todos os fretes dos registros filtrados

### Validações
- Campos obrigatórios: malharia, artigo, peso, valor repasse
- Data válida (últimos 5 anos a próximos 5 anos)
- NF/ROM: Verificação de duplicidade por malharia (mesmo outsource_company_id)

### Comportamento do Modal
- **ESC desabilitado** para evitar fechamento acidental
- **Enter salva** (quando dropdown de artigo está fechado)
- **Após salvar (novo):** Modal permanece aberto, mantém malharia selecionada, limpa campos variáveis
- **Após salvar (edição):** Modal fecha
- **Navegação por setas (↑↓←→):** Todos os campos navegáveis
- **Tab order rigoroso:** Malharia → Data (3 tabs) → Artigo → Peso → Rolos → Repasse → Frete → NF/ROM → Observações

### Dedução de Estoque de Fio
Ao registrar produção terceirizada:
1. Busca `yarn_type_id` do artigo
2. Se vinculado a um tipo de fio, deduz `weight_kg` do `outsource_yarn_stock` correspondente
3. Na edição: reverte dedução anterior e aplica nova
4. Na exclusão: adiciona peso de volta ao estoque

---

## 📋 Listagem de Produções

### Colunas da Tabela
| Coluna | Alinhamento | Detalhe |
|--------|-------------|---------|
| Data | esquerda | dd-MM-yyyy + hora + autor |
| Malharia | esquerda | Nome da malharia |
| Artigo | esquerda | Nome do artigo |
| Cliente | esquerda | Nome do cliente |
| Peso (kg) | direita | Formatado com separador |
| Rolos | direita | Número inteiro |
| R$/kg Cliente | direita | Valor monetário |
| R$/kg Repasse | direita | Valor monetário |
| Frete/kg | direita | Azul se > 0, "—" se zero |
| Lucro/kg | direita | Badge verde/vermelho |
| Lucro Total | direita | Bold verde/vermelho |
| NF/ROM | esquerda | Texto livre |
| Ações | centro | Editar / Excluir |

### Filtros
- **Mês:** Select com meses disponíveis nos dados
- **Período:** De/Até com calendários
- **Busca textual:** Por malharia, artigo, cliente ou NF/ROM

---

## 📈 Aba Relatórios

### Filtros Avançados
| Filtro | Tipo | Descrição |
|--------|------|-----------|
| Mês | Select | Meses disponíveis |
| Período | De/Até | Calendários |
| Malharia | Popover searchable | Filtro por malharia específica |
| Cliente | Popover searchable | Filtro por cliente |
| Resultado | Select | Todos / Com Lucro / Com Prejuízo |

### Cards de Resumo
Registros, Peso Total, Receita, Custo, Frete (se > 0, em azul), Lucro (colorido)

### Exportações PDF (3 tipos)
1. **Exportar PDF** — Relatório geral com todos os registros detalhados
2. **Exportar por Malharia** — Agrupado por malharia, com subtotais por artigo
3. **Exportar por Cliente** — Agrupado por cliente, com subtotais por artigo

**Padrão visual dos PDFs:**
- Cabeçalho com logo da empresa, título centralizado e período
- KPIs em cards horizontais
- Tabela com zebra striping e cores semânticas (verde=lucro, vermelho=prejuízo)
- Rodapé com "Relatório gerado automaticamente pelo sistema MalhaGest"
- Landscape A4

---

## 🔗 Integrações com Outros Módulos

### Artigos (`articles`)
- Valor por kg (`value_per_kg`) usado como "Valor Cliente"
- `yarn_type_id` usado para dedução automática de estoque de fio

### Estoque de Fio Terceiros (`outsource_yarn_stock`)
- Dedução automática ao registrar produção
- Reversão ao editar/excluir produção

### Auditoria (`audit_logs`)
- `outsource_company_create/update/delete` — CRUD de malharias
- `outsource_production_create/update/delete` — CRUD de produções

### Backup (`daily-backup`)
- Tabelas `outsource_companies` e `outsource_productions` incluídas no backup diário

---

## 🎨 Cores Semânticas
- **Lucro positivo:** `text-emerald-600` / `bg-emerald-100`
- **Prejuízo:** `text-destructive` / `bg-red-100`
- **Frete:** `text-blue-600` / `bg-blue-50`
- **Neutro:** `text-foreground` / `text-muted-foreground`

---

*Última atualização: 07/04/2026*
