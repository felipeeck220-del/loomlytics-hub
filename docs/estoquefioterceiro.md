# 🧶 ESTOQUEFIOTERCEIRO.MD — Estoque de Fio em Facções Terceirizadas

> **⚠️ INSTRUÇÕES:**
> Este arquivo documenta a implementação do módulo de **Estoque de Fio por Facção (Terceiros)**.
> Este módulo rastreia quanto fio da empresa principal está fisicamente em cada malharia terceirizada.
> **Migration já executada** — tabela `outsource_yarn_stock` já existe no banco de dados.

---

## 📌 Conceito

No modelo de facção com terceirização, a empresa principal (ex: Trama Certa) envia fio para malharias terceirizadas produzirem malha. Esse fio fica fisicamente no terceiro até ser consumido na produção ou devolvido.

O **Estoque de Fio por Facção** controla:
- Quanto de cada tipo de fio está em cada malharia terceirizada
- Qual o saldo atual (quanto fio ainda não foi consumido/devolvido)

### Exemplo real (extraído do XLSX de fechamento):

```
ESTOQUE DE FINAL DE FIO - FACÇÃO LEONARDO
  FIO 2/70/68:           3.941,44 kg
  FIO 30/1 PENTEADO:    25.024,61 kg
  FIO 150/48 PES:        1.377,00 kg
  FIO 30/1 OE:          12.699,00 kg
  TOTAL:                43.042,05 kg

ESTOQUE DE FINAL DE FIO - RICILON MALHAS
  FIO 150/48 PES:        1.296,00 kg
  FIO 30/1 OE:          16.838,30 kg
  TOTAL:                18.134,30 kg

ESTOQUE DE FINAL DE FIO - GTI MALHAS
  FIO 30/1 OE (EGITO): 31.247,00 kg
  TOTAL:                31.247,00 kg
```

---

## 📍 Onde aparece no sistema

### 1. Tela de gestão (CRUD)
- **Localização:** Nova aba **"Estoque Fio Terceiros"** dentro da página de Notas Fiscais (`/:slug/invoices`)
- **Posição das abas:** `Entrada` → `Saída` → `Saldo Fios` → `Estoque Malha` → `Estoque Fio Terceiros` → `Tipos de Fio`
- **Função:** O usuário cadastra/edita/exclui os saldos de fio em cada facção terceirizada

### 2. PDF de Fechamento Mensal
- **Seção:** "Estoque de Fio por Facção" — uma página inteira no PDF
- **Dados:** Puxa automaticamente desta tabela
- **Agrupado por:** Facção → Tipos de Fio → Quantidade em kg

---

## 🗄️ Modelo de Dados

### Nova tabela: `outsource_yarn_stock`

| Campo              | Tipo         | Nullable | Default           | Descrição                                                   |
|--------------------|--------------|----------|-------------------|-------------------------------------------------------------|
| `id`               | uuid (PK)    | NOT NULL | `gen_random_uuid()` | Identificador único                                        |
| `company_id`       | uuid (FK)    | NOT NULL | —                 | Multi-tenancy → `companies.id`                              |
| `outsource_company_id` | uuid (FK) | NOT NULL | —                 | Facção terceirizada → `outsource_companies.id`              |
| `yarn_type_id`     | uuid (FK)    | NOT NULL | —                 | Tipo de fio → `yarn_types.id`                               |
| `quantity_kg`      | numeric      | NOT NULL | `0`               | Quantidade em kg do fio nesta facção                        |
| `reference_month`  | text         | NOT NULL | —                 | Mês de referência no formato `YYYY-MM` (ex: `2026-02`)     |
| `observations`     | text         | NULL     | `NULL`            | Observações livres                                          |
| `created_at`       | timestamptz  | NOT NULL | `now()`           | Data de criação                                             |
| `updated_at`       | timestamptz  | NOT NULL | `now()`           | Última atualização                                          |

### Chave única composta
```sql
UNIQUE (company_id, outsource_company_id, yarn_type_id, reference_month)
```
Garante que só existe **um registro** por combinação de facção + fio + mês.

### Foreign Keys

