# 🎨 DESIGN SYSTEM — Guia Visual para Dashboards

> **Status:** 📐 **Referência** — padrões visuais e tokens CSS


> **Objetivo:** Documento de referência visual para replicar o estilo deste projeto em novos dashboards de qualquer nicho.
> **Stack:** React 18 + Tailwind CSS v3 + shadcn/ui + Recharts
> **Fontes:** Inter (display/body) + JetBrains Mono (dados numéricos)

---

## 📐 Estrutura de Layout

### Layout Principal (`AppLayout`)

```
┌──────────────────────────────────────────────────────┐
│ Sidebar │ Header (h-14, sticky top-0 z-10)           │
│         │────────────────────────────────────────────│
│  240px  │ Main content (p-4 md:p-6 lg:p-8)           │
│  (icon: │                                            │
│   48px) │                                            │
│         │                                            │
└─────────┴────────────────────────────────────────────┘
         Mobile: Bottom Nav (h-16, fixed bottom-0)
```

- Container: `min-h-screen flex w-full bg-background`
- Sidebar: `collapsible="icon"` (shadcn Sidebar)
- Header: `h-14 bg-card border-b border-border sticky top-0 z-10`
- Main: `flex-1 overflow-auto p-4 md:p-6 lg:p-8`

---

## 🎨 Tokens de Cor (CSS Variables HSL)

### Modo Claro (`:root`)

```css
:root {
  /* Base */
  --background: 210 20% 98%;
  --foreground: 220 15% 15%;

  /* Cards & Popovers */
  --card: 0 0% 100%;
  --card-foreground: 220 15% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 220 15% 15%;

  /* Marca principal (Teal/Verde) */
  --primary: 160 84% 39%;
  --primary-foreground: 0 0% 100%;

  /* Secundário */
  --secondary: 210 18% 95%;
  --secondary-foreground: 220 15% 20%;

  /* Muted */
  --muted: 210 18% 95%;
  --muted-foreground: 220 9% 46%;

  /* Accent */
  --accent: 160 30% 95%;
  --accent-foreground: 160 84% 30%;

  /* Destrutivo */
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;

  /* Bordas & Input */
  --border: 220 13% 91%;
  --input: 220 13% 91%;
  --ring: 160 84% 39%;
  --radius: 0.75rem;

  /* Semânticas */
  --success: 152 69% 41%;
  --success-foreground: 0 0% 100%;
  --warning: 36 100% 57%;
  --warning-foreground: 0 0% 10%;
  --info: 199 89% 48%;
  --info-foreground: 0 0% 100%;

  /* Sidebar */
  --sidebar-background: 0 0% 100%;
  --sidebar-foreground: 220 15% 35%;
  --sidebar-primary: 160 84% 39%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 160 40% 95%;
  --sidebar-accent-foreground: 160 84% 32%;
  --sidebar-border: 220 13% 93%;
  --sidebar-ring: 160 84% 39%;
}
```

### Modo Escuro (`.dark`)

```css
.dark {
  --background: 215 28% 9%;
  --foreground: 210 20% 92%;

  --card: 215 25% 12%;
  --card-foreground: 210 20% 92%;

  --popover: 215 25% 12%;
  --popover-foreground: 210 20% 92%;

  --primary: 160 84% 39%;
  --primary-foreground: 0 0% 100%;

  --secondary: 215 22% 16%;
  --secondary-foreground: 210 20% 88%;

  --muted: 215 22% 16%;
  --muted-foreground: 215 15% 55%;

  --accent: 215 22% 16%;
  --accent-foreground: 160 84% 45%;

  --destructive: 0 62% 50%;
  --destructive-foreground: 0 0% 100%;

  --border: 215 20% 18%;
  --input: 215 20% 18%;
  --ring: 160 84% 39%;

  --sidebar-background: 215 28% 8%;
  --sidebar-foreground: 210 15% 70%;
  --sidebar-primary: 160 84% 39%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 215 22% 14%;
  --sidebar-accent-foreground: 160 84% 45%;
  --sidebar-border: 215 20% 15%;
  --sidebar-ring: 160 84% 39%;
}
```

---

## 🗂️ Sidebar

### Estrutura

