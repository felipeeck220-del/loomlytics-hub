# 📊 FATURAMENTO TOTAL — Documentação Completa

> **Status:** ✅ IMPLEMENTADO
> **Arquivo:** `src/pages/FaturamentoTotal.tsx`
> **Rota:** `/:slug/faturamento-total`
> **Acesso:** Somente `admin`
> **Sidebar:** Item "Faturamento Total" com ícone `DollarSign`

---

## 📌 Objetivo

Página consolidada que reúne o **faturamento de todas as fontes de receita** do sistema em uma única visão, permitindo ao administrador acompanhar a saúde financeira geral da empresa com comparativos temporais automáticos.

---

## 🗂️ Fontes de Receita

| # | Fonte | Tabela Supabase | Campo de Valor | Campo de Data | Ícone | Cor do Card |
|---|-------|-----------------|----------------|---------------|-------|-------------|
| 1 | **Malhas (Produção)** | `productions` | `revenue` | `date` (text yyyy-MM-dd) | `Package` | `border-l-primary` |
| 2 | **Terceirizado** | `outsource_productions` | `total_revenue` | `date` (text yyyy-MM-dd) | `Factory` | `border-l-accent` |
| 3 | **Resíduos** | `residue_sales` | `total` | `date` (text yyyy-MM-dd) | `Recycle` | `border-l-warning` |
| 4 | **Total Geral** | — (soma dos 3) | — | — | `DollarSign` | `border-l-success` |

### Busca de Dados

- Usar `fetchAllPaginated<T>()` para cada tabela (mesmo padrão de `Invoices.tsx` e `Outsource.tsx`)
- 3 queries paralelas via `Promise.all` no carregamento
- Filtrar por `company_id` via RLS automático
- Ordenação por `date` descendente para consistência

```typescript
const [productions, outsourceProductions, residueSales] = await Promise.all([
  fetchAllPaginated<Production>('productions', companyId, 'date', false),
  fetchAllPaginated<OutsourceProduction>('outsource_productions', companyId, 'date', false),
  fetchAllPaginated<ResidueSale>('residue_sales', companyId, 'date', false),
]);
```

---

## 🔍 Filtros de Data

### Controles (idênticos ao Dashboard/Relatórios, sem turno/cliente/artigo/máquina)

| Controle | Tipo | Comportamento |
|----------|------|---------------|
| **7 dias** | Button | `setDayRange(7)`, limpa demais filtros |
| **15 dias** | Button (default) | `setDayRange(15)`, limpa demais filtros |
| **30 dias** | Button | `setDayRange(30)`, limpa demais filtros |
| **Todo período** | Button | `setDayRange(0)`, limpa demais filtros |
| **Escolher dia** | Popover Calendar | `setCustomDate(d)`, limpa mês e intervalo |
| **Mês** | Select | `setFilterMonth(v)`, limpa customDate e intervalo |
| **De** | Popover Calendar | `setDateFrom(d)`, limpa mês e customDate |
| **Até** | Popover Calendar | `setDateTo(d)`, limpa mês e customDate |
| **Limpar Filtros** | Button (condicional) | Reseta tudo para default (15 dias) |

### Estados de Filtro

```typescript
const [dayRange, setDayRange] = useState(15);
const [customDate, setCustomDate] = useState<Date | undefined>();
const [filterMonth, setFilterMonth] = useState('all');
const [dateFrom, setDateFrom] = useState<Date | undefined>();
const [dateTo, setDateTo] = useState<Date | undefined>();
```

### Lógica de Filtragem (mesma prioridade do Dashboard — documentada no mestre.md)

```
1. Todo período (dayRange=0, sem outros filtros) → sem filtro de data
2. Intervalo customizado (dateFrom / dateTo) → filtra por range
3. Mês específico (filterMonth !== 'all') → filtra por mês
4. Data específica (customDate) → filtra por dia
5. Últimos N dias (fallback) → subDays(today, dayRange - 1) a today
```

A mesma lógica é aplicada **simultaneamente** às 3 tabelas usando o campo `date` de cada uma.

### Meses Disponíveis

- Extraídos de **todas as 3 tabelas** combinadas: `productions.map(p => p.date.substring(0, 7))` + `outsourceProductions.map(...)` + `residueSales.map(...)`
- Sempre inclui mês atual
- Ordenado reverso (mais recente primeiro)
- Deduplica com `Set`

---

## 📊 Cards de KPI (4 cards em grid)

### Layout

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  🧵 Malhas      │  🏭 Terceirizado│  ♻️ Resíduos    │  💰 Total Geral │
│  R$ 45.230,00   │  R$ 12.800,00   │  R$ 3.450,00    │  R$ 61.480,00   │
│  ▲ +12.5%       │  ▼ -5.2%        │  ▲ +8.1%        │  ▲ +7.3%        │
│  Anterior:      │  Anterior:      │  Anterior:      │  Anterior:      │
│  R$ 40.200,00   │  R$ 13.500,00   │  R$ 3.190,00    │  R$ 57.290,00   │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### Estilo dos Cards (baseado no KpiCard de Reports.tsx)

