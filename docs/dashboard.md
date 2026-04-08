# Dashboard — Documentação Completa (Snapshot 08/04/2026)

> **Objetivo**: registrar 100% do estado atual do Dashboard para possibilitar reversão caso futuras alterações não sejam satisfatórias.

---

## 1. Arquivo principal

`src/pages/Dashboard.tsx` — **775 linhas**

### 1.1 Imports e dependências

| Lib / módulo | Uso |
|---|---|
| `react` | useState, useMemo, useEffect |
| `react-router-dom` | useNavigate |
| `@/contexts/CompanyDataContext` | useSharedCompanyData — fonte de todos os dados |
| `@/types` | SHIFT_LABELS, SHIFT_MINUTES, ShiftType, getCompanyShiftMinutes, getCompanyShiftLabels |
| `@/components/ui/*` | Card, Select, Button, Calendar, Popover, Badge |
| `date-fns` + `ptBR` | format, subDays, differenceInCalendarDays |
| `lucide-react` | ~20 ícones (Package, Scale, DollarSign, Gauge, Clock, etc.) |
| `recharts` | Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend |
| `@/components/MachinePerformanceModal` | Modal "Ver Todas" máquinas |
| `@/hooks/usePermissions` | canSeeFinancial — controla visibilidade de campos financeiros |
| `@/lib/formatters` | formatNumber, formatCurrency, formatWeight, formatPercent |
| `@/lib/utils` | cn (classnames) |

---

## 2. Estado (State)

| State | Default | Descrição |
|---|---|---|
| `dayRange` | `15` | Período rápido (7, 15, 30, 0=todo) |
| `customDate` | `undefined` | Dia específico via calendário |
| `dateFrom` | `undefined` | Filtro "De" |
| `dateTo` | `undefined` | Filtro "Até" |
| `filterMonth` | `'all'` | Mês específico (yyyy-MM) |
| `filterShift` | `'all'` | Turno (manha/tarde/noite) |
| `filterClient` | `'all'` | Cliente |
| `filterArticle` | `'all'` | Artigo |
| `showAllMachines` | `false` | Controla modal MachinePerformanceModal |
| `nowTick` | `new Date()` | Atualizado a cada 1s para cronômetro de máquinas paradas |

---

## 3. Dados carregados via `useSharedCompanyData()`

- `getProductions()` → productions
- `getMachines()` → machines
- `getMachineLogs()` → allMachineLogs
- `getClients()` → clients
- `getArticles()` → articles
- `getWeavers()` → weavers
- `shiftSettings` → configurações de turno da empresa
- `loading` → boolean

---

## 4. Cálculos / Lógica de negócio

### 4.1 Turno atual (`getCurrentShift`)
```
hora >= 5 && < 13 → manha
hora >= 13 && < 22 → tarde
else → noite
```

### 4.2 Filtro de produções (`filtered`)
Prioridade de filtros de data:
1. `dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo` → **todo período**
2. `dateFrom || dateTo` → range customizado
3. `filterMonth !== 'all'` → mês específico
4. `customDate` → dia único
5. Fallback: `subDays(today, dayRange - 1)` até `today`

Depois aplica filtros adicionais sequencialmente:
- `filterShift` — filtra por turno
- `filterClient` — busca artigos do cliente, filtra produções por article_id
- `filterArticle` — filtra por article_id

### 4.3 KPIs principais

| KPI | Cálculo |
|---|---|
| **Rolos** (`totalRolls`) | `sum(filtered.rolls_produced)` |
| **Peso Total** (`totalWeight`) | `sum(filtered.weight_kg)` |
| **Faturamento** (`totalRevenue`) | `sum(filtered.revenue)` — só exibido se `canSeeFinancial` |
| **Eficiência** (`avgEfficiency`) | `avg(filtered.efficiency)` — média aritmética simples |
| **Meta de Eficiência** (`avgTargetEfficiency`) | Média ponderada do `target_efficiency` dos artigos usados nas produções filtradas (default 80%) |

### 4.4 Horas calendário (`calendarHours`)
Usado para calcular Kg/Hora e Faturamento/Hora.

