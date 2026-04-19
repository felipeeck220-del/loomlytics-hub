# 🔧 Mecânica — Documentação Completa

> **Status:** ✅ **Em Produção** — manutenções preventivas e troca de agulheiro


> Módulo de acompanhamento de manutenções (`src/pages/Mecanica.tsx` — ~621 linhas)

---

## 📌 Visão Geral

O módulo **Mecânica** oferece uma visão consolidada de manutenções com calendário, detalhes por máquina e histórico — projetado para mecânicos e administradores acompanharem o ciclo de manutenção.

- **Rota:** `/:slug/mecanica`
- **Acesso:** `admin`, `lider`, `mecanico`
- **Arquivo:** `src/pages/Mecanica.tsx`

---

## 🗄️ Dados Utilizados

Não possui tabela própria — utiliza:
- `machines` — lista de máquinas ativas
- `machine_logs` — histórico de status (filtrado por status de manutenção)
- `productions` — para cálculo de receita/peso entre manutenções

### Status de Manutenção Filtrados
```typescript
const MAINTENANCE_STATUSES = [
  'manutencao_preventiva',
  'manutencao_corretiva',
  'troca_artigo',
  'troca_agulhas',
];
```

---

## 🏗️ Estrutura da Página

### Abas (Tabs)
1. **Calendário** — Visualização mensal de manutenções
2. **Detalhes** — Visão por máquina com dados desde última manutenção
3. **Histórico** — Timeline de manutenções de uma máquina específica

### Filtro Global
- **Máquina:** Select (Todas ou máquina específica)

---

## 📅 Aba Calendário

### Layout
- Calendário mensal com navegação (← mês/mês →)
- Dias com manutenções marcados com bolinhas coloridas
- Clique no dia → exibe logs do dia abaixo

### Cores por Status no Calendário
Bolinha no dia:
- `manutencao_preventiva` → warning
- `manutencao_corretiva` → destructive
- `troca_artigo` → info
- `troca_agulhas` → purple

### Detalhes do Dia Selecionado
- Lista de logs com: máquina, status (badge), início, fim, quem iniciou/finalizou
- Se máquina específica filtrada, mostra apenas dela

---

## 📋 Aba Detalhes

### Visão por Máquina
Para cada máquina ativa, calcula:

| Dado | Cálculo |
|------|---------|
| Última Preventiva | `machine_logs` mais recente com status `manutencao_preventiva` |
| Última Troca Agulheiro | `machine_logs` mais recente com status `troca_agulhas` |
| Receita desde Preventiva | `sum(productions.revenue)` desde fim da última preventiva |
| Peso desde Preventiva | `sum(productions.weight_kg)` desde fim da última preventiva |
| Receita desde Agulheiro | `sum(productions.revenue)` desde fim da última troca agulheiro |
| Peso desde Agulheiro | `sum(productions.weight_kg)` desde fim da última troca agulheiro |

### Finalidade
Permite ao administrador saber quanto cada máquina "faturou" desde a última manutenção, ajudando a planejar a próxima parada.

### Busca
Input para filtrar máquinas por nome.

---

## 📜 Aba Histórico

### Funcionamento
1. Seleção de máquina → abre histórico
2. Lista todos os logs de `manutencao_preventiva` e `troca_agulhas`
3. Para cada log, calcula receita/peso no período entre manutenções

### Período calculado
- **De:** fim da manutenção anterior do mesmo tipo
- **Até:** início da manutenção atual
- Se não há manutenção anterior → desde o início (2000-01-01)

---

## ➕ Registro Manual de Manutenção

### Modal "Adicionar Registro"
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Máquina | Select | ✅ |
| Tipo | Select (4 status) | ✅ |
| Data Início | date | ✅ |
| Hora Início | time | ✅ |
| Data Fim | date | ✅ |
| Hora Fim | time | ✅ |

- Validação de datas (isDateValid)
- Cria `MachineLog` com `started_by`/`ended_by` preenchidos
- `saveMachineLogs(allLogs)` — upsert
- `logAction('maintenance_manual_add')`

---

## 📝 Auditoria

| Ação | Dados |
|------|-------|
| `maintenance_manual_add` | machine, status, started_at, ended_at |

---

## 🔗 Dependências

| Hook | Uso |
|------|-----|
| `useSharedCompanyData()` | machines, machineLogs, productions, saveMachineLogs |
| `useAuditLog()` | logAction, userName, userCode |
| `usePermissions()` | canSeeFinancial |

---

## 🎨 Tokens de Design

| Token | Uso |
|-------|-----|
| `card-glass` | Cards de detalhes por máquina |
| `bg-warning/10` | Badge preventiva |
| `bg-destructive/10` | Badge corretiva |
| `bg-info/10` | Badge troca artigo |
| `bg-purple-500/10` | Badge troca agulheiro |

---

*Última atualização: 09/04/2026*
