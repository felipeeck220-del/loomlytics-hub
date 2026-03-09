import { useState, useMemo } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, type Production } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarIcon, BarChart3, Scale, DollarSign, Gauge, Clock, Settings2, Users, FileText, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { getProductions, getMachines, getClients, getArticles } = useCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();

  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterArticle, setFilterArticle] = useState<string>('all');

  const filtered = useMemo(() => {
    let data = [...productions];
    if (filterType === 'today') {
      const today = format(new Date(), 'yyyy-MM-dd');
      data = data.filter(p => p.date === today);
    } else if (filterType === 'month') {
      const month = format(new Date(), 'yyyy-MM');
      data = data.filter(p => p.date.startsWith(month));
    } else if (filterType === 'range' && dateFrom && dateTo) {
      data = data.filter(p => p.date >= format(dateFrom, 'yyyy-MM-dd') && p.date <= format(dateTo, 'yyyy-MM-dd'));
    }
    if (filterShift !== 'all') data = data.filter(p => p.shift === filterShift);
    if (filterClient !== 'all') {
      const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterArticle !== 'all') data = data.filter(p => p.article_id === filterArticle);
    return data;
  }, [productions, filterType, dateFrom, dateTo, filterShift, filterClient, filterArticle, articles]);

  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;

  const totalHours = filtered.reduce((s, p) => s + (SHIFT_MINUTES[p.shift] / 60), 0);
  const revenuePerHour = totalHours > 0 ? totalRevenue / totalHours : 0;
  const kgPerHour = totalHours > 0 ? totalWeight / totalHours : 0;

  const shiftData = (['manha', 'tarde', 'noite'] as ShiftType[]).map(shift => {
    const shiftProds = filtered.filter(p => p.shift === shift);
    return {
      shift,
      label: SHIFT_LABELS[shift].split(' (')[0],
      rolls: shiftProds.reduce((s, p) => s + p.rolls_produced, 0),
      kg: shiftProds.reduce((s, p) => s + p.weight_kg, 0),
      revenue: shiftProds.reduce((s, p) => s + p.revenue, 0),
    };
  });

  const machinePerf = machines.filter(m => m.status === 'ativa').map(m => {
    const mProds = filtered.filter(p => p.machine_id === m.id);
    const eff = mProds.length ? mProds.reduce((s, p) => s + p.efficiency, 0) / mProds.length : 0;
    return { name: m.name, efficiency: eff };
  });

  const activeMachines = machines.filter(m => m.status === 'ativa').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral da sua produção</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filtros Avançados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="range">Período</SelectItem>
              </SelectContent>
            </Select>

            {filterType === 'range' && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-40 justify-start text-left", !dateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-40 justify-start text-left", !dateTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Turnos</SelectItem>
                {Object.entries(SHIFT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Artigo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Artigos</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Rolos', value: totalRolls, icon: BarChart3, color: 'text-primary' },
          { label: 'Peso (kg)', value: totalWeight.toFixed(1), icon: Scale, color: 'text-accent' },
          { label: 'Faturamento', value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-success' },
          { label: 'Eficiência Média', value: `${avgEfficiency.toFixed(1)}%`, icon: Gauge, color: avgEfficiency >= 80 ? 'text-success' : avgEfficiency >= 75 ? 'text-warning' : 'text-destructive' },
        ].map(kpi => (
          <div key={kpi.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</span>
              <kpi.icon className={cn("h-4 w-4", kpi.color)} />
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Productivity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Produtividade por Hora</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-xs text-muted-foreground">Faturamento/Hora</p>
              <p className="text-xl font-display font-bold text-foreground">R$ {revenuePerHour.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Kg/Hora</p>
              <p className="text-xl font-display font-bold text-foreground">{kgPerHour.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Shift Production */}
        <div className="stat-card">
          <span className="text-sm font-medium text-muted-foreground">Produção por Turno</span>
          <div className="mt-3 space-y-2">
            {shiftData.map(s => (
              <div key={s.shift} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="text-foreground font-medium">{s.rolls} rolos · {s.kg.toFixed(1)}kg · R${s.revenue.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-2">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">{totalRolls} rolos · {totalWeight.toFixed(1)}kg · R${totalRevenue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Machine Performance */}
      {machinePerf.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Performance por Máquina</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {machinePerf.map(m => (
                <div key={m.name} className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{m.name}</p>
                  <p className={cn("text-lg font-display font-bold",
                    m.efficiency >= 80 ? 'text-success' : m.efficiency >= 75 ? 'text-warning' : 'text-destructive'
                  )}>{m.efficiency.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Status */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Status do Sistema</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Máquinas Ativas', value: activeMachines, icon: Settings2 },
              { label: 'Total de Clientes', value: clients.length, icon: Users },
              { label: 'Artigos Cadastrados', value: articles.length, icon: FileText },
              { label: 'Registros de Produção', value: productions.length, icon: ClipboardList },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
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