- **Todo período**: conta apenas dias com produção efetiva (`uniqueDays`)
- **dateFrom + dateTo**: `differenceInCalendarDays + 1`
- **Mês atual**: conta apenas dias com produção
- **Mês passado**: total de dias do mês
- **Dia customizado**: 1 dia
- **dayRange**: usa o valor diretamente

Se `filterShift !== 'all'`: `dias × (shiftMinutes / 60)`
Senão: `dias × 24`

### 4.5 Produtividade
```
revenuePerHour = totalRevenue / calendarHours
kgPerHour = totalWeight / calendarHours
```

### 4.6 Produção por turno (`shiftData`)
Para cada turno (manha, tarde, noite):
- `rolls`: sum de rolls_produced
- `kg`: sum de weight_kg
- `revenue`: sum de revenue
- `label`: nome do turno sem horário

### 4.7 Top Máquinas (`machinePerf`)
Para cada máquina:
- Filtra produções por `machine_id` (ou `machine_name` se machine_id null)
- Calcula: rolls, kg, efficiency (média), targetEfficiency (média ponderada)
- Ordena por rolls DESC
- Limita top 5

### 4.8 Tendência (`trendData`)
Agrupa por data:
- `rolos`: sum
- `kg`: sum (arredondado 2 casas)
- `faturamento`: sum (arredondado 2 casas)
- `eficiencia`: média por dia (arredondado 1 casa)

Ordena por data ASC. Formato do eixo X: `dd/MM`.

### 4.9 Máquinas paradas (`stoppedMachines`)
- Filtra: `status !== 'ativa' && status !== 'inativa'`
- Para cada uma, busca o log aberto mais recente (`ended_at === null`)
- Calcula tempo decorrido em tempo real (tick a cada 1s)

### 4.10 Resumo do período (`periodSummary`)
Gera label textual do período ativo, ex: `01/01/2026 a 08/04/2026`

---

## 5. Layout / Estrutura visual

### 5.1 Hierarquia de containers
```
div.space-y-7.animate-fade-in
├── Header (título + botão "Limpar Filtros")
├── Card Filtros (shadow-material border-0)
├── Grid KPIs (1 col mobile → 2 sm → 3 ou 4 lg)
├── Grid Principal (1 col → 3 col xl)
│   ├── Left (xl:col-span-2)
│   │   ├── Gráfico Tendência (Area Chart)
│   │   └── Grid 2 cols (lg)
│   │       ├── Produção por Turno
│   │       └── Top Máquinas
│   └── Right Sidebar
│       ├── Produtividade/Hora
│       ├── Ações Rápidas
│       └── Status do Sistema
├── Máquinas Paradas (condicional)
└── MachinePerformanceModal
```

### 5.2 Classes CSS customizadas usadas
| Classe | Definição (index.css) |
|---|---|
| `page-title` | `text-2xl font-bold text-foreground tracking-tight` |
| `page-subtitle` | `text-sm text-muted-foreground font-light` |
| `shadow-material` | `0 2px 12px 0 hsl(0 0% 0% / 0.06)` |
| `btn-gradient` | gradient 135deg primary, font-semibold, shadow |
| `icon-box` | 48×48px, flex center, rounded-xl |
| `icon-box-dark` | gradient 135deg hsl(215 28% 18%) → hsl(215 28% 12%) |
| `icon-box-success` | gradient 135deg success |
| `icon-box-warning` | gradient 135deg warning |
| `icon-box-danger` | gradient 135deg destructive |
| `icon-box-primary` | gradient 135deg primary |
| `icon-box-info` | gradient 135deg info |
| `material-card-header` | rounded-xl, px-4 py-3, white text, -mt-6, mx-4, box-shadow |
| `animate-fade-in` | translateY(10px) → 0, opacity 0 → 1, 0.4s |

---

## 6. Componentes internos

### 6.1 `DashboardKpiCard` (componente local)

