import { useState, useMemo, useRef } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Loader2, RotateCcw, Download, Clock,
  Package, TrendingUp, DollarSign, Gauge, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType } from '@/types';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';

const CHART_COLORS = [
  'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(221, 83%, 53%)',
  'hsl(0, 84%, 60%)', 'hsl(280, 60%, 50%)', 'hsl(199, 89%, 48%)',
];

const SHIFT_CHART_COLORS: Record<string, string> = {
  'Manhã': 'hsl(38, 92%, 50%)',
  'Tarde': 'hsl(25, 95%, 53%)',
  'Noite': 'hsl(221, 83%, 53%)',
};

export default function Reports() {
  const { getProductions, getMachines, getClients, getArticles, loading } = useCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();

  // Filters
  const [dayRange, setDayRange] = useState(30);
  const [customDate, setCustomDate] = useState<Date>();
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterArticle, setFilterArticle] = useState<string>('all');
  const [filterMachine, setFilterMachine] = useState<string>('all');

  // Export settings
  const [exportMode, setExportMode] = useState<'admin' | 'employee'>('admin');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');

  // Active analysis tab
  const [activeTab, setActiveTab] = useState('turno');

  const hasActiveFilters = filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMachine !== 'all' || filterMonth !== 'all';

  const clearFilters = () => {
    setDayRange(30);
    setCustomDate(undefined);
    setFilterMonth('all');
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
    setFilterMachine('all');
  };

  const availableMonths = useMemo(() => {
    const months = new Set(productions.map(p => p.date.substring(0, 7)));
    return Array.from(months).sort().reverse();
  }, [productions]);

  const filtered = useMemo(() => {
    let data = [...productions];
    const today = new Date();

    if (filterMonth !== 'all') {
      data = data.filter(p => p.date.startsWith(filterMonth));
    } else if (customDate) {
      const dateStr = format(customDate, 'yyyy-MM-dd');
      data = data.filter(p => p.date === dateStr);
    } else {
      const start = format(subDays(today, dayRange), 'yyyy-MM-dd');
      const end = format(today, 'yyyy-MM-dd');
      data = data.filter(p => p.date >= start && p.date <= end);
    }

    if (filterShift !== 'all') data = data.filter(p => p.shift === filterShift);
    if (filterClient !== 'all') {
      const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterArticle !== 'all') data = data.filter(p => p.article_id === filterArticle);
    if (filterMachine !== 'all') data = data.filter(p => p.machine_id === filterMachine);
    return data;
  }, [productions, dayRange, customDate, filterMonth, filterShift, filterClient, filterArticle, filterMachine, articles]);

  // KPIs
  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;
  const uniqueDays = new Set(filtered.map(p => p.date)).size || 1;

  // By shift
  const byShift = (['manha', 'tarde', 'noite'] as ShiftType[]).map(s => {
    const sp = filtered.filter(p => p.shift === s);
    return {
      name: SHIFT_LABELS[s].split(' (')[0],
      rolos: sp.reduce((sum, p) => sum + p.rolls_produced, 0),
      kg: sp.reduce((sum, p) => sum + p.weight_kg, 0),
      faturamento: sp.reduce((sum, p) => sum + p.revenue, 0),
    };
  });

  // By machine
  const byMachine = machines.map(m => {
    const mp = filtered.filter(p => p.machine_id === m.id);
    const eff = mp.length ? mp.reduce((s, p) => s + p.efficiency, 0) / mp.length : 0;
    return {
      name: m.name,
      rolos: mp.reduce((s, p) => s + p.rolls_produced, 0),
      kg: mp.reduce((s, p) => s + p.weight_kg, 0),
      faturamento: mp.reduce((s, p) => s + p.revenue, 0),
      eficiencia: eff,
      records: mp.length,
    };
  }).filter(m => m.records > 0).sort((a, b) => b.eficiencia - a.eficiencia);

  // By client
  const byClient = clients.map(c => {
    const cArticles = articles.filter(a => a.client_id === c.id).map(a => a.id);
    const cp = filtered.filter(p => cArticles.includes(p.article_id));
    return {
      name: c.name,
      rolos: cp.reduce((s, p) => s + p.rolls_produced, 0),
      kg: cp.reduce((s, p) => s + p.weight_kg, 0),
      faturamento: cp.reduce((s, p) => s + p.revenue, 0),
    };
  }).filter(c => c.rolos > 0).sort((a, b) => b.faturamento - a.faturamento);

  // By date (evolution)
  const byDate = useMemo(() => {
    const acc: Record<string, { rolos: number; kg: number; faturamento: number }> = {};
    filtered.forEach(p => {
      if (!acc[p.date]) acc[p.date] = { rolos: 0, kg: 0, faturamento: 0 };
      acc[p.date].rolos += p.rolls_produced;
      acc[p.date].kg += p.weight_kg;
      acc[p.date].faturamento += p.revenue;
    });
    return Object.entries(acc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
        ...vals,
      }));
  }, [filtered]);

  // Period label
  const periodLabel = filterMonth !== 'all'
    ? format(new Date(filterMonth + '-01'), 'MMMM yyyy', { locale: ptBR })
    : customDate
    ? format(customDate, 'dd/MM/yyyy')
    : `${dayRange} dias`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Produção - {periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <RotateCcw className="h-4 w-4 mr-1" /> Limpar Filtros
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            {[1, 7, 30].map(d => (
              <Button
                key={d}
                size="sm"
                variant={dayRange === d && filterMonth === 'all' && !customDate ? 'default' : 'outline'}
                onClick={() => { setDayRange(d); setCustomDate(undefined); setFilterMonth('all'); }}
              >
                {d === 1 ? '1 Dia' : d === 7 ? '7 Dias' : '1 Mês'}
              </Button>
            ))}

            <Button
              size="sm"
              variant={dayRange === 9999 && filterMonth === 'all' && !customDate ? 'default' : 'outline'}
              onClick={() => { setDayRange(9999); setCustomDate(undefined); setFilterMonth('all'); }}
            >
              Total
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!customDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customDate ? format(customDate, 'dd/MM/yyyy') : 'Escolher dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDate} onSelect={(d) => { setCustomDate(d); setFilterMonth('all'); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Escolher mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>
                    {format(new Date(m + '-01'), 'MMM yyyy', { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-px h-6 bg-border mx-1" />

            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Todos os turnos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os turnos</SelectItem>
                {Object.entries(SHIFT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMachine} onValueChange={setFilterMachine}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Todas as máquinas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as máquinas</SelectItem>
                {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Todos os artigos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os artigos</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total de Rolos"
          value={formatNumber(totalRolls)}
          subtitle={`Em ${uniqueDays} dias`}
          icon={<Package className="h-5 w-5 text-primary" />}
          borderColor="border-l-primary"
        />
        <KpiCard
          label="Total Produzido"
          value={`${formatNumber(totalWeight, 2)} kg`}
          subtitle="Peso total produzido"
          icon={<TrendingUp className="h-5 w-5 text-accent" />}
          borderColor="border-l-accent"
        />
        <KpiCard
          label="Valor Total"
          value={formatCurrency(totalRevenue)}
          subtitle="Valor total faturado"
          icon={<DollarSign className="h-5 w-5 text-success" />}
          borderColor="border-l-success"
        />
        <KpiCard
          label="Eficiência Média"
          value={formatPercent(avgEfficiency)}
          subtitle={avgEfficiency >= 80 ? undefined : undefined}
          icon={<Gauge className="h-5 w-5 text-destructive" />}
          borderColor="border-l-destructive"
          extra={
            avgEfficiency < 80 ? (
              <Badge variant="destructive" className="text-[10px] mt-1">Abaixo da meta</Badge>
            ) : (
              <Badge className="bg-success/10 text-success border-success/20 text-[10px] mt-1">Dentro da meta</Badge>
            )
          }
        />
      </div>

      {/* Analysis Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="turno">Por Turno</TabsTrigger>
          <TabsTrigger value="maquina">Por Máquina</TabsTrigger>
          <TabsTrigger value="cliente">Por Cliente</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
        </TabsList>

        {/* POR TURNO */}
        <TabsContent value="turno" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Produção por Turno
                </CardTitle>
                <CardDescription>Distribuição da produção entre os turnos</CardDescription>
              </CardHeader>
              <CardContent>
                {byShift.some(s => s.rolos > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={byShift}>
                      <defs>
                        <linearGradient id="shiftGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number, name: string) => [name === 'faturamento' ? formatCurrency(v) : formatNumber(v), name === 'rolos' ? 'Rolos' : name === 'kg' ? 'Kg' : 'Faturamento']} />
                      <Area type="monotone" dataKey="rolos" stroke="hsl(221, 83%, 53%)" fill="url(#shiftGrad)" strokeWidth={2} name="rolos" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Valor por Turno</CardTitle>
                <CardDescription>Distribuição do valor lucrado por turno</CardDescription>
              </CardHeader>
              <CardContent>
                {byShift.some(s => s.faturamento > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={byShift.filter(s => s.faturamento > 0)}
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        dataKey="faturamento"
                        label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                        labelLine={true}
                      >
                        {byShift.filter(s => s.faturamento > 0).map((entry, i) => (
                          <Cell key={i} fill={SHIFT_CHART_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                )}
              </CardContent>
            </Card>

            {/* Shift detail list */}
            <Card className="lg:col-span-2">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {byShift.map(s => (
                    <div key={s.name} className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <p className="font-semibold text-foreground">{s.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">{formatNumber(s.rolos)} rolos · {formatNumber(s.kg, 2)} kg</p>
                      <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(s.faturamento)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* POR MÁQUINA */}
        <TabsContent value="maquina" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Máquinas</CardTitle>
                <CardDescription>Máquinas com melhor desempenho</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {byMachine.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                ) : (
                  byMachine.slice(0, 10).map(m => (
                    <div key={m.name} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-semibold text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(m.rolos)} rolos · {formatNumber(m.kg, 2)} kg</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <Badge className={cn(
                          "text-xs",
                          m.eficiencia >= 80 ? "bg-success/10 text-success" : m.eficiencia >= 70 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                        )}>
                          {formatPercent(m.eficiencia)}
                        </Badge>
                        <span className="text-sm font-semibold text-success">{formatCurrency(m.faturamento)}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Eficiência por Máquina</CardTitle>
                <CardDescription>Comparativo de eficiência</CardDescription>
              </CardHeader>
              <CardContent>
                {byMachine.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={byMachine.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis type="number" domain={[0, 100]} fontSize={12} />
                      <YAxis type="category" dataKey="name" fontSize={11} width={80} />
                      <Tooltip formatter={(v: number) => formatPercent(v)} />
                      <Bar dataKey="eficiencia" name="Eficiência" radius={[0, 4, 4, 0]}>
                        {byMachine.slice(0, 10).map((entry, i) => (
                          <Cell key={i} fill={entry.eficiencia >= 80 ? 'hsl(142, 71%, 45%)' : entry.eficiencia >= 70 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* POR CLIENTE */}
        <TabsContent value="cliente" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Clientes</CardTitle>
                <CardDescription>Clientes com maior faturamento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {byClient.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                ) : (
                  byClient.slice(0, 10).map(c => (
                    <div key={c.name} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(c.rolos)} rolos · {formatNumber(c.kg, 2)} kg</p>
                      </div>
                      <span className="text-sm font-bold text-success">{formatCurrency(c.faturamento)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Faturamento por Cliente</CardTitle>
                <CardDescription>Distribuição do faturamento</CardDescription>
              </CardHeader>
              <CardContent>
                {byClient.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={byClient.slice(0, 6)}
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        dataKey="faturamento"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={true}
                      >
                        {byClient.slice(0, 6).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* EVOLUÇÃO */}
        <TabsContent value="evolucao" className="mt-6">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução da Produção</CardTitle>
                <CardDescription>Tendência ao longo do período</CardDescription>
              </CardHeader>
              <CardContent>
                {byDate.length > 1 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={byDate}>
                      <defs>
                        <linearGradient id="evoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number, name: string) => [name === 'faturamento' ? formatCurrency(v) : formatNumber(v), name === 'rolos' ? 'Rolos' : name === 'kg' ? 'Kg' : 'Faturamento']} />
                      <Legend />
                      <Area type="monotone" dataKey="rolos" stroke="hsl(221, 83%, 53%)" fill="url(#evoGrad)" strokeWidth={2} name="Rolos" />
                      <Line type="monotone" dataKey="kg" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Kg" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Dados insuficientes para mostrar evolução</p>
                )}
              </CardContent>
            </Card>

            {byDate.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evolução do Faturamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={byDate}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Area type="monotone" dataKey="faturamento" stroke="hsl(142, 71%, 45%)" fill="url(#revGrad)" strokeWidth={2} name="Faturamento" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            Exportar Relatórios
          </CardTitle>
          <CardDescription>Exporte relatórios detalhados em PDF com base nos filtros aplicados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Export toggles */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Modo:</Label>
              <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                <Button
                  size="sm"
                  variant={exportMode === 'admin' ? 'default' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() => setExportMode('admin')}
                >
                  Admin
                </Button>
                <Button
                  size="sm"
                  variant={exportMode === 'employee' ? 'default' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() => setExportMode('employee')}
                >
                  Funcionários
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="include-charts"
                checked={includeCharts}
                onCheckedChange={setIncludeCharts}
              />
              <Label htmlFor="include-charts" className="text-sm cursor-pointer">
                Incluir gráficos
              </Label>
            </div>
          </div>

          <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
            {exportMode === 'admin' ? (
              <p>📊 <strong>Modo Admin:</strong> Inclui todos os dados financeiros (faturamento, valor por kg, receitas) além de rolos, peso e eficiência.</p>
            ) : (
              <p>👷 <strong>Modo Funcionários:</strong> Inclui apenas dados de produção (rolos, peso, eficiência). Dados financeiros são omitidos.</p>
            )}
          </div>

          {/* Export options */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">Exportação Geral</p>
            <ExportButton
              label="Relatório Completo"
              description={exportMode === 'admin' ? 'Todos os dados em um PDF' : 'Dados de produção em um PDF'}
              onClick={() => handleExport('completo', exportMode, includeCharts, filtered, byShift, byMachine, byClient)}
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-3">Exportação Específica</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ExportButton
                label="Por Artigo"
                description="Rolos, Kg, Valor"
                onClick={() => handleExport('artigo', exportMode, includeCharts, filtered, byShift, byMachine, byClient)}
              />
              <ExportButton
                label="Por Máquina"
                description="Performance individual"
                onClick={() => handleExport('maquina', exportMode, includeCharts, filtered, byShift, byMachine, byClient)}
              />
              <ExportButton
                label="Por Turno"
                description="Análise comparativa"
                onClick={() => handleExport('turno', exportMode, includeCharts, filtered, byShift, byMachine, byClient)}
              />
              <ExportButton
                label="Por Cliente"
                description="Produção por cliente"
                onClick={() => handleExport('cliente', exportMode, includeCharts, filtered, byShift, byMachine, byClient)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {productions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Registre produções para ver os relatórios detalhados</p>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function KpiCard({ label, value, subtitle, icon, borderColor, extra }: {
  label: string; value: string; subtitle?: string; icon: React.ReactNode; borderColor: string; extra?: React.ReactNode;
}) {
  return (
    <Card className={cn("border-l-4", borderColor)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-display font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {extra}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function ExportButton({ label, description, onClick }: {
  label: string; description: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-all cursor-pointer group"
    >
      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </button>
  );
}

// --- Export handler (generates CSV for now) ---

function handleExport(
  type: string,
  mode: 'admin' | 'employee',
  _includeCharts: boolean,
  filtered: any[],
  byShift: any[],
  byMachine: any[],
  byClient: any[],
) {
  const isAdmin = mode === 'admin';
  let csvContent = '';
  const BOM = '\uFEFF';

  const addLine = (values: (string | number)[]) => {
    csvContent += values.map(v => `"${v}"`).join(';') + '\n';
  };

  if (type === 'completo' || type === 'turno') {
    addLine(isAdmin
      ? ['Turno', 'Rolos', 'Peso (kg)', 'Faturamento']
      : ['Turno', 'Rolos', 'Peso (kg)']
    );
    byShift.forEach(s => {
      addLine(isAdmin
        ? [s.name, s.rolos, s.kg.toFixed(2), s.faturamento.toFixed(2)]
        : [s.name, s.rolos, s.kg.toFixed(2)]
      );
    });
    csvContent += '\n';
  }

  if (type === 'completo' || type === 'maquina') {
    addLine(isAdmin
      ? ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)', 'Faturamento']
      : ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)']
    );
    byMachine.forEach(m => {
      addLine(isAdmin
        ? [m.name, m.rolos, m.kg.toFixed(2), m.eficiencia.toFixed(1), m.faturamento.toFixed(2)]
        : [m.name, m.rolos, m.kg.toFixed(2), m.eficiencia.toFixed(1)]
      );
    });
    csvContent += '\n';
  }

  if (type === 'completo' || type === 'cliente') {
    addLine(isAdmin
      ? ['Cliente', 'Rolos', 'Peso (kg)', 'Faturamento']
      : ['Cliente', 'Rolos', 'Peso (kg)']
    );
    byClient.forEach(c => {
      addLine(isAdmin
        ? [c.name, c.rolos, c.kg.toFixed(2), c.faturamento.toFixed(2)]
        : [c.name, c.rolos, c.kg.toFixed(2)]
      );
    });
    csvContent += '\n';
  }

  if (type === 'completo' || type === 'artigo') {
    const articleMap: Record<string, { name: string; rolos: number; kg: number; faturamento: number }> = {};
    filtered.forEach(p => {
      const key = p.article_id || 'sem-artigo';
      if (!articleMap[key]) articleMap[key] = { name: p.article_name || 'Sem artigo', rolos: 0, kg: 0, faturamento: 0 };
      articleMap[key].rolos += p.rolls_produced;
      articleMap[key].kg += p.weight_kg;
      articleMap[key].faturamento += p.revenue;
    });
    addLine(isAdmin
      ? ['Artigo', 'Rolos', 'Peso (kg)', 'Faturamento']
      : ['Artigo', 'Rolos', 'Peso (kg)']
    );
    Object.values(articleMap).sort((a, b) => b.rolos - a.rolos).forEach(a => {
      addLine(isAdmin
        ? [a.name, a.rolos, a.kg.toFixed(2), a.faturamento.toFixed(2)]
        : [a.name, a.rolos, a.kg.toFixed(2)]
      );
    });
  }

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-${type}-${mode}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
