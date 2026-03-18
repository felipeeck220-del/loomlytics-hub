import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Scale, DollarSign, Gauge, Clock,
  Settings2, Users, FileText, ClipboardList, Loader2,
  Factory, RotateCcw, Plus, Eye, BarChart3 as ChartIcon, Package, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import {
  Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import MachinePerformanceModal from '@/components/MachinePerformanceModal';

function getCurrentShift(): ShiftType {
  const h = new Date().getHours();
  if (h >= 5 && h < 13) return 'manha';
  if (h >= 13 && h < 22) return 'tarde';
  return 'noite';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { getProductions, getMachines, getClients, getArticles, getWeavers, loading } = useSharedCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();
  const weavers = getWeavers();

  const [dayRange, setDayRange] = useState(15);
  const [customDate, setCustomDate] = useState<Date>();
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterArticle, setFilterArticle] = useState<string>('all');
  const [showAllMachines, setShowAllMachines] = useState(false);

  const currentShift = getCurrentShift();

  const clearFilters = () => {
    setDayRange(15);
    setCustomDate(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterMonth('all');
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
  };

  const hasActiveFilters = filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMonth !== 'all' || !!dateFrom || !!dateTo;

  const availableMonths = useMemo(() => {
    const months = new Set(productions.map(p => p.date.substring(0, 7)));
    return Array.from(months).sort().reverse();
  }, [productions]);

  const filtered = useMemo(() => {
    let data = [...productions];
    const today = new Date();

    if (dateFrom || dateTo) {
      if (dateFrom) {
        const startStr = format(dateFrom, 'yyyy-MM-dd');
        data = data.filter(p => p.date >= startStr);
      }
      if (dateTo) {
        const endStr = format(dateTo, 'yyyy-MM-dd');
        data = data.filter(p => p.date <= endStr);
      }
    } else if (filterMonth !== 'all') {
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
  }, [productions, dayRange, customDate, dateFrom, dateTo, filterMonth, filterShift, filterClient, filterArticle, articles]);

  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;

  const calendarHours = useMemo(() => {
    let days: number;
    if (dateFrom && dateTo) {
      days = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    } else if (dateFrom) {
      days = Math.max(1, Math.round((new Date().getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    } else if (dateTo) {
      days = 1;
    } else if (customDate) {
      days = 1;
    } else if (filterMonth !== 'all') {
      const [y, m] = filterMonth.split('-').map(Number);
      days = new Date(y, m, 0).getDate();
    } else {
      days = dayRange;
    }

    if (filterShift !== 'all') {
      const shiftMinutes = SHIFT_MINUTES[filterShift as ShiftType] || 480;
      return days * (shiftMinutes / 60);
    }
    return days * 24;
  }, [customDate, filterMonth, dayRange, filterShift, dateFrom, dateTo]);

  const revenuePerHour = calendarHours > 0 ? totalRevenue / calendarHours : 0;
  const kgPerHour = calendarHours > 0 ? totalWeight / calendarHours : 0;

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

  const machinePerf = machines.map(m => {
    const mp = filtered.filter(p => p.machine_id === m.id);
    const eff = mp.length ? mp.reduce((s, p) => s + p.efficiency, 0) / mp.length : 0;
    return { name: m.name, rolls: mp.reduce((s, p) => s + p.rolls_produced, 0), kg: mp.reduce((s, p) => s + p.weight_kg, 0), efficiency: eff, records: mp.length };
  }).filter(m => m.records > 0).sort((a, b) => b.rolls - a.rolls).slice(0, 5);

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
        <span className="ml-3 text-muted-foreground font-light">Carregando dados...</span>
      </div>
    );
  }

  return (
    <div className="space-y-7 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Visão geral da produção · Últimos {dayRange} dias · Turno: {SHIFT_LABELS[currentShift].split(' (')[0]}
          </p>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters} className="rounded-lg">
            <RotateCcw className="h-4 w-4 mr-1" /> Limpar Filtros
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="shadow-material border-0">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            {[1, 7, 15, 30].map(d => (
              <Button
                key={d}
                size="sm"
                variant={dayRange === d && filterMonth === 'all' && !customDate && !dateFrom && !dateTo ? 'default' : 'outline'}
                onClick={() => { setDayRange(d); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }}
                className={cn("min-w-[60px] rounded-lg", dayRange === d && filterMonth === 'all' && !customDate && !dateFrom && !dateTo && 'btn-gradient')}
              >
                {d} dia{d > 1 ? 's' : ''}
              </Button>
            ))}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("rounded-lg", !customDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customDate ? format(customDate, 'dd/MM/yyyy') : 'Dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDate} onSelect={(d) => { setCustomDate(d); setFilterMonth('all'); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}>
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy', { locale: ptBR })}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-px h-6 bg-border mx-1" />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("rounded-lg", !dateFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'De'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setFilterMonth('all'); setCustomDate(undefined); setDayRange(15); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("rounded-lg", !dateTo && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Até'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setFilterMonth('all'); setCustomDate(undefined); setDayRange(15); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <div className="w-px h-6 bg-border mx-1" />

            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-[150px] h-9 rounded-lg"><SelectValue placeholder="Todos os turnos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os turnos</SelectItem>
                {Object.entries(SHIFT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Artigo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards - Material style with gradient icon boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MaterialKpi
          icon={<Package className="h-5 w-5 text-white" />}
          iconClass="icon-box-dark"
          label="Rolos"
          value={formatNumber(totalRolls)}
          footer={`${filtered.length} registros`}
        />
        <MaterialKpi
          icon={<Scale className="h-5 w-5 text-white" />}
          iconClass="icon-box-success"
          label="Peso Total"
          value={`${formatNumber(totalWeight, 1)} kg`}
          footer={`${formatNumber(kgPerHour, 2)} kg/hora`}
        />
        <MaterialKpi
          icon={<DollarSign className="h-5 w-5 text-white" />}
          iconClass="icon-box-primary"
          label="Faturamento"
          value={formatCurrency(totalRevenue)}
          footer={`${formatCurrency(revenuePerHour)}/hora`}
        />
        <MaterialKpi
          icon={<Gauge className="h-5 w-5 text-white" />}
          iconClass={avgEfficiency >= 80 ? "icon-box-success" : avgEfficiency >= 70 ? "icon-box-warning" : "icon-box-danger"}
          label="Eficiência"
          value={formatPercent(avgEfficiency)}
          footer={avgEfficiency >= 80 ? 'Dentro da meta' : 'Abaixo da meta'}
          efficiencyValue={avgEfficiency}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2/3 */}
        <div className="xl:col-span-2 space-y-6">
          {/* Trend Chart - Material card style */}
          {trendData.length > 1 && (
            <Card className="shadow-material border-0 pt-10 overflow-visible">
              <div className="material-card-header mx-4 -mt-10" style={{ background: 'linear-gradient(195deg, hsl(210 100% 52%), hsl(210 100% 38%))' }}>
                <p className="text-sm font-medium">Tendência de Produção</p>
                <p className="text-xs text-white/60 font-light">Rolos produzidos por dia</p>
              </div>
              <CardContent className="pt-4 pb-2">
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRolos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(210, 100%, 52%)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(210, 100%, 52%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 92%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(220, 9%, 55%)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 9%, 55%)' }} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '10px', border: '1px solid hsl(220, 15%, 90%)', fontSize: '13px', boxShadow: '0 4px 20px hsl(0 0% 0% / 0.08)' }}
                        formatter={(v: number) => [formatNumber(v), 'Rolos']}
                      />
                      <Area type="monotone" dataKey="rolos" stroke="hsl(210, 100%, 52%)" strokeWidth={2.5} fill="url(#colorRolos)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shift Breakdown + Machine Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-material border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Produção por Turno
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {shiftData.map(s => (
                  <div key={s.shift} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={cn("w-2.5 h-2.5 rounded-full",
                        s.shift === 'manha' ? 'bg-warning' : s.shift === 'tarde' ? 'bg-destructive' : 'bg-primary'
                      )} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(s.rolls)} rolos · {formatNumber(s.kg, 1)} kg</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(s.revenue)}</span>
                  </div>
                ))}
                {/* Total */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-foreground/60" />
                    <div>
                      <p className="text-sm font-bold text-foreground">Total</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(totalRolls)} rolos · {formatNumber(totalWeight, 1)} kg</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-foreground">{formatCurrency(totalRevenue)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-material border-0">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Factory className="h-4 w-4 text-muted-foreground" />
                    Top Máquinas
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs text-primary h-7" onClick={() => setShowAllMachines(true)}>
                    Ver Todas
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {machinePerf.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 font-light">Sem dados no período</p>
                ) : machinePerf.map(m => (
                  <div key={m.name} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(m.rolls)} rolos · {formatNumber(m.kg, 1)} kg</p>
                    </div>
                    <span className={cn(
                      "text-xs font-semibold px-3 py-1.5 rounded-lg",
                      m.efficiency >= 80 ? "bg-success/10 text-success" :
                      m.efficiency >= 70 ? "bg-warning/10 text-warning" :
                      "bg-destructive/10 text-destructive"
                    )}>
                      {formatPercent(m.efficiency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Productivity */}
          <Card className="shadow-material border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Produtividade/Hora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-warning/5 border border-warning/10">
                <span className="text-sm text-foreground">Faturamento/Hora</span>
                <span className="text-sm font-bold text-warning">{formatCurrency(revenuePerHour)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
                <span className="text-sm text-foreground">Kg/Hora</span>
                <span className="text-sm font-bold text-foreground">{formatNumber(kgPerHour, 2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-material border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {[
                { label: 'Nova Produção', icon: Plus, path: '/production' },
                { label: 'Gerenciar Máquinas', icon: Settings2, path: '/machines' },
                { label: 'Ver Performance', icon: Eye, path: '/machines' },
                { label: 'Relatórios', icon: ChartIcon, path: '/reports' },
              ].map(a => (
                <Button
                  key={a.label}
                  variant="ghost"
                  className="w-full justify-start h-10 text-sm font-normal hover:bg-primary/5 hover:text-primary rounded-lg"
                  onClick={() => navigate(a.path)}
                >
                  <a.icon className="h-4 w-4 mr-3 text-muted-foreground" />
                  {a.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* System Status */}
          <Card className="shadow-material border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground">Status do Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Máquinas Ativas', value: machines.filter(m => m.status === 'ativa').length },
                { label: 'Total de Clientes', value: clients.length },
                { label: 'Artigos Cadastrados', value: articles.length },
                { label: 'Registros de Produção', value: formatNumber(productions.length) },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-light">{s.label}</span>
                  <span className="text-sm font-semibold bg-muted px-3 py-1 rounded-lg text-foreground">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <MachinePerformanceModal
        open={showAllMachines}
        onOpenChange={setShowAllMachines}
        machines={machines}
        productions={productions}
        clients={clients}
        articles={articles}
      />
    </div>
  );
}

function MaterialKpi({ icon, iconClass, label, value, footer, efficiencyValue }: {
  icon: React.ReactNode; iconClass: string; label: string; value: string; footer: string; efficiencyValue?: number;
}) {
  const effBg = efficiencyValue !== undefined
    ? efficiencyValue >= 80 ? 'bg-success/10' : efficiencyValue >= 70 ? 'bg-warning/10' : 'bg-destructive/10'
    : '';
  const effText = efficiencyValue !== undefined
    ? efficiencyValue >= 80 ? 'text-success' : efficiencyValue >= 70 ? 'text-warning' : 'text-destructive'
    : 'text-foreground';

  return (
    <Card className={cn("shadow-material border-0 overflow-visible pt-4", effBg)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("icon-box shrink-0", iconClass)}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">{label}</p>
            <p className={cn("text-lg font-display font-bold whitespace-nowrap", effText)}>{value}</p>
          </div>
        </div>
        <div className="pt-2 mt-2 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground font-light whitespace-nowrap">{footer}</p>
        </div>
      </CardContent>
    </Card>
  );
}