**Props:**
| Prop | Tipo | Descrição |
|---|---|---|
| `label` | string | Rótulo superior (uppercase, tracking-wider) |
| `value` | string | Valor principal (text-2xl, bold) |
| `previousValue` | number | Valor numérico do período anterior |
| `currentRaw` | number | Valor numérico atual (para cálculo de variação) |
| `borderColor` | string | Classe border-l (ex: border-l-primary) |
| `icon` | ReactNode | Ícone Lucide (h-5 w-5, text-muted-foreground) |
| `showComparison` | boolean | Se true, exibe badge ▲/▼ e "Anterior:" |
| `footer` | string | Texto inferior (11px, muted, font-light) |
| `formatPrev?` | (v: number) => string | Formatador customizado para valor anterior |
| `efficiencyValue?` | number | Se presente, aplica bg condicional no card |
| `targetEfficiency?` | number | Meta para colorir (default 80) |

**Lógica de variação:**
- `previousValue > 0` → `((currentRaw - previousValue) / previousValue) * 100`
- `previousValue === 0 && currentRaw > 0` → `+100%`
- Positivo → badge verde ▲, Negativo → badge vermelho ▼
- "Todo período" (`showComparison=false`) → sem badge/anterior

**Lógica de período anterior (mesma de FaturamentoTotal):**
- N dias → N dias anteriores
- Mês → mês anterior completo
- Dia específico → 7 dias antes
- Intervalo De/Até → mesmo intervalo deslocado
- Todo período → sem comparativo

**Estrutura:**
```
Card.border-l-4 [borderColor] [effBg]
  CardContent.p-5
    div.flex.items-start.justify-between
      div.min-w-0
        p.text-xs.font-medium.text-muted-foreground.uppercase.tracking-wider.mb-1 → label
        p.text-2xl.font-bold.text-foreground → value
        Badge.outline.text-[10px].mt-1 [success/destructive] → ▲/▼ variation%
        p.text-xs.text-muted-foreground.mt-1 → Anterior: {prevDisplay}
        p.text-[11px].text-muted-foreground.font-light.mt-1 → footer
      div.text-muted-foreground → icon
```

### 6.2 KPI Cards (grid responsivo)
| Card | Border Color | Ícone | Footer |
|---|---|---|---|
| Rolos | border-l-primary | Package | "{N} registros" |
| Peso Total | border-l-success | Scale | "{N} kg/hora" |
| Faturamento | border-l-warning | DollarSign | "{R$}/hora" |
| Eficiência | dinâmico* | Gauge | "Dentro/Abaixo da meta (X%)" |

*borderColor da eficiência:
- `>= avgTargetEfficiency` → border-l-success
- `>= avgTargetEfficiency - 10` → border-l-warning
- else → border-l-destructive

Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (ou `lg:grid-cols-3` se !canSeeFinancial)

### 7.3 Gráfico de Tendência
- Condição: `trendData.length > 1`
- Card com `material-card-header` flutuante (azul gradient: `hsl(210 100% 52%)` → `hsl(210 100% 38%)`)
- Título: "Tendência de Produção"
- Subtítulo: "Rolos, Kg, Faturamento e Eficiência por dia"
- Tipo: `AreaChart` (recharts)
- Altura: 300px
- 4 gradientes lineares para fill
- 2 eixos Y: left (valores), right (eficiência 0-100)
- Séries:
  - `rolos` → azul `hsl(210, 100%, 52%)`
  - `kg` → verde `hsl(142, 71%, 45%)`
  - `faturamento` → amarelo `hsl(38, 92%, 50%)` (condicional canSeeFinancial)
  - `eficiencia` → vermelho `hsl(0, 84%, 60%)` (eixo right)
- Tooltip: borderRadius 10px, border hsl(220, 15%, 90%), fontSize 12px
- Legend: bottom, altura 30, fontSize 11px

### 7.4 Produção por Turno
- Card `shadow-material border-0`
- Header: ícone ClipboardList + "Produção por Turno"
- Para cada turno (manha, tarde, noite):
  - Row com `p-3 rounded-xl bg-muted/40 hover:bg-muted/60`
  - Bolinha colorida: manha=warning, tarde=destructive, noite=primary
  - Nome do turno + "{N} rolos · {N} kg"
  - Valor do faturamento à direita (se canSeeFinancial)
- Total:
  - `bg-primary/5 border border-primary/10`
  - Bolinha `bg-foreground/60`
  - "Total" bold + totais