| Coluna                 | Referência                    | ON DELETE    |
|------------------------|-------------------------------|-------------|
| `company_id`           | `companies.id`                | CASCADE     |
| `outsource_company_id` | `outsource_companies.id`      | CASCADE     |
| `yarn_type_id`         | `yarn_types.id`               | CASCADE     |

### Índices
```sql
CREATE INDEX idx_outsource_yarn_stock_company ON outsource_yarn_stock(company_id);
CREATE INDEX idx_outsource_yarn_stock_month ON outsource_yarn_stock(company_id, reference_month);
```

### RLS (Row Level Security)

```sql
ALTER TABLE outsource_yarn_stock ENABLE ROW LEVEL SECURITY;

-- SELECT: usuários autenticados podem ler registros da própria empresa
CREATE POLICY "Users can read own outsource_yarn_stock"
  ON outsource_yarn_stock FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

-- INSERT: usuários autenticados podem inserir na própria empresa
CREATE POLICY "Users can insert own outsource_yarn_stock"
  ON outsource_yarn_stock FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

-- UPDATE: usuários autenticados podem atualizar registros da própria empresa
CREATE POLICY "Users can update own outsource_yarn_stock"
  ON outsource_yarn_stock FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

-- DELETE: usuários autenticados podem excluir registros da própria empresa
CREATE POLICY "Users can delete own outsource_yarn_stock"
  ON outsource_yarn_stock FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());
```

---

## 📊 Migration SQL Completa

```sql
-- Tabela de estoque de fio em facções terceirizadas
CREATE TABLE public.outsource_yarn_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  outsource_company_id UUID NOT NULL REFERENCES outsource_companies(id) ON DELETE CASCADE,
  yarn_type_id UUID NOT NULL REFERENCES yarn_types(id) ON DELETE CASCADE,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  reference_month TEXT NOT NULL,
  observations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id, outsource_company_id, yarn_type_id, reference_month)
);

-- RLS
ALTER TABLE public.outsource_yarn_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own outsource_yarn_stock"
  ON public.outsource_yarn_stock FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- Índices
CREATE INDEX idx_outsource_yarn_stock_company ON public.outsource_yarn_stock(company_id);
CREATE INDEX idx_outsource_yarn_stock_month ON public.outsource_yarn_stock(company_id, reference_month);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_outsource_yarn_stock_updated_at
  BEFORE UPDATE ON public.outsource_yarn_stock
  FOR EACH ROW
  EXECUTE FUNCTION update_accounts_payable_updated_at();
```

> **Nota:** Reutiliza a função `update_accounts_payable_updated_at()` já existente no banco, que simplesmente faz `NEW.updated_at = now()`. Alternativamente, pode-se criar uma função genérica `update_updated_at()`.

---

## 🖥️ Layout da Tela (Aba "Estoque Fio Terceiros")

### KPIs no topo (3 cards):

| KPI                    | Valor                                         | Ícone sugerido   |
|------------------------|-----------------------------------------------|------------------|
| Total em Terceiros     | Soma de `quantity_kg` de todos os registros    | `Warehouse`      |
| Facções com Estoque    | Contagem distinta de `outsource_company_id`    | `Building2`      |
| Tipos de Fio           | Contagem distinta de `yarn_type_id`            | `Layers`         |

### Filtros:

| Filtro             | Tipo              | Opções                                              |
|--------------------|-------------------|------------------------------------------------------|
| **Mês Referência** | Select            | `Todos`, meses disponíveis (detectados dos dados)    |
| **Facção**         | SearchableSelect  | `Todos`, lista de `outsource_companies` da empresa   |
| **Tipo de Fio**    | SearchableSelect  | `Todos`, lista de `yarn_types` da empresa            |

- Botão "Limpar filtros" aparece quando algum filtro está ativo

### Tabela agrupada por Facção (Collapsible):