```tsx
<Sidebar collapsible="icon" className="border-r border-border">
  {/* Header — logo + nome */}
  <SidebarHeader className="h-14 flex items-center justify-center border-b border-sidebar-border px-2">
    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
      <Icon className="h-4 w-4 text-primary-foreground" />
    </div>
    {!collapsed && (
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground tracking-tight">Nome</span>
        <span className="text-[10px] text-muted-foreground">Subtítulo</span>
      </div>
    )}
  </SidebarHeader>

  {/* Menu items */}
  <SidebarContent className={collapsed ? "px-0 py-3" : "px-2 py-3"}>
    {/* Label do grupo */}
    <SidebarGroupLabel className="text-muted-foreground/50 text-[10px] uppercase tracking-widest font-medium px-3 mb-1">
      Menu
    </SidebarGroupLabel>

    {/* Item de menu */}
    <NavLink
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground 
                 hover:bg-accent hover:text-accent-foreground transition-all duration-150 text-[13px]"
      activeClassName="bg-primary/10 text-primary font-medium"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>Título</span>
    </NavLink>
  </SidebarContent>

  {/* Footer */}
  <SidebarFooter className="px-2 py-3 border-t border-sidebar-border" />
</Sidebar>
```

### Estilos-chave

| Propriedade | Valor |
|---|---|
| Largura expandido | ~240px (padrão shadcn) |
| Largura colapsado | ~48px (modo ícone) |
| Font-size menu | `text-[13px]` |
| Active state | `bg-primary/10 text-primary font-medium` |
| Hover state | `hover:bg-accent hover:text-accent-foreground` |
| Locked item | `text-muted-foreground/40 cursor-not-allowed` + ícone `Lock` |
| Badge "Em teste" | `text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full` |
| Transição | `transition-all duration-150` |
| Ícones | `h-4 w-4 shrink-0` |

---

## 📌 Header

### Estrutura

```tsx
<header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-10">
  {/* Esquerda: Sidebar trigger */}
  <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />

  {/* Direita: Controles */}
  <div className="flex items-center gap-2">
    {/* Badge de turno */}
    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-medium text-xs px-2.5 py-0.5">
      Manhã
    </Badge>

    {/* Data */}
    <span className="text-muted-foreground text-xs">12/04/2026</span>

    {/* Separador */}
    <div className="h-5 w-px bg-border" />

    {/* Botões de ação (ghost, h-8 w-8) */}
    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
      <Icon className="h-4 w-4" />
    </Button>

    {/* User dropdown */}
    <Button variant="ghost" size="sm" className="gap-2 h-9 px-2 hover:bg-accent/50">
      <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center">
        <User className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="text-left">
        <p className="text-xs font-medium text-foreground leading-tight">Nome</p>
        <p className="text-[10px] text-muted-foreground leading-tight capitalize">admin</p>
      </div>
    </Button>
  </div>
</header>
```

### Badges de Status (Header)

| Status | Classes |
|---|---|
| Ativo | `bg-emerald-500/10 text-emerald-500 border-emerald-500/30` |
| Cancelando | `bg-amber-500/10 text-amber-500 border-amber-500/30` |
| Suspenso | `bg-destructive/10 text-destructive border-destructive/30` |
| Trial | `bg-amber-500/10 text-amber-500 border-amber-500/30` |

---

## 💳 Cards de KPI (Faturamento Total)

### Componente `RevenueKpiCard`

```tsx
<Card className={cn('border-l-4', borderColor)}>
  <CardContent className="p-5">
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        {/* Label */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </p>

        {/* Valor principal */}
        <p className="text-2xl font-bold text-foreground">
          R$ 45.230,00
        </p>

        {/* Badge de variação */}
        <Badge variant="outline" className={cn(
          'text-[10px] mt-1',
          isPositive
            ? 'bg-success/10 text-success border-success/20'
            : 'bg-destructive/10 text-destructive border-destructive/20'
        )}>
          ▲ 12,5%
        </Badge>

        {/* Valor anterior */}
        <p className="text-xs text-muted-foreground mt-1">
          Anterior: R$ 40.200,00
        </p>
      </div>

      {/* Ícone */}
      <div className="text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </CardContent>
</Card>
```

