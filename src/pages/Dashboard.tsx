import { useState, useMemo } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, startOfWeek, endOfWeek, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, BarChart3, Scale, DollarSign, Gauge, Clock,
  Settings2, Users, FileText, ClipboardList, Loader2,
  TrendingUp, Factory, Filter, RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import type { Production } from '@/types';

export default function Dashboard() {
  const { getProductions, getMachines, getClients, getArticles, getWeavers, loading } = useCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();
  const weavers = getWeavers();

  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterArticle, setFilterArticle] = useState<string>('all');
  const [filterMachine, setFilterMachine] = useState<string>('all');
  const [filterWeaver, setFilterWeaver] = useState<string>('all');

  const clearFilters = () => {
    setFilterType('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
    setFilterMachine('all');
    setFilterWeaver('all');
  };

  const hasActiveFilters = filterType !== 'all' || filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMachine !== 'all' || filterWeaver !== 'all';

  const filtered = useMemo(() => {
    let data = [...productions];
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    if (filterType === 'today') {
      data = data.filter(p => p.date === todayStr);
    } else if (filterType === 'week') {
      const start = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      data = data.filter(p => p.date >= start && p.date <= end);
    } else if (filterType === 'month') {
      const month = format(today, 'yyyy-MM');
      data = data.filter(p => p.date.startsWith(month));
    } else if (filterType === 'last_month') {
      const lastMonth = subMonths(today, 1);
      const start = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
      data = data.filter(p => p.date >= start && p.date <= end);
    } else if (filterType === 'range' && dateFrom && dateTo) {
      data = data.filter(p => p.date >= format(dateFrom, 'yyyy-MM-dd') && p.date <= format(dateTo, 'yyyy-MM-dd'));
    }

    if (filterShift !== 'all') data = data.filter(p => p.shift === filterShift);
    if (filterMachine !== 'all') data = data.filter(p => p.machine_id === filterMachine);
    if (filterWeaver !== 'all') data = data.filter(p => p.weaver_id === filterWeaver);
    if (filterClient !== 'all') {
      const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterArticle !== 'all') data = data.filter(p => p.article_id === filterArticle);

    return data;
  }, [productions, filterType, dateFrom, dateTo, filterShift, filterClient, filterArticle, filterMachine, filterWeaver, articles]);

  // ---- Calculations ----
  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;

  // Productivity per hour: sum actual machine-hours from each production record
  const totalMachineHours = filtered.reduce((s, p) => {
    const shiftKey = p.shift as ShiftType;
    const minutes = SHIFT_MINUTES[shiftKey] || 480;
    return s + (minutes / 60);
  }, 0);

  const revenuePerHour = totalMachineHours > 0 ? totalRevenue / totalMachineHours : 0;
  const kgPerHour = totalMachineHours > 0 ? totalWeight / totalMachineHours : 0;
  const rollsPerHour = totalMachineHours > 0 ? totalRolls / totalMachineHours : 0;

  // Unique worked days count
  const uniqueDays = new Set(filtered.map(p => p.date)).size;

  // Shift breakdown
  const shiftData = (['manha', 'tarde', 'noite'] as ShiftType[]).map(shift => {
    const shiftProds = filtered.filter(p => p.shift === shift);
    const shiftHours = shiftProds.length * (SHIFT_MINUTES[shift] / 60);
    return {
      shift,
      label: SHIFT_LABELS[shift].split(' (')[0],
      rolls: shiftProds.reduce((s, p) => s + p.rolls_produced, 0),
      kg: shiftProds.reduce((s, p) => s + p.weight_kg, 0),
      revenue: shiftProds.reduce((s, p) => s + p.revenue, 0),
      hours: shiftHours,
      records: shiftProds.length,
    };
  });

  // Machine performance using filtered data
  const activeMachines = machines.filter(m => m.status === 'ativa');
  const machinePerf = activeMachines.map(m => {
    const mProds = filtered.filter(p => p.machine_id === m.id);
    const eff = mProds.length ? mProds.reduce((s, p) => s + p.efficiency, 0) / mProds.length : 0;
    const totalKg = mProds.reduce((s, p) => s + p.weight_kg, 0);
    const totalRev = mProds.reduce((s, p) => s + p.revenue, 0);
    const hours = mProds.reduce((s, p) => s + (SHIFT_MINUTES[p.shift as ShiftType] || 480) / 60, 0);
    return { name: m.name, efficiency: eff, kg: totalKg, revenue: totalRev, hours, records: mProds.length };
  }).sort((a, b) => b.efficiency - a.efficiency);

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
            Visão geral da sua produção
            {uniqueDays > 0 && <span className="ml-2 text-xs">· {uniqueDays} dia{uniqueDays > 1 ? 's' : ''} · {formatNumber(filtered.length)} registros</span>}
          </p>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-4 w-4 mr-1" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros Avançados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Períodos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="last_month">Mês Passado</SelectItem>
                <SelectItem value="range">Período Customizado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Turnos</SelectItem>
                {Object.entries(SHIFT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMachine} onValueChange={setFilterMachine}>
              <SelectTrigger><SelectValue placeholder="Máquina" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Máquinas</SelectItem>
                {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterWeaver} onValueChange={setFilterWeaver}>
              <SelectTrigger><SelectValue placeholder="Tecelão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tecelões</SelectItem>
                {weavers.map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger><SelectValue placeholder="Artigo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Artigos</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {filterType === 'range' && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left", !dateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left", !dateTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Rolos Produzidos" value={formatNumber(totalRolls)} icon={BarChart3} colorClass="text-primary" />
        <KpiCard label="Peso Total" value={formatWeight(totalWeight)} icon={Scale} colorClass="text-accent" />
        <KpiCard label="Faturamento" value={formatCurrency(totalRevenue)} icon={DollarSign} colorClass="text-success" />
        <KpiCard
          label="Eficiência Média"
          value={formatPercent(avgEfficiency)}
          icon={Gauge}
          colorClass={avgEfficiency >= 80 ? 'text-success' : avgEfficiency >= 75 ? 'text-warning' : 'text-destructive'}
        />
      </div>

      {/* Productivity + Shift Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Productivity per hour */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Produtividade por Hora
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Total de {formatNumber(totalMachineHours, 1)} máquinas-hora em {uniqueDays} dia{uniqueDays > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground mb-1">Faturamento/h</p>
                <p className="text-lg font-display font-bold text-foreground">{formatCurrency(revenuePerHour)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground mb-1">Kg/h</p>
                <p className="text-lg font-display font-bold text-foreground">{formatNumber(kgPerHour, 2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground mb-1">Rolos/h</p>
                <p className="text-lg font-display font-bold text-foreground">{formatNumber(rollsPerHour, 2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shift Breakdown */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Produção por Turno
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shiftData.map(s => (
                <div key={s.shift} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="text-xs text-muted-foreground">({formatNumber(s.hours, 1)}h · {s.records} reg.)</span>
                  </div>
                  <span className="text-foreground font-medium tabular-nums">
                    {formatNumber(s.rolls)} rolos · {formatNumber(s.kg, 1)}kg · {formatCurrency(s.revenue)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t border-border pt-3 mt-1">
                <span className="text-foreground">Total</span>
                <span className="text-foreground tabular-nums">
                  {formatNumber(totalRolls)} rolos · {formatNumber(totalWeight, 1)}kg · {formatCurrency(totalRevenue)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Machine Performance */}
      {machinePerf.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" /> Performance por Máquina
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {machinePerf.map(m => (
                <div key={m.name} className="p-4 rounded-xl bg-muted/30 border border-border/40 hover:border-border transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className={cn("text-lg font-display font-bold",
                      m.efficiency >= 80 ? 'text-success' : m.efficiency >= 75 ? 'text-warning' : 'text-destructive'
                    )}>{formatPercent(m.efficiency)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p>{formatNumber(m.kg, 1)}kg</p>
                    </div>
                    <div>
                      <p>{formatCurrency(m.revenue)}</p>
                    </div>
                    <div>
                      <p>{formatNumber(m.hours, 1)}h</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Status */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Status do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Máquinas Ativas', value: activeMachines.length, icon: Settings2 },
              { label: 'Total de Clientes', value: clients.length, icon: Users },
              { label: 'Artigos Cadastrados', value: articles.length, icon: FileText },
              { label: 'Registros de Produção', value: formatNumber(productions.length), icon: ClipboardList },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <s.icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xl font-display font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, colorClass }: {
  label: string; value: string; icon: React.ElementType; colorClass: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn("h-4 w-4", colorClass)} />
      </div>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
    </div>
  );
}