```
▼ Facção Leonardo
  ┌────────────────────────┬──────────────┬──────────────────────┐
  │ Tipo de Fio            │ Quantidade   │ Observações          │
  ├────────────────────────┼──────────────┼──────────────────────┤
  │ FIO 2/70/68            │ 3.941,4 kg   │                      │
  │ FIO 30/1 PENTEADO      │ 25.024,6 kg  │                      │
  │ FIO 150/48 PES         │ 1.377,0 kg   │                      │
  │ FIO 30/1 OE            │ 12.699,0 kg  │                      │
  ├────────────────────────┼──────────────┼──────────────────────┤
  │ TOTAL                  │ 43.042,1 kg  │                      │
  └────────────────────────┴──────────────┴──────────────────────┘

▼ Ricilon Malhas
  ┌────────────────────────┬──────────────┬──────────────────────┐
  │ Tipo de Fio            │ Quantidade   │ Observações          │
  ├────────────────────────┼──────────────┼──────────────────────┤
  │ FIO 150/48 PES         │ 1.296,0 kg   │                      │
  │ FIO 30/1 OE            │ 16.838,3 kg  │                      │
  ├────────────────────────┼──────────────┼──────────────────────┤
  │ TOTAL                  │ 18.134,3 kg  │                      │
  └────────────────────────┴──────────────┴──────────────────────┘

▶ GTI Malhas (clique para expandir)
```

### Ações por registro:

| Ação     | Ícone       | Descrição                                     |
|----------|-------------|-----------------------------------------------|
| Editar   | `Pencil`    | Abre modal para alterar quantidade/observações |
| Excluir  | `Trash2`    | Confirmação antes de deletar                   |

### Botão de ação principal:
- **"+ Adicionar Estoque"** (canto superior direito ou dentro do Card de filtros)
- Abre modal com campos: Facção, Tipo de Fio, Mês Referência, Quantidade (kg), Observações

---

## 🔧 Modal de Adicionar/Editar

### Campos do formulário:

| Campo           | Tipo              | Obrigatório | Validação                              |
|-----------------|-------------------|-------------|----------------------------------------|
| Facção          | SearchableSelect  | Sim         | Lista de `outsource_companies`         |
| Tipo de Fio     | SearchableSelect  | Sim         | Lista de `yarn_types`                  |
| Mês Referência  | Input (mês)       | Sim         | Formato `YYYY-MM`, default mês atual  |
| Quantidade (kg) | Input numérico    | Sim         | `> 0`, formatado pt-BR (ex: 1.234,56) |
| Observações     | Textarea          | Não         | Texto livre                            |

### Comportamento:
- Ao salvar, verifica se já existe registro para a combinação (facção + fio + mês)
  - Se existir → atualiza (`upsert`)
  - Se não existir → insere
- Após salvar, modal permanece aberto (preservando a Facção selecionada) para facilitar cadastro em lote
- Toast de confirmação "Estoque salvo com sucesso"
- Validação: impedir quantidade negativa

### Ordem de Tab:
```
Facção → Tipo de Fio → Mês Referência → Quantidade → Observações → Salvar
```

---

## 🔧 Implementação Frontend

### Dados necessários

**Já carregados via `useCompanyData`:**
- `outsource_companies` — ❌ **NÃO está** carregado atualmente no hook
- `yarn_types` — ❌ **NÃO está** carregado atualmente no hook

**Necessário adicionar ao `useCompanyData` ou fazer query direta:**
- Buscar `outsource_companies` filtrado por `company_id`
- Buscar `yarn_types` filtrado por `company_id`
- Buscar `outsource_yarn_stock` filtrado por `company_id`

> **Recomendação:** Como esses dados são usados apenas na aba de Estoque Fio Terceiros (e na página Invoices em geral), fazer queries diretas na página Invoices em vez de sobrecarregar o `useCompanyData` com mais dados.

### Queries Supabase

#### Carregar estoque:
```typescript
const { data: yarnStock } = await supabase
  .from('outsource_yarn_stock')
  .select('*')
  .eq('company_id', companyId)
  .order('reference_month', { ascending: false });
```

#### Carregar facções (outsource_companies):
```typescript
const { data: outsourceCompanies } = await supabase
  .from('outsource_companies')
  .select('id, name')
  .eq('company_id', companyId)
  .order('name');
```

