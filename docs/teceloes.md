# 👷 Tecelões — Documentação Completa

> **Status:** ✅ **Em Produção** — cadastro e ranking de tecelões


> Módulo de gestão de tecelões (`src/pages/Weavers.tsx` — ~605 linhas)

---

## 📌 Visão Geral

O módulo **Tecelões** gerencia os operadores das máquinas (teares). Cada tecelão tem um código único e pode ter turno fixo ou horário específico.

- **Rota:** `/:slug/weavers`
- **Acesso:** `admin`, `lider`
- **Arquivo:** `src/pages/Weavers.tsx`

---

## 🗄️ Modelo de Dados

### Tabela `weavers`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | Auto-gerado |
| company_id | uuid | Empresa (RLS) |
| code | text | Código único (#100 a #999) |
| name | text | Nome do tecelão |
| phone | text? | Telefone |
| shift_type | text | `fixo` ou `especifico` |
| fixed_shift | text? | Turno fixo: manha/tarde/noite |
| start_time | text? | Hora início (HH:MM) — turno específico |
| end_time | text? | Hora fim (HH:MM) — turno específico |
| created_at | timestamptz | Auto-gerado |

**RLS:** `company_id = get_user_company_id()`.

---

## 🏗️ Estrutura da Página

### Abas (Tabs)
1. **Tecelões** — CRUD com cards por turno
2. **Falhas** — Resumo de defeitos por tecelão (dados de `defect_records`)
3. **Relatórios** — Performance por tecelão (dados de `productions`)

### Aba Tecelões

**Summary Cards (grid 2/4 cols):**
- Total de tecelões
- Turno Fixo (contagem)
- Horário Específico (contagem)
- (cards por turno: Manhã, Tarde, Noite)

**Seções por turno:**
- Manhã — tecelões com `fixed_shift === 'manha'`
- Tarde — tecelões com `fixed_shift === 'tarde'`
- Noite — tecelões com `fixed_shift === 'noite'`
- Horário Específico — tecelões com `shift_type === 'especifico'`

**Cada card de tecelão:**
- Nome + Código (#badge)
- Telefone ou "Sem telefone"
- Badge turno/horário
- Botões: Editar, Excluir

### Aba Falhas
- Grid com cards por tecelão
- Dados de `defect_records` agrupados por tecelão
- KPIs: Total defeitos, Kg total, Metros total
- Filtros por período (mês, De/Até)

### Aba Relatórios
- Performance individual: rolos, kg, eficiência, faturamento
- Gráfico comparativo entre tecelões
- Filtros por período
- Exportação PDF

---

## 📊 Lógica de Negócio

### Código Automático
```typescript
const generateCode = () => {
  let code = 100;
  while (existingCodes.includes(code) && code <= 999) code++;
  return `#${code}`;
};
```
Códigos de #100 a #999 (IDs #1-#50 reservados para admins no módulo Settings).

### Tipos de Turno

| Tipo | Comportamento | Uso na Produção |
|------|---------------|-----------------|
| `fixo` | Trabalha sempre no mesmo turno | Aparece se `fixed_shift === turnoSelecionado` |
| `especifico` | Horário customizado | Aparece se horário está dentro do turno |

### Exclusão
- Confirmação por digitação: "EXCLUIR"
- `saveWeavers(filtered)` — remove do array e salva

---

## 📝 Auditoria

| Ação | Dados |
|------|-------|
| `weaver_create` | name, code, shift_type |
| `weaver_update` | name, code, shift_type |
| `weaver_delete` | name, code |

---

## 🔗 Dependências

| Hook | Uso |
|------|-----|
| `useSharedCompanyData()` | getWeavers, saveWeavers, getProductions, getDefectRecords |
| `usePermissions()` | canSeeFinancial |
| `useAuditLog()` | logAction |

---

## 🎨 Tokens de Design

| Token | Uso |
|-------|-----|
| `card-glass` | Container por turno |
| `btn-gradient` | Botão "Novo Tecelão" |
| `font-display` | Nomes e valores |
| `text-primary` | Código do tecelão |

---

*Última atualização: 09/04/2026*