### Cores de borda por categoria

| Categoria | `borderColor` |
|---|---|
| Malhas (produção própria) | `border-l-primary` |
| Terceirizado | `border-l-accent` |
| Resíduos | `border-l-warning` |
| Total Geral | `border-l-success` |

### Grid responsivo dos KPIs

```
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4
```

---

## 📈 Gráfico de Tendência de Faturamento

### Tipo: `AreaChart` empilhado (Recharts)

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Tendência de Faturamento</CardTitle>
  </CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" className="text-xs" />
        <YAxis
          tickFormatter={v => formatCurrency(v)}
          className="text-xs"
          width={100}
        />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Legend />

        {/* Área 1: Produção própria — cor Primary */}
        <Area
          type="monotone"
          dataKey="malhas"
          name="Malhas"
          stackId="1"
          fill="hsl(var(--primary) / 0.3)"
          stroke="hsl(var(--primary))"
        />

        {/* Área 2: Terceirizado — cor Accent */}
        <Area
          type="monotone"
          dataKey="terceirizado"
          name="Terceirizado"
          stackId="1"
          fill="hsl(var(--accent) / 0.3)"
          stroke="hsl(var(--accent))"
        />

        {/* Área 3: Resíduos — cor Warning */}
        <Area
          type="monotone"
          dataKey="residuos"
          name="Resíduos"
          stackId="1"
          fill="hsl(var(--warning) / 0.3)"
          stroke="hsl(var(--warning))"
        />
      </AreaChart>
    </ResponsiveContainer>
  </CardContent>
</Card>
```

### Cores das séries

| Série | Fill | Stroke |
|---|---|---|
| Malhas | `hsl(var(--primary) / 0.3)` | `hsl(var(--primary))` |
| Terceirizado | `hsl(var(--accent) / 0.3)` | `hsl(var(--accent))` |
| Resíduos | `hsl(var(--warning) / 0.3)` | `hsl(var(--warning))` |

### Configuração visual

| Propriedade | Valor |
|---|---|
| Altura do gráfico | `350px` |
| Grid | `strokeDasharray="3 3"` com `className="stroke-border"` |
| Eixo X | `text-xs`, formato `dd/MM` |
| Eixo Y | `text-xs`, `width={100}`, formato moeda `R$` |
| Tipo de curva | `monotone` |
| Empilhamento | `stackId="1"` (todas empilhadas) |

---

## 📊 Tabela Resumo por Fonte

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Resumo por Fonte</CardTitle>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fonte</TableHead>
          <TableHead className="text-right">Receita Atual</TableHead>
          <TableHead className="text-right">Receita Anterior</TableHead>
          <TableHead className="text-right">Variação</TableHead>
          <TableHead className="text-right">% do Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Linhas normais */}
        <TableRow>
          <TableCell className="font-medium">Malhas</TableCell>
          <TableCell className="text-right">R$ 45.230</TableCell>
          <TableCell className="text-right">R$ 40.200</TableCell>
          <TableCell className="text-right font-medium text-success">▲ 12,5%</TableCell>
          <TableCell className="text-right">
            {/* Mini progress bar */}
            <div className="flex items-center justify-end gap-2">
              <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: '73.6%' }} />
              </div>
              <span className="text-xs w-12 text-right">73,6%</span>
            </div>
          </TableCell>
        </TableRow>

        {/* Linha de Total */}
        <TableRow className="bg-muted/50 font-bold">
          <TableCell>Total</TableCell>
          <TableCell className="text-right">R$ 61.480</TableCell>
          ...
        </TableRow>
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

### Estilo da variação na tabela

- Positiva: `text-success` (verde)
- Negativa: `text-destructive` (vermelho)
- Linha total: `bg-muted/50 font-bold`

---

## 🧱 Classes Utilitárias Customizadas

### `index.css` — Classes de componente

```css
/* Card padrão com hover */
.card-glass {
  @apply bg-card border border-border rounded-xl transition-all duration-200;
}
.card-glass:hover {
  @apply border-primary/20;
}

/* Card de estatística */
.stat-card {
  @apply card-glass p-5 transition-all duration-300;
}