#### Carregar tipos de fio (yarn_types):
```typescript
const { data: yarnTypes } = await supabase
  .from('yarn_types')
  .select('id, name')
  .eq('company_id', companyId)
  .order('name');
```

#### Upsert (salvar):
```typescript
const { error } = await supabase
  .from('outsource_yarn_stock')
  .upsert({
    company_id: companyId,
    outsource_company_id: selectedCompany,
    yarn_type_id: selectedYarnType,
    reference_month: selectedMonth,
    quantity_kg: quantity,
    observations: observations || null,
  }, {
    onConflict: 'company_id,outsource_company_id,yarn_type_id,reference_month'
  });
```

#### Deletar:
```typescript
const { error } = await supabase
  .from('outsource_yarn_stock')
  .delete()
  .eq('id', recordId);
```

### Estrutura de dados no frontend

```typescript
interface OutsourceYarnStockRecord {
  id: string;
  company_id: string;
  outsource_company_id: string;
  yarn_type_id: string;
  quantity_kg: number;
  reference_month: string;
  observations?: string;
  created_at: string;
  updated_at: string;
}

// Para renderizar agrupado por facção
interface OutsourceYarnStockGroup {
  outsourceCompanyId: string;
  outsourceCompanyName: string;
  items: Array<{
    id: string;
    yarnTypeId: string;
    yarnTypeName: string;
    quantityKg: number;
    referenceMonth: string;
    observations?: string;
  }>;
  totalKg: number;
}
```

### useMemo para agrupamento

```typescript
const stockGroups = useMemo(() => {
  const map = new Map<string, OutsourceYarnStockGroup>();

  for (const record of yarnStock) {
    // Aplicar filtros
    if (filterMonth !== 'all' && record.reference_month !== filterMonth) continue;
    if (filterCompany !== 'all' && record.outsource_company_id !== filterCompany) continue;
    if (filterYarnType !== 'all' && record.yarn_type_id !== filterYarnType) continue;

    const companyId = record.outsource_company_id;
    if (!map.has(companyId)) {
      const company = outsourceCompanies.find(c => c.id === companyId);
      map.set(companyId, {
        outsourceCompanyId: companyId,
        outsourceCompanyName: company?.name || 'Facção removida',
        items: [],
        totalKg: 0,
      });
    }

    const group = map.get(companyId)!;
    const yarnType = yarnTypes.find(y => y.id === record.yarn_type_id);
    group.items.push({
      id: record.id,
      yarnTypeId: record.yarn_type_id,
      yarnTypeName: yarnType?.name || 'Fio removido',
      quantityKg: Number(record.quantity_kg),
      referenceMonth: record.reference_month,
      observations: record.observations || undefined,
    });
    group.totalKg += Number(record.quantity_kg);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.outsourceCompanyName.localeCompare(b.outsourceCompanyName)
  );
}, [yarnStock, outsourceCompanies, yarnTypes, filterMonth, filterCompany, filterYarnType]);
```

---

## 🔗 Dependências

```
┌──────────────────────────────────┐
│  outsource_companies (já existe)  │
│  → id, name, company_id          │
│  → FK: outsource_yarn_stock      │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  outsource_yarn_stock (NOVA)      │
│  → outsource_company_id (FK)     │
│  → yarn_type_id (FK)             │
│  → quantity_kg, reference_month  │
└──────────▲───────────────────────┘
           │
┌──────────┴───────────────────────┐
│  yarn_types (já existe)           │
│  → id, name, company_id          │
│  → FK: outsource_yarn_stock      │
└──────────────────────────────────┘
```

### Tabelas envolvidas:

| Tabela                   | Status      | Uso                                    |
|--------------------------|-------------|----------------------------------------|
| `outsource_companies`    | ✅ Existe   | Lista de facções terceirizadas         |
| `yarn_types`             | ✅ Existe   | Lista de tipos de fio                  |
| `outsource_yarn_stock`   | ❌ NOVA     | Saldo de fio por facção por mês        |

---

## 📐 Padrão Visual

