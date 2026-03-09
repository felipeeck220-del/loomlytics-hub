import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyData } from '@/hooks/useCompanyData';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Scale, DollarSign, Gauge, Clock,
  Settings2, Users, FileText, ClipboardList, Loader2,
  Factory, RotateCcw, Plus, Eye, BarChart3 as ChartIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import {
  Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';

// Shift colors
const SHIFT_COLORS: Record<ShiftType, string> = {
  manha: 'bg-amber-400',
  tarde: 'bg-orange-400',
  noite: 'bg-blue-500',
};

const SHIFT_TEXT_COLORS: Record<ShiftType, string> = {
  manha: 'text-amber-600',
  tarde: 'text-orange-600',
  noite: 'text-blue-600',
};

function getCurrentShift(): ShiftType {
  const h = new Date().getHours();
  if (h >= 5 && h < 13) return 'manha';
  if (h >= 13 && h < 22) return 'tarde';
  return 'noite';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { getProductions, getMachines, getClients, getArticles, getWeavers, loading } = useCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();
  const weavers = getWeavers();

  const [dayRange, setDayRange] = useState(15);
  const [customDate, setCustomDate] = useState<Date>();
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterArticle, setFilterArticle] = useState<string>('all');

  const currentShift = getCurrentShift();

  const clearFilters = () => {
    setDayRange(15);
    setCustomDate(undefined);
    setFilterMonth('all');
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
  };

  const hasActiveFilters = filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMonth !== 'all';

  // Available months from data
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

    return data;
  }, [productions, dayRange, customDate, filterMonth, filterShift, filterClient, filterArticle, articles]);

  // KPIs
  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;

  const totalMachineHours = filtered.reduce((s, p) => {
    const minutes = SHIFT_MINUTES[p.shift as ShiftType] || 480;
    return s + (minutes / 60);
  }, 0);

  const revenuePerHour = totalMachineHours > 0 ? totalRevenue / totalMachineHours : 0;
  const kgPerHour = totalMachineHours > 0 ? totalWeight / totalMachineHours : 0;

  // Shift breakdown
  const shiftData = (['manha', 'tarde', 'noite'] as ShiftType[]).map(shift => {
    const sp = filtered.filter(p => p.shift === shift);
    return {
      shift,
      label: SHIFT_LABELS[shift].split(' (')[0],
      rolls: sp.reduce((s, p) => s + p.rolls_produced, 0),
      kg: sp.reduce((s, p) => s + p.weight_kg, 0),
      revenue: sp.reduce((s, p) => s + p.revenue, 0),
    };
  });

  // Machine performance (top 5 by records)
  const activeMachines = machines.filter(m => m.status === 'ativa');
  const machinePerf = activeMachines.map(m => {
    const mp = filtered.filter(p => p.machine_id === m.id);
    const eff = mp.length ? mp.reduce((s, p) => s + p.efficiency, 0) / mp.length : 0;
    return { name: m.name, rolls: mp.reduce((s, p) => s + p.rolls_produced, 0), kg: mp.reduce((s, p) => s + p.weight_kg, 0), efficiency: eff, records: mp.length };
  }).filter(m => m.records > 0).sort((a, b) => b.records - a.records).slice(0, 5);

  // Trend chart data (daily rolls)
  const trendData = useMemo(() => {
    const byDate: Record<string, number> = {};
    filtered.forEach(p => {
      byDate[p.date] = (byDate[p.date] || 0) + p.rolls_produced;
    });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, rolls]) => ({
      date: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
      rolos: rolls,
    }));
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Carregando dados...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Visão geral da produção - Últimos {dayRange} dias - Turno atual: {SHIFT_LABELS[currentShift].split(' (')[0]}
          </p>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <RotateCcw className="h-4 w-4 mr-1" /> Limpar Filtros
          </Button>
        )}
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Day range buttons */}
            {[1, 7, 15, 30].map(d => (
              <Button
                key={d}
                size="sm"
                variant={dayRange === d && filterMonth === 'all' && !customDate ? 'default' : 'outline'}
                onClick={() => { setDayRange(d); setCustomDate(undefined); setFilterMonth('all'); }}
                className="min-w-[60px]"
              >
                {d} dia{d > 1 ? 's' : ''}
              </Button>
            ))}

            {/* Custom day picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!customDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customDate ? format(customDate, 'dd/MM/yyyy') : 'Dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(d) => { setCustomDate(d); setFilterMonth('all'); }}
                  locale={ptBR}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {/* Month selector */}
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); }}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
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

            {/* Shift filter */}
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Todos os turnos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os turnos</SelectItem>
                {Object.entries(SHIFT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Client filter */}
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Article filter */}
            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Artigo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: Left content + Right sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2/3 */}
        <div className="xl:col-span-2 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="ROLOS"
              value={formatNumber(totalRolls)}
              borderColor="border-l-amber-400"
            />
            <KpiCard
              label="PESO (KG)"
              value={`${formatNumber(totalWeight, 2)} kg`}
              borderColor="border-l-orange-400"
            />
            <KpiCard
              label="FATURAMENTO"
              value={formatCurrency(totalRevenue)}
              borderColor="border-l-emerald-500"
            />
            <KpiCard
              label="EFICIÊNCIA"
              value={formatPercent(avgEfficiency)}
              borderColor="border-l-purple-500"
              extra={
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  avgEfficiency >= 80 ? "bg-emerald-100 text-emerald-600" : avgEfficiency >= 70 ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                )}>
                  <Gauge className="h-4 w-4" />
                </div>
              }
            />
          </div>

          {/* Shift Breakdown + Machine Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Shift Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Produção por Turno
                </CardTitle>
                <CardDescription>Distribuição da produção entre os turnos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {shiftData.map(s => (
                  <div key={s.shift} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={cn("w-3 h-3 rounded-full", SHIFT_COLORS[s.shift as ShiftType])} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(s.rolls)} rolos · {formatNumber(s.kg, 2)} kg</p>
                      </div>
                    </div>
                    <span className={cn("text-sm font-bold", SHIFT_TEXT_COLORS[s.shift as ShiftType])}>
                      {formatCurrency(s.revenue)}
                    </span>
                  </div>
                ))}
                {/* Total */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Total Geral</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(totalRolls)} rolos · {formatNumber(totalWeight, 2)} kg</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">{formatCurrency(totalRevenue)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Machine Performance */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Factory className="h-4 w-4 text-muted-foreground" />
                      Performance por Máquina
                    </CardTitle>
                    <CardDescription>Desempenho individual das máquinas</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/machines')}>
                    <Eye className="h-3 w-3 mr-1" /> Ver Todas
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {machinePerf.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
                ) : machinePerf.map(m => (
                  <div key={m.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(m.rolls)} rolos · {formatNumber(m.kg, 2)} kg</p>
                    </div>
                    <span className={cn(
                      "text-xs font-bold px-3 py-1 rounded-full",
                      m.efficiency >= 80 ? "bg-emerald-500 text-white" :
                      m.efficiency >= 70 ? "bg-amber-400 text-white" :
                      "bg-red-500 text-white"
                    )}>
                      {formatPercent(m.efficiency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ChartIcon className="h-4 w-4 text-purple-500" />
                  Tendência de Produção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRolos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(270, 70%, 60%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(270, 70%, 60%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 60%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 60%)" />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(220, 15%, 88%)', fontSize: '13px' }}
                        formatter={(v: number) => [formatNumber(v), 'Rolos']}
                      />
                      <Area type="monotone" dataKey="rolos" stroke="hsl(270, 70%, 60%)" strokeWidth={2} fill="url(#colorRolos)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar 1/3 */}
        <div className="space-y-4">
          {/* Productivity per Hour */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-destructive" />
                Produtividade/Hora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30">
                <span className="text-sm text-foreground">Faturamento/Hora</span>
                <span className="text-sm font-bold text-orange-600">{formatCurrency(revenuePerHour)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-sm text-foreground">Kg/Hora</span>
                <span className="text-sm font-bold text-foreground">{formatNumber(kgPerHour, 2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Nova Produção', icon: Plus, path: '/production' },
                { label: 'Gerenciar Máquinas', icon: Settings2, path: '/machines' },
                { label: 'Ver Performance', icon: Eye, path: '/machines' },
                { label: 'Relatórios', icon: ChartIcon, path: '/reports' },
              ].map(a => (
                <Button
                  key={a.label}
                  variant="ghost"
                  className="w-full justify-start h-10 text-sm"
                  onClick={() => navigate(a.path)}
                >
                  <a.icon className="h-4 w-4 mr-3 text-muted-foreground" />
                  {a.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Status do Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Máquinas Ativas', value: activeMachines.length },
                { label: 'Total de Clientes', value: clients.length },
                { label: 'Artigos Cadastrados', value: articles.length },
                { label: 'Registros de Produção', value: formatNumber(productions.length) },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-bold bg-muted px-3 py-1 rounded-full text-foreground">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, borderColor, extra }: {
  label: string; value: string; borderColor: string; extra?: React.ReactNode;
}) {
  return (
    <Card className={cn("border-l-4", borderColor)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-display font-bold text-foreground">{value}</p>
          </div>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}
