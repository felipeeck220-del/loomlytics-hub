# 🔍 Revisão — Documentação Completa

> Módulo de registro de defeitos/falhas de produção (`src/pages/Revision.tsx` — ~378 linhas)

---

## 📌 Visão Geral

O módulo **Revisão** registra falhas de qualidade encontradas na revisão de malha, permitindo rastrear defeitos por tecelão, máquina e artigo.

- **Rota:** `/:slug/revision`
- **Acesso:** `admin`, `lider`, `revisador`
- **Arquivo:** `src/pages/Revision.tsx`

---

## 🗄️ Modelo de Dados

### Tabela `defect_records`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | Auto-gerado |
| company_id | uuid | Empresa (RLS) |
| date | text | Data (yyyy-MM-dd) |
| shift | text | Turno: manha/tarde/noite |
| machine_id | uuid? | Máquina |
| machine_name | text? | Nome snapshot |
| article_id | uuid? | Artigo |
| article_name | text? | Nome snapshot |
| weaver_id | uuid? | Tecelão |
| weaver_name | text? | Nome snapshot |
| measure_type | text | Tipo de medida: `kg` ou `metro` |
| measure_value | numeric | Valor da medida |
| observations | text? | Observações (prefixado com nome do defeito) |
| created_by_name | text? | Quem registrou |
| created_by_code | text? | Código (#ID) |
| created_at | timestamptz | Auto-gerado |

**RLS:** `company_id = get_user_company_id()`.

---

## 🏗️ Interface

### KPI Cards (3 cards)
| Card | Ícone | Cálculo |
|------|-------|---------|
| Total de Falhas | AlertTriangle (destructive) | `filtered.length` |
| Total em Kg | Scale (warning) | `sum(measure_value) where measure_type = 'kg'` |
| Total em Metros | Ruler (info) | `sum(measure_value) where measure_type = 'metro'` |

### Filtros
- **Data** — Calendar picker (default: hoje)
- **Busca** — Por máquina, artigo ou tecelão

### Listagem (Table)
| Coluna | Descrição |
|--------|-----------|
| Data/Hora | dd/MM/yyyy HH:mm + autor "Nome #Código" |
| Turno | Badge com label do turno |
| Máquina | Nome |
| Artigo | Nome |
| Tecelão | Nome |
| Medida | Valor + unidade (kg ou m) |
| Observações | Texto (inclui nome do defeito) |
| Ações | Botão Excluir |

---

## 📊 Lógica de Negócio

### Formulário de Registro

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Data | Calendar | ✅ |
| Turno | Select (3 opções) | ✅ |
| Máquina | Select (side=bottom) | ✅ |
| Tecelão | Select (side=bottom, autoFocus busca) | ✅ |
| Artigo | Select (side=bottom, autoFocus busca, exibe `nome (cliente)`) | ✅ |
| Defeito | Input text | ✅ |
| Tipo de Medida | Select (kg/metro) | ✅ |
| Valor | Input number | ✅ |
| Observações | Input text | ❌ |

### Padrão de exibição de artigo
- Seletor de artigo exibe: `NomeArtigo (NomeCliente)` quando o artigo possui cliente associado
- Busca filtra por nome do artigo **e** nome do cliente
- **Este padrão deve ser aplicado em todo modal do sistema que tenha seletor de artigo**

### Salvamento
- `observations` = `[defect_name] observações` (prefixo com nome do defeito)
- Campos de autoria: `created_by_name`, `created_by_code`
- `addDefectRecords([record])` — insert incremental

### Edição
- Botão lápis em cada linha da tabela
- Abre modal preenchido com dados existentes
- `updateDefectRecords(record)` — update por id

### Exclusão
- Confirmação: digitação de "EXCLUIR"
- `deleteDefectRecords([id])`

---

## 📝 Auditoria

| Ação | Dados |
|------|-------|
| `defect_create` | machine, article, date, shift |
| `defect_update` | machine, article, date, shift |
| `defect_delete` | machine, date |

---

## 🔗 Dependências

| Hook | Uso |
|------|-----|
| `useSharedCompanyData()` | machines, weavers, articles, defectRecords, addDefectRecords, updateDefectRecords, deleteDefectRecords |
| `useAuditLog()` | logAction, userName, userCode |

---

*Última atualização: 11/04/2026*