Seguir o padrão já estabelecido nas abas **Saldo de Fios** e **Estoque de Malha**:
- KPIs: 3 cards em grid `grid-cols-1 sm:grid-cols-3`
- Filtros: dentro de um Card com flex-wrap
- SearchableSelect para facção e tipo de fio (com lupa de busca)
- Collapsible: Card com trigger mostrando nome da facção + total kg
- Tabela: componente `Table` do shadcn/ui
- Cores: tokens semânticos (`text-foreground`, `text-destructive`, `text-muted-foreground`)
- Responsivo: cards empilhados em mobile, tabela com scroll horizontal

---

## 🔐 Permissões

| Role       | Acesso                              |
|------------|-------------------------------------|
| `admin`    | CRUD completo (ler, criar, editar, excluir) |
| `lider`    | Visualização apenas                 |
| `mecanico` | Sem acesso                          |
| `revisador`| Sem acesso                          |

Herda as mesmas permissões da página de Notas Fiscais (key `invoices` no `enabled_nav_items`).

> **Nota:** A RLS no banco não diferencia roles — o controle de escrita para líderes é feito no frontend (esconder botões de adicionar/editar/excluir para roles não-admin).

---

## 🔮 Integração com Fechamento Mensal (PDF)

### Seção no PDF: "Estoque de Fio por Facção"

Layout no PDF (uma página inteira):

```
╔═══════════════════════════════════════════════════════════════╗
║  ESTOQUE DE FIO EM TERCEIROS — FEVEREIRO/2026                ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ESTOQUE DE FINAL DE FIO — FACÇÃO LEONARDO                   ║
║  ┌──────────────────────────┬──────────────────┐             ║
║  │ Tipo de Fio              │ Quantidade (kg)   │             ║
║  ├──────────────────────────┼──────────────────┤             ║
║  │ FIO 2/70/68              │ 3.941,44         │             ║
║  │ FIO 30/1 PENTEADO        │ 25.024,61        │             ║
║  │ FIO 150/48 PES           │ 1.377,00         │             ║
║  │ FIO 30/1 OE              │ 12.699,00        │             ║
║  ├──────────────────────────┼──────────────────┤             ║
║  │ TOTAL                    │ 43.042,05        │             ║
║  └──────────────────────────┴──────────────────┘             ║
║                                                               ║
║  ESTOQUE DE FINAL DE FIO — RICILON MALHAS                    ║
║  ┌──────────────────────────┬──────────────────┐             ║
║  │ ...                      │ ...              │             ║
║  └──────────────────────────┴──────────────────┘             ║
║                                                               ║
║  TOTAL GERAL EM TERCEIROS: 132.457,35 kg                    ║
╚═══════════════════════════════════════════════════════════════╝
```

### Query para o PDF:
```typescript
// Buscar estoque do mês selecionado
const { data } = await supabase
  .from('outsource_yarn_stock')
  .select('*')
  .eq('company_id', companyId)
  .eq('reference_month', selectedMonth)
  .order('outsource_company_id')
  .order('yarn_type_id');
```

---

## 📋 Checklist de Implementação

### Fase 1: Migration (banco de dados)
- [ ] Criar tabela `outsource_yarn_stock` com todas as colunas
- [ ] Criar constraint UNIQUE composta
- [ ] Habilitar RLS e criar 4 políticas (SELECT, INSERT, UPDATE, DELETE)
- [ ] Criar índices
- [ ] Reutilizar trigger `update_accounts_payable_updated_at` para `updated_at`

### Fase 2: Frontend — Aba na página Invoices
- [ ] Adicionar aba "Estoque Fio Terceiros" na página Invoices
- [ ] Implementar queries diretas para `outsource_yarn_stock`, `outsource_companies`, `yarn_types`
- [ ] Renderizar KPIs (Total em Terceiros, Facções com Estoque, Tipos de Fio)
- [ ] Renderizar filtros (Mês, Facção, Tipo de Fio) com SearchableSelect
- [ ] Renderizar tabela agrupada por facção usando Collapsible
- [ ] Linha de TOTAL por facção (negrito)
- [ ] Botão "Limpar filtros"