/* Botão gradiente */
.btn-gradient {
  background: linear-gradient(135deg, hsl(160 84% 39%), hsl(160 84% 32%));
  @apply text-primary-foreground font-semibold rounded-lg;
  box-shadow: 0 4px 14px hsl(160 84% 39% / 0.3);
}
.btn-gradient:hover {
  filter: brightness(1.1);
  box-shadow: 0 6px 20px hsl(160 84% 39% / 0.4);
  transform: translateY(-1px);
}

/* Icon boxes com gradiente */
.icon-box { @apply flex items-center justify-center rounded-xl; width: 48px; height: 48px; }
.icon-box-primary { background: linear-gradient(135deg, hsl(160 84% 39%), hsl(160 84% 28%)); }
.icon-box-success { background: linear-gradient(135deg, hsl(152 69% 41%), hsl(152 69% 31%)); }
.icon-box-warning { background: linear-gradient(135deg, hsl(36 100% 57%), hsl(25 95% 48%)); }
.icon-box-danger  { background: linear-gradient(135deg, hsl(0 72% 51%), hsl(0 72% 41%)); }
.icon-box-info    { background: linear-gradient(135deg, hsl(199 89% 48%), hsl(199 89% 35%)); }

/* Eficiência por nível */
.efficiency-high { @apply text-success; }
.efficiency-mid  { @apply text-warning; }
.efficiency-low  { @apply text-destructive; }

/* Cabeçalho de página */
.page-title    { @apply text-2xl font-bold text-foreground tracking-tight; }
.page-subtitle { @apply text-sm text-muted-foreground font-light; }
```

### Sombras customizadas (`tailwind.config.ts`)

```ts
boxShadow: {
  'material':          '0 2px 12px 0 hsl(0 0% 0% / 0.06)',
  'material-md':       '0 4px 20px 0 hsl(0 0% 0% / 0.08)',
  'material-lg':       '0 8px 26px 0 hsl(0 0% 0% / 0.1)',
  'material-gradient': '0 4px 20px 0 hsl(210 100% 52% / 0.25)',
}
```

### Animações

```ts
animation: {
  "fade-in":       "fade-in 0.4s ease-out",       // translateY(10px) → 0
  "slide-in-left": "slide-in-left 0.3s ease-out", // translateX(-16px) → 0
  "scale-in":      "scale-in 0.3s ease-out",      // scale(0.95) → 1
}
```

- Container principal de páginas: `className="space-y-6 animate-fade-in"`

---

## 📱 Responsividade

| Breakpoint | Uso |
|---|---|
| `xs: 480px` | Custom, para telas muito pequenas |
| `sm: 640px` | Grid 2 colunas, badges visíveis |
| `md: 768px` | Padding aumenta (p-6), nome do user aparece |
| `lg: 1024px` | Grid 4 colunas nos KPIs |

---

## 🔤 Tipografia

```css
body {
  font-family: 'Inter', system-ui, sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Inter', system-ui, sans-serif;
  letter-spacing: -0.02em;
}
```

| Uso | Classe/Estilo |
|---|---|
| Título de página | `text-2xl font-bold tracking-tight` |
| Subtítulo | `text-sm text-muted-foreground` |
| Label de KPI | `text-xs font-medium uppercase tracking-wider` |
| Valor de KPI | `text-2xl font-bold` |
| Menu sidebar | `text-[13px]` |
| Badges | `text-xs` ou `text-[10px]` |
| Dados no header | `text-xs` |

---

## 🌙 Toggle de Tema

```tsx
<Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground">
  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
</Button>
```

- Provider: `ThemeProvider` com classe `dark` no `<html>`
- Todas as cores funcionam automaticamente via CSS variables

---

## 📦 Dependências Visuais

| Pacote | Uso |
|---|---|
| `tailwindcss` + `tailwindcss-animate` | Estilos + animações |
| `shadcn/ui` | Componentes base (Card, Button, Badge, Table, Select, Popover, Calendar, Sidebar, Dialog) |
| `recharts` | Gráficos (AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer) |
| `lucide-react` | Ícones |
| `date-fns` + `date-fns/locale/pt-BR` | Formatação de datas |
| `@radix-ui/*` | Primitivos dos componentes shadcn |

---

*Documento criado em: 12/04/2026*
