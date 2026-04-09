# 🧵 Produção — Documentação Completa

> Módulo de registro de produção diária (`src/pages/Production.tsx` — ~1156 linhas)

---

## 📌 Visão Geral

O módulo **Produção** é o coração do sistema — registra a produção diária de cada máquina por turno, calculando automaticamente peso, faturamento e eficiência.

- **Rota:** `/:slug/production`
- **Acesso:** Apenas `admin`
- **Arquivo:** `src/pages/Production.tsx`

---

## 🗄️ Modelo de Dados

### Tabela `productions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | Auto-gerado |
| company_id | uuid | Empresa (RLS) |
| date | text | Data (yyyy-MM-dd) |
| shift | text | Turno: manha/tarde/noite |
| machine_id | uuid? | Máquina |
| machine_name | text? | Nome snapshot |
| weaver_id | uuid? | Tecelão |
| weaver_name | text? | Nome snapshot |
| article_id | uuid? | Artigo |
| article_name | text? | Nome snapshot |
| rpm | integer | RPM da máquina |
| rolls_produced | numeric | Rolos (ou equivalente em voltas) |
| weight_kg | numeric | Peso total (kg) |
| revenue | numeric | Faturamento (R$) |
| efficiency | numeric | Eficiência (%) |
| created_by_name | text? | Quem registrou |
| created_by_code | text? | Código (#ID) |
| created_at | timestamptz | Data/hora de criação |

**RLS:** `company_id = get_user_company_id()` para todas as operações.

---

## 🏗️ Estado da Página

| State | Tipo | Descrição |
|-------|------|-----------|
| `filterDate` | string | Data ativa (yyyy-MM-dd), default = última produção |
| `filterMachine` | string | Filtro por máquina |
| `filterArticle` | string | Filtro por artigo |
| `searchQuery` | string | Busca textual |
| `activeShift` | ShiftType | Aba de turno ativa |
| `showModal` | boolean | Modal de registro |
| `editing` | Production \| null | Produção em edição |
| `saving` | boolean | Estado de salvamento |
| `saveQueue` | SaveQueueItem[] | Fila de salvamento por máquina |
| `expandedId` | string \| null | Produção expandida na listagem |
| `showDelete` | Production \| null | Produção para exclusão |
| `showFilters` | boolean | Visibilidade dos filtros |

### Formulário

```typescript
form: {
  date: Date,
  shift: ShiftType | '',
  machine_id: string,
  weaver_id: string,
  article_id: string,
  rpm: string,
  rolls: string,
  voltas_inicio: string,  // Modo voltas
  voltas_fim: string,     // Modo voltas
}
```

### Extra Articles (Split-shift)

```typescript
extraArticles: Array<{ article_id: string; rolls: string; search: string }>
```
Permite registrar múltiplos artigos na mesma máquina/turno (ex: troca de artigo no meio do turno).

---

## 📊 Cálculos

### Modo Rolos
```
peso_kg = rolls × article.weight_per_roll
faturamento = peso_kg × article.value_per_kg
eficiência = (rolls × turns_per_roll) / (RPM × minutos_do_turno) × 100
```

### Modo Voltas
```
total_voltas = voltas_fim - voltas_inicio
turns_per_roll = article_machine_turns[article+machine] || article.turns_per_roll
rolls = total_voltas / turns_per_roll
peso_kg = rolls × article.weight_per_roll
faturamento = peso_kg × article.value_per_kg
eficiência = total_voltas / (RPM × minutos_do_turno) × 100
```

### Extra Articles (múltiplos artigos no turno)
- Cada artigo extra contribui com suas voltas produzidas
- Eficiência total = soma_voltas_todos_artigos / (RPM × minutos)

### Desconto de Downtime
- `calculateShiftDowntime()` (de `downtimeUtils.ts`) calcula minutos de parada da máquina no turno
- `effectiveShiftMinutes = totalShiftMinutes - downtimeMinutes`
- Melhora a eficiência ao descontar tempo parado do denominador

---

## 🔄 Fluxo de Registro

1. Selecionar **data** (Calendar, default = última produção)
2. Selecionar **turno** (tabs: Manhã/Tarde/Noite)
3. Selecionar **máquina** → auto-preenche artigo vinculado + RPM
4. Selecionar **tecelão** (filtrado por turno)
5. Informar **rolos** OU **voltas início/fim** (conforme `production_mode`)
6. Sistema calcula e exibe preview (peso, faturamento, eficiência)
7. Salvar → `addProductions()` (insert incremental)

### Avanço Automático

Após salvar (modo novo registro), o modal avança automaticamente:
- Mesmo máquina → próximo turno
- Todos os turnos concluídos → próxima máquina, primeiro turno

### Save Queue

Salvamentos são enfileirados e processados sequencialmente. Status visual:
- `saving` → Loader animado
- `done` → Check verde
- `error` → Alerta vermelho

---

## 📋 Listagem

### Organização
- **Tabs por turno** (Manhã/Tarde/Noite)
- Filtro por data (Calendar)
- Filtros opcionais: máquina, artigo, busca

### Cada registro exibe
- Máquina, Artigo, Tecelão
- Rolos, Peso (kg), Faturamento (se admin)
- Eficiência (badge colorido vs meta)
- Autoria: "Nome #Código"
- Botões: Editar, Excluir

### Exclusão
- Confirmação com botão "Confirmar" (sem digitação)
- `deleteProductions([id])`
- `logAction('production_delete')`

---

## 🔗 Dependências

| Hook/Context | Uso |
|---|---|
| `useSharedCompanyData()` | Dados, addProductions, updateProductions, deleteProductions |
| `useAuditLog()` | logAction, userName, userCode |
| `usePermissions()` | canSeeFinancial |

### Dados utilizados
- `productions` — registros existentes
- `machines` — lista de máquinas (ordenadas por number)
- `weavers` — tecelões (filtrados por turno)
- `articles` — artigos
- `articleMachineTurns` — voltas específicas por máquina
- `machineLogs` — logs para cálculo de downtime
- `shiftSettings` — configurações de turno da empresa

---

## 📝 Auditoria

| Ação | Dados |
|------|-------|
| `production_create` | machine, date, shift, rolls, weight_kg |
| `production_update` | machine, date, shift, old/new values |
| `production_delete` | machine, date, shift |

---

## 🎨 Tokens de Design

| Token/Classe | Uso |
|---|---|
| `animate-fade-in` | Animação de entrada |
| `card-glass` | Cards de listagem |
| `btn-gradient` | Botão "Registrar Produção" |
| `text-foreground` | Valores principais |
| `text-muted-foreground` | Labels, subtítulos |
| `font-display` | Títulos, nomes |
| `text-destructive` | Eficiência abaixo da meta |
| `text-success` | Eficiência acima da meta |
| `text-warning` | Eficiência próxima da meta |

---

*Última atualização: 09/04/2026*
