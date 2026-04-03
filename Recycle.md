# 📦 Vendas de Resíduos — Documentação do Módulo

> **Módulo para registro e controle de vendas de materiais residuais** (papelão, plástico, óleo sujo, etc.)

---

## 📌 Visão Geral

Este módulo gerencia a venda de materiais residuais gerados na produção têxtil. Permite cadastrar materiais com unidade de medida (kg ou unidade), registrar vendas com cliente, quantidade, preço e romaneio, e visualizar histórico com filtros avançados e exportação PDF.

- **Rota:** `/:slug/residuos`
- **Sidebar key:** `residuos`
- **Ícone:** `Recycle` (lucide-react)
- **Acesso:** Apenas `admin`

---

## 🗄️ Modelo de Dados

### Tabela `residue_materials`
Cadastro dos materiais disponíveis para venda.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | uuid (PK) | Sim | Auto-gerado |
| company_id | uuid | Sim | Empresa (RLS) |
| name | text | Sim | Nome do material (ex: Papelão, Plástico) |
| unit | text | Sim | Unidade de medida: `kg` ou `unidade` |
| default_price | numeric | Sim | Preço padrão por kg ou por unidade |
| created_at | timestamptz | Sim | Auto-gerado |

### Tabela `residue_sales`
Registros de vendas de materiais.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | uuid (PK) | Sim | Auto-gerado |
| company_id | uuid | Sim | Empresa (RLS) |
| material_id | uuid (FK) | Sim | Material vendido |
| material_name | text | Não | Nome do material (snapshot) |
| client_name | text | Sim | Nome do comprador |
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

### Página com 2 abas:

#### Aba 1 — Materiais (Cadastro)
- Card com listagem de materiais cadastrados
- Botão "+ Novo Material" abre dialog com:
  - Nome do material
  - Unidade de medida (Select: kg / Unidade)
  - Preço padrão (R$/kg ou R$/un)
- Ações: editar e excluir
- Sem paginação (geralmente poucos materiais)

#### Aba 2 — Registros de Venda
- **KPIs no topo:**
  - Total Vendido (R$)
  - Peso/Qtd Total
  - Nº de Registros
- **Filtros:**
  - Mês (Select dropdown)
  - Período De/Até (Calendar)
  - Busca textual (material, cliente, romaneio)
  - Botão "Limpar"
- **Formulário de registro (Dialog):**
  - Cliente (input texto)
  - Material (SearchableSelect dos cadastrados)
  - Quantidade (input dinâmico: "Peso (kg)" ou "Qtd (un)" conforme material)
  - Preço (pré-preenchido pelo cadastro, editável)
  - Nº Romaneio
  - Observações
  - Total (calculado automaticamente)
- **Listagem** com data/hora, material, cliente, quantidade, preço, total, romaneio
- **Exportação PDF** com design padrão do sistema

---

## 🔒 Segurança (RLS)

Ambas as tabelas usam `company_id = get_user_company_id()` para todas as operações (SELECT, INSERT, UPDATE, DELETE), garantindo isolamento multi-tenant.

---

## 📐 Padrões seguidos

- `sb()` helper para queries: `(supabase.from as any)(table)`
- `react-query` para cache e mutations
- Formatação BR: `formatCurrency()`, `formatNumber()`, `formatWeight()`
- Validação de data: `isDateValid()`, `getDateLimits()`
- Design: shadcn/ui + Tailwind tokens semânticos
- Exportação PDF: jsPDF com cabeçalho padrão (logo/empresa, título, data/hora, período)