### Fase 3: Frontend — Modal de Adicionar/Editar
- [ ] Modal com campos: Facção, Tipo de Fio, Mês Referência, Quantidade, Observações
- [ ] SearchableSelect para Facção e Tipo de Fio
- [ ] Validação: campos obrigatórios, quantidade > 0
- [ ] Upsert (duplicata = atualizar)
- [ ] Modal permanece aberto após salvar (preserva Facção)
- [ ] Toast de confirmação

### Fase 4: Frontend — Ações
- [ ] Botão editar (abre modal preenchido)
- [ ] Botão excluir (com confirmação)
- [ ] Esconder ações de escrita para roles não-admin

### Fase 5: Integração com Fechamento Mensal
- [ ] Seção "Estoque de Fio por Facção" no PDF
- [ ] Dados agrupados por facção → tipo de fio → quantidade
- [ ] Total por facção + Total geral

### Fase 6: Validação
- [ ] Testar CRUD completo (criar, ler, editar, excluir)
- [ ] Testar constraint UNIQUE (mesmo fio + facção + mês não duplica)
- [ ] Testar filtros (mês, facção, tipo de fio)
- [ ] Testar com múltiplas facções e fios
- [ ] Testar responsividade em mobile
- [ ] Testar permissões (admin vs líder vs outros roles)
- [ ] Validar RLS (um usuário não vê dados de outra empresa)

---

## 🧮 Diferença entre "Saldo de Fios" e "Estoque Fio Terceiros"

| Aspecto              | Saldo de Fios (saldofios.md)              | Estoque Fio Terceiros (este módulo)         |
|----------------------|-------------------------------------------|---------------------------------------------|
| **O que rastreia**   | Fio do CLIENTE na facção principal         | Fio da EMPRESA em facções terceirizadas     |
| **Cálculo**          | Automático (Recebido - Consumido - Vendido)| Manual (usuário informa o saldo)           |
| **Fonte dos dados**  | NFs entrada + produção + NFs venda_fio     | Tabela `outsource_yarn_stock`               |
| **Perspectiva**      | "Quanto fio do cliente eu ainda tenho?"    | "Quanto fio meu está em cada terceiro?"    |
| **Agrupamento**      | Por Cliente → Tipo de Fio                  | Por Facção → Tipo de Fio                   |
| **Precisa de NF?**   | Sim (NFs alimentam o cálculo)              | Não (entrada manual de saldo)              |
| **Tela**             | Aba "Saldo Fios" em Invoices               | Aba "Estoque Fio Terceiros" em Invoices    |

### Desconto automático via produção terceirizada
Desde 04/04/2026, ao registrar uma **produção terceirizada** (`outsource_productions`), o sistema **desconta automaticamente** o peso (kg) do estoque de fio da facção correspondente:

1. O artigo produzido possui um `yarn_type_id` vinculado
2. O sistema busca o registro em `outsource_yarn_stock` para a combinação: facção + tipo de fio + mês da produção
3. Se encontrar, deduz o `weight_kg` produzido do `quantity_kg` do estoque (mínimo 0)
4. Na edição, reverte a dedução antiga e aplica a nova
5. Na exclusão, devolve o peso ao estoque

**Requisito:** O artigo deve ter um tipo de fio vinculado (`yarn_type_id`) E deve existir um registro de estoque para aquele mês/facção/fio.

### Por que o cadastro inicial ainda é manual?
O estoque de fio em terceiros **ainda requer cadastro manual inicial** porque:
1. O envio de fio para terceiros geralmente **não gera NF no sistema** (pode ser feito por romaneio informal)
2. O terceiro pode devolver fio parcialmente ou consumir quantidades não previstas
3. O controle mais confiável é o **inventário periódico** — o usuário informa o saldo inicial

> **Fluxo completo:** Usuário cadastra o estoque inicial do mês → registra produções terceirizadas → sistema desconta automaticamente → saldo final reflete o consumo real.

---

*Documento criado em: 03/04/2026*
*Última atualização: 04/04/2026 (desconto automático via produção terceirizada)*
*Status: IMPLEMENTADO*