```typescript
function RevenueKpiCard({ label, value, previousValue, icon, borderColor }: Props) {
  // Cálculo da variação
  const variation = previousValue > 0 
    ? ((value - previousValue) / previousValue) * 100 
    : 0;
  const isPositive = variation >= 0;
  const showVariation = previousValue > 0; // Não mostra se período anterior = 0

  return (
    <Card className={cn("border-l-4", borderColor)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              {label}
            </p>
            <p className="text-2xl font-display font-bold text-foreground">
              {formatCurrency(value)}
            </p>
            {showVariation && (
              <Badge className={cn(
                "text-[10px] mt-1",
                isPositive 
                  ? "bg-success/10 text-success border-success/20" 
                  : "bg-destructive/10 text-destructive border-destructive/20"
              )}>
                {isPositive ? '▲' : '▼'} {formatPercent(Math.abs(variation))}
              </Badge>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Anterior: {formatCurrency(previousValue)}
            </p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Grid responsivo

```
Mobile (< sm):  1 coluna  → grid-cols-1
Tablet (sm):    2 colunas → grid-cols-2
Desktop (lg):   4 colunas → grid-cols-4
```

---

## 📈 Comparativo Temporal — Lógica de Período Anterior

### Regras de cálculo do período comparado

| Filtro Ativo | Período Atual | Período Anterior Comparado |
|-------------|---------------|---------------------------|
| **7 dias** | últimos 7 dias (hoje - 6 a hoje) | 7 dias antes (hoje - 13 a hoje - 7) |
| **15 dias** | últimos 15 dias (hoje - 14 a hoje) | 15 dias antes (hoje - 29 a hoje - 15) |
| **30 dias** | últimos 30 dias (hoje - 29 a hoje) | 30 dias antes (hoje - 59 a hoje - 30) |
| **Mês (ex: março)** | 01/03 a 31/03 | Mês anterior: 01/02 a 28/02 |
| **Dia específico** | dia X | Mesmo dia da semana anterior (X - 7) |
| **Intervalo De/Até** | dateFrom a dateTo | Mesmo intervalo deslocado para trás pelo mesmo nº de dias |
| **Todo período** | todos os dados | **Sem comparativo** (esconde badge e valor anterior) |

### Implementação

```typescript
function getPreviousPeriod(current: { start: string; end: string }): { start: string; end: string } | null {
  const startDate = new Date(current.start + 'T12:00:00');
  const endDate = new Date(current.end + 'T12:00:00');
  const durationDays = differenceInCalendarDays(endDate, startDate) + 1;
  
  const prevEnd = subDays(startDate, 1); // dia antes do início atual
  const prevStart = subDays(prevEnd, durationDays - 1);
  
  return {
    start: format(prevStart, 'yyyy-MM-dd'),
    end: format(prevEnd, 'yyyy-MM-dd'),
  };
}

// Para "Todo período" → retorna null → não exibe comparativo
```

### Cálculo da variação percentual

```typescript
const variation = previousValue > 0
  ? ((currentValue - previousValue) / previousValue) * 100
  : (currentValue > 0 ? 100 : 0); // Se anterior era 0 e atual > 0 → +100%
```

---

## 📉 Gráfico de Tendência (AreaChart Empilhado)

### Tipo: `AreaChart` (recharts) com áreas empilhadas

```
Eixo X: Data (dd/MM) — agrupado por dia
Eixo Y: Valor em R$
Séries:
  - Malhas (cor primary)
  - Terceirizado (cor accent)
  - Resíduos (cor warning)
```

### Dados do gráfico

```typescript
const chartData = useMemo(() => {
  const dateMap: Record<string, { malhas: number; terceirizado: number; residuos: number }> = {};
  
  filteredProductions.forEach(p => {
    if (!dateMap[p.date]) dateMap[p.date] = { malhas: 0, terceirizado: 0, residuos: 0 };
    dateMap[p.date].malhas += p.revenue;
  });
  
  filteredOutsource.forEach(p => {
    if (!dateMap[p.date]) dateMap[p.date] = { malhas: 0, terceirizado: 0, residuos: 0 };
    dateMap[p.date].terceirizado += p.total_revenue;
  });
  
  filteredResidues.forEach(s => {
    if (!dateMap[s.date]) dateMap[s.date] = { malhas: 0, terceirizado: 0, residuos: 0 };
    dateMap[s.date].residuos += s.total;
  });
  
  return Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
      malhas: vals.malhas,
      terceirizado: vals.terceirizado,
      residuos: vals.residuos,
      total: vals.malhas + vals.terceirizado + vals.residuos,
    }));
}, [filteredProductions, filteredOutsource, filteredResidues]);
```

### Configuração visual

```tsx
<ResponsiveContainer width="100%" height={350}>
  <AreaChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="date" className="text-xs" />
    <YAxis tickFormatter={v => formatCurrency(v)} className="text-xs" />
    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
    <Legend />
    <Area type="monotone" dataKey="malhas" name="Malhas" stackId="1" 
          fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" />
    <Area type="monotone" dataKey="terceirizado" name="Terceirizado" stackId="1" 
          fill="hsl(var(--accent) / 0.3)" stroke="hsl(var(--accent))" />
    <Area type="monotone" dataKey="residuos" name="Resíduos" stackId="1" 
          fill="hsl(38, 92%, 50%, 0.3)" stroke="hsl(38, 92%, 50%)" />
  </AreaChart>
