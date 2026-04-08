# 📦 Vendas de Resíduos — Documentação do Módulo

> **Módulo para registro e controle de vendas de materiais residuais** (papelão, plástico, óleo sujo, etc.)
> **Modelo cliente-cêntrico:** o preço é definido por cliente, não por material.

---

## 📌 Visão Geral

Este módulo gerencia a venda de materiais residuais gerados na produção têxtil. O modelo é **cliente-cêntrico**: cada cliente de resíduos tem seus próprios materiais e preços negociados. Ao registrar uma venda, seleciona-se o cliente primeiro e os materiais/preços são filtrados automaticamente.

- **Rota:** `/:slug/residuos`
- **Sidebar key:** `residuos`
- **Ícone:** `Recycle` (lucide-react)
- **Acesso:** Apenas `admin`

---

## 🗄️ Modelo de Dados

### Tabela `residue_materials`
Catálogo simples de materiais (sem preço — preço é por cliente).

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | uuid (PK) | Sim | Auto-gerado |
| company_id | uuid | Sim | Empresa (RLS) |
| name | text | Sim | Nome do material (ex: Papelão, Plástico) |
| unit | text | Sim | Unidade de medida: `kg` ou `unidade` |
| default_price | numeric | Sim | Preço legado (não usado na UI — mantido por compatibilidade) |
| created_at | timestamptz | Sim | Auto-gerado |

### Tabela `residue_clients`
Cadastro de compradores de resíduos.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | uuid (PK) | Sim | Auto-gerado |
| company_id | uuid | Sim | Empresa (RLS) |
| name | text | Sim | Nome do cliente/comprador |
| created_at | timestamptz | Sim | Auto-gerado |

### Tabela `residue_client_prices`
Tabela de preços: cada cliente tem materiais com preços específicos.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | uuid (PK) | Sim | Auto-gerado |
| company_id | uuid | Sim | Empresa (RLS) |
| client_id | uuid (FK) | Sim | Referência a `residue_clients` |
| material_id | uuid (FK) | Sim | Referência a `residue_materials` |
| unit_price | numeric | Sim | Preço negociado para este material neste cliente |
| created_at | timestamptz | Sim | Auto-gerado |

**Constraint UNIQUE:** `(client_id, material_id)` — cada material aparece no máximo uma vez por cliente.

### Tabela `residue_sales`
Registros de vendas de materiais.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | uuid (PK) | Sim | Auto-gerado |
| company_id | uuid | Sim | Empresa (RLS) |
| client_id | uuid (FK) | Não | Referência a `residue_clients` (novo) |
| material_id | uuid (FK) | Sim | Material vendido |
| material_name | text | Não | Nome do material (snapshot) |
| client_name | text | Sim | Nome do comprador (snapshot) |
| date | text | Sim | Data da venda (yyyy-MM-dd) |
| quantity | numeric | Sim | Quantidade (kg ou unidades) |
| unit | text | Sim | Unidade de medida (`kg` ou `unidade`) |
| unit_price | numeric | Sim | Preço por kg ou por unidade |
| total | numeric | Sim | Valor total (quantity × unit_price) |
| romaneio | text | Não | Número do romaneio |
| observations | text | Não | Observações |
| created_at | timestamptz | Sim | Auto-gerado |

---

## 🎨 Interface (UI)

### Página com 3 abas:

#### Aba 1 — Registros de Venda (default)
- **KPIs no topo:** Total Vendido (R$), Peso/Qtd Total, Nº de Registros
- **Filtros:** Mês, Período De/Até, Busca textual, Botão "Limpar"
- **Formulário de registro (Dialog):**
  - Cliente (SearchableSelect dos clientes cadastrados)
  - Material (SearchableSelect filtrado pelos materiais do cliente selecionado)
  - Quantidade, Preço (pré-preenchido do cadastro, editável), Romaneio, Observações
  - Total calculado automaticamente
- **Listagem** com data/hora, material, cliente, quantidade, preço, total, romaneio
- **Exportação PDF** com design padrão do sistema

#### Aba 2 — Clientes
- Card com listagem de clientes cadastrados
- Botão "+ Novo Cliente" abre dialog com nome
- Ao clicar no cliente, expande para mostrar os materiais/preços vinculados
- Para cada cliente: adicionar material (do catálogo) com preço
- Ações: editar nome, excluir cliente, editar/remover preço de material

#### Aba 3 — Materiais (Catálogo)
- Cadastro simples de materiais (nome + unidade de medida)
- Sem preço (preço é por cliente)
- Ações: editar e excluir

---

## 🔒 Segurança (RLS)

Todas as tabelas usam `company_id = get_user_company_id()` para todas as operações (SELECT, INSERT, UPDATE, DELETE), garantindo isolamento multi-tenant.

---

## 📐 Padrões seguidos

- `sb()` helper para queries: `(supabase.from as any)(table)`
- `react-query` para cache e mutations
- Formatação BR: `formatCurrency()`, `formatNumber()`, `formatWeight()`
- Validação de data: `isDateValid()`, `getDateLimits()`
- Design: shadcn/ui + Tailwind tokens semânticos
- Exportação PDF: **segue padrão global** definido em `mestre.md`