### 7.5 Top Máquinas
- Card `shadow-material border-0`
- Header: Factory icon + "Top Máquinas" + botão "Ver Todas" (ghost, text-primary)
- Top 5 máquinas por rolos produzidos
- Cada item: `p-3 rounded-xl bg-muted/40 hover:bg-muted/60`
  - Nome + "{N} rolos · {N} kg"
  - Badge de eficiência à direita:
    - `>= targetEfficiency` → `bg-success/10 text-success`
    - `>= targetEfficiency * 0.875` → `bg-warning/10 text-warning`
    - else → `bg-destructive/10 text-destructive`
    - Classes: `text-xs font-semibold px-3 py-1.5 rounded-lg`

### 7.6 Produtividade/Hora (sidebar)
- Header: Clock icon + "Produtividade/Hora"
- Faturamento/Hora (se canSeeFinancial): `bg-warning/5 border border-warning/10`, valor em `text-warning`
- Kg/Hora: `bg-muted/40`, valor em `text-foreground`

### 7.7 Ações Rápidas (sidebar)
- Botões ghost full-width:
  1. "Nova Produção" (Plus) → /production
  2. "Gerenciar Máquinas" (Settings2) → /machines
  3. "Ver Performance" (Eye) → /machines
  4. "Relatórios" (ChartIcon) → /reports
- Hover: `bg-primary/5 text-primary`
- Ícone: `text-muted-foreground mr-3`

### 7.8 Status do Sistema (sidebar)
- 4 itens estáticos:
  - Máquinas Ativas: `machines.filter(status === 'ativa').length`
  - Total de Clientes: `clients.length`
  - Artigos Cadastrados: `articles.length`
  - Registros de Produção: `formatNumber(productions.length)`
- Cada item: label muted + valor em `bg-muted px-3 py-1 rounded-lg`

### 7.9 Máquinas Paradas (condicional)
- Condição: `stoppedMachines.length > 0`
- Header: PauseCircle (text-warning) + "Máquinas Paradas ({N})"
- Descrição: "Máquinas fora de operação com tempo de parada em tempo real"
- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`
- Cada máquina:
  - Cores por status:
    - `manutencao_preventiva` → `text-warning bg-warning/10 border-warning/20`
    - `manutencao_corretiva` → `text-destructive bg-destructive/10 border-destructive/20`
    - `troca_artigo` → `text-info bg-info/10 border-info/20`
    - `troca_agulhas` → fallback `text-muted-foreground bg-muted border-border`
  - Ícones por status:
    - `manutencao_preventiva` → Wrench
    - `manutencao_corretiva` → AlertTriangle
    - `troca_artigo` → RefreshCw
  - Labels:
    - `manutencao_preventiva` → "Manutenção Preventiva"
    - `manutencao_corretiva` → "Manutenção Corretiva"
    - `troca_artigo` → "Troca de Artigo"
  - Cronômetro: `font-mono text-lg font-bold tracking-wider` formato `HH:MM:SS`

---

## 8. Modal: MachinePerformanceModal

Arquivo: `src/components/MachinePerformanceModal.tsx` — **392 linhas**

### Props
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  productions: Production[];
  clients: Client[];
  articles: Article[];
  shiftSettings?: CompanyShiftSettings;
}
```

### Funcionalidades
- Modal fullscreen (`max-w-[90vw] max-h-[90vh]`)
- Filtros próprios: dayRange (1,7,15,30,todo), dia, mês, ano, De/Até, turno, cliente, artigo, busca por nome
- Default: `dayRange=0` (todo período)
- Grid de cards: `grid-cols-1 sm:2 lg:3 xl:4`
- Cada card mostra: nome, status badge, eficiência centralizada (badge colorido), rolos, kg, faturamento, R$/hora, kg/hora
- Ordenação: nome alfabético (numérico pt-BR)

---

## 9. Permissões

- `canSeeFinancial` (hook `usePermissions`): controla exibição de:
  - KPI "Faturamento"
  - Coluna faturamento em "Produção por Turno"
  - Linha "Faturamento/Hora" em Produtividade
  - Série "faturamento" no gráfico de tendência
  - Grid muda de 4 para 3 colunas nos KPIs

---