</ResponsiveContainer>
```

---

## 📋 Tabela Detalhada por Fonte

Abaixo do gráfico, uma tabela resumo com breakdown:

| Fonte | Receita Atual | Receita Anterior | Variação | % do Total |
|-------|--------------|-----------------|----------|------------|
| Malhas | R$ 45.230 | R$ 40.200 | ▲ +12.5% | 73.6% |
| Terceirizado | R$ 12.800 | R$ 13.500 | ▼ -5.2% | 20.8% |
| Resíduos | R$ 3.450 | R$ 3.190 | ▲ +8.1% | 5.6% |
| **Total** | **R$ 61.480** | **R$ 57.290** | **▲ +7.3%** | **100%** |

### Estilo da tabela

- Usar componente `Table` do shadcn
- Última linha (Total) em **bold** com `bg-muted/50`
- Coluna de variação com cor condicional (verde/vermelho)
- Coluna "% do Total" com mini barra de progresso visual

---

## 🏗️ Estrutura do Componente

```
FaturamentoTotal.tsx
├── Imports e tipos
├── fetchAllPaginated (reutilizar)
├── Estados de filtro (6 estados)
├── useQuery para cada fonte (3 queries)
├── useMemo: filtragem por data (3 arrays filtrados)
├── useMemo: período anterior + filtragem
├── useMemo: cálculos de KPI (atual + anterior + variação)
├── useMemo: dados do gráfico
├── useMemo: periodLabel (subtítulo dinâmico)
├── useMemo: availableMonths (combinado das 3 fontes)
├── Render:
│   ├── Header (título + subtítulo + botão limpar)
│   ├── Card Filtros (botões + calendários + mês + intervalo)
│   ├── Grid KPI Cards (4 cards com comparativo)
│   ├── Card Gráfico (AreaChart empilhado)
│   └── Card Tabela Resumo (breakdown por fonte)
└── Sub-componente: RevenueKpiCard
```

---

## 🔐 Acesso e Permissões

- **Role:** Somente `admin` pode acessar
- **Sidebar key:** `faturamento-total`
- **Adicionar em:**
  - `usePermissions.ts` → `ROLE_ALLOWED_KEYS.admin` adicionar `'faturamento-total'`
  - `AppSidebar.tsx` → novo item com ícone `DollarSign`
  - `MobileBottomNav.tsx` → avaliar se adiciona (provavelmente não, é secundário)
  - `App.tsx` → nova rota `/:slug/faturamento-total`
  - `company_settings.enabled_nav_items` → adicionar `'faturamento-total'` no default do banco

---

## 🗃️ Alterações no Banco

- **Nenhuma tabela nova** — usa apenas tabelas existentes (`productions`, `outsource_productions`, `residue_sales`)
- **Migration necessária:** Apenas atualizar o default de `enabled_nav_items` em `company_settings` para incluir `'faturamento-total'`

---

## 📅 Subtítulo Dinâmico (periodLabel)

Mesma lógica do Dashboard/Reports:
- "01/03/2026 a 31/03/2026" para mês
- "25/03/2026 a 08/04/2026" para 15 dias
- "Todo período: 01/01/2026 a 08/04/2026" para todo período

Exibido abaixo do título: `Faturamento Total · {periodLabel}`

---

## 🎨 Design Visual

- **Estilo geral:** Consistente com Reports.tsx (mesma família de cards, mesmo espaçamento)
- **Cards KPI:** Estilo `KpiCard` de Reports com `border-l-4` colorido + badge de variação
- **Gráfico:** AreaChart empilhado com cores semânticas
- **Tabela:** Componente Table do shadcn com linha de total destacada
- **Animação:** `animate-fade-in` no container principal (classe já existente)
- **Tema:** Funciona em light e dark mode via tokens CSS

---

*Documentação criada em: 09/04/2026*
*Última atualização: 09/04/2026*