## 10. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile (< 640px) | KPIs 1 col, filtros wrap, grid principal 1 col |
| sm (≥ 640px) | KPIs 2 cols, máquinas paradas 2 cols |
| lg (≥ 1024px) | KPIs 3-4 cols, turno+máquinas side-by-side, paradas 3 cols |
| xl (≥ 1280px) | Grid principal 3 cols (2+1 sidebar) |

---

## 11. Animações e transições

- Container principal: `animate-fade-in` (0.4s ease-out, translateY 10→0)
- Cards hover: `hover:bg-muted/60 transition-colors`
- Botões gradient: `hover: brightness(1.1), translateY(-1px), shadow expand`
- Cronômetro: tick a cada 1 segundo

---

## 12. Tokens de design utilizados

### Cores (variáveis CSS via Tailwind)
- `bg-background`, `text-foreground`
- `bg-card`, `text-card-foreground`
- `bg-muted`, `bg-muted/40`, `bg-muted/60`, `text-muted-foreground`
- `bg-primary`, `bg-primary/5`, `bg-primary/10`, `bg-primary/15`, `text-primary`
- `bg-success/10`, `text-success`
- `bg-warning`, `bg-warning/5`, `bg-warning/10`, `text-warning`
- `bg-destructive`, `bg-destructive/10`, `text-destructive`
- `bg-info/10`, `text-info`
- `border-border`, `border-border/50`, `border-primary/10`, `border-warning/20`, etc.
- Cores inline do gráfico (HSL hardcoded):
  - Azul: `hsl(210, 100%, 52%)` / `hsl(210, 100%, 38%)`
  - Verde: `hsl(142, 71%, 45%)`
  - Amarelo: `hsl(38, 92%, 50%)`
  - Vermelho: `hsl(0, 84%, 60%)`
  - Grid: `hsl(220, 15%, 92%)`
  - Texto eixos: `hsl(220, 9%, 55%)`

### Tipografia
- Títulos: `font-display` (Inter)
- KPI label: `text-[11px] font-medium`
- KPI valor: `text-lg font-display font-bold`
- KPI footer: `text-[11px] font-light`
- Nomes máquina: `text-sm font-medium`
- Cronômetro: `font-mono text-lg font-bold tracking-wider`

### Sombras
- `shadow-material` (cards principais)
- Material card header: `box-shadow: 0 4px 20px 0 hsl(0 0% 0% / 0.14), 0 7px 10px -5px hsl(0 0% 0% / 0.15)`

### Espaçamentos
- Container: `space-y-7`
- Cards internos: `space-y-2.5` ou `space-y-3`
- Grid gaps: `gap-4` (KPIs), `gap-6` (principal), `gap-3` (paradas)
- Padding cards: `p-4` ou `p-5`
- Padding itens lista: `p-3`
- Border-radius: `rounded-xl` (cards), `rounded-lg` (badges/buttons)

---

## 13. Formatadores (`src/lib/formatters.ts`)

| Função | Formato | Exemplo |
|---|---|---|
| `formatNumber(v, decimals)` | pt-BR locale | `1.234` / `1.234,50` |
| `formatCurrency(v)` | BRL currency | `R$ 1.234,56` |
| `formatWeight(v)` | number + " kg" | `1.234,5 kg` |
| `formatPercent(v)` | number(2) + "%" | `85,50%` |

---

## 14. Loading state

```tsx
if (loading) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-3 text-muted-foreground font-light">Carregando dados...</span>
    </div>
  );
}
```

---

## 15. Observações importantes

1. O gráfico de tendência só aparece se `trendData.length > 1`
2. A seção de máquinas paradas só aparece se `stoppedMachines.length > 0`
3. O filtro de mês inclui obrigatoriamente o mês vigente mesmo sem produções
4. Quando filtro "Todo período" + mês atual: calendarHours usa apenas dias com produção efetiva
5. O botão "Ver Todas" abre o MachinePerformanceModal com filtros independentes
6. O cronômetro de máquinas paradas reseta `nowTick` a cada 1s apenas se existem máquinas paradas
7. Navegação das ações rápidas usa `navigate(path)` — caminhos relativos ao slug da empresa (gerenciado pelo router)
