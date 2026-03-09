import { useState, useMemo } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, BarChart3, Scale, DollarSign, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['hsl(215, 80%, 45%)', 'hsl(170, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(280, 60%, 50%)'];

export default function Reports() {
  const { getProductions, getMachines, getClients, getArticles } = useCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();

  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterMachine, setFilterMachine] = useState<string>('all');

  const filtered = useMemo(() => {
    let data = [...productions];
    if (dateFrom && dateTo) {
      data = data.filter(p => p.date >= format(dateFrom, 'yyyy-MM-dd') && p.date <= format(dateTo, 'yyyy-MM-dd'));
    }
    if (filterShift !== 'all') data = data.filter(p => p.shift === filterShift);
    if (filterClient !== 'all') {
      const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterMachine !== 'all') data = data.filter(p => p.machine_id === filterMachine);
    return data;
  }, [productions, dateFrom, dateTo, filterShift, filterClient, filterMachine, articles]);

  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;

  // By machine
  const byMachine = machines.map(m => {
    const mProds = filtered.filter(p => p.machine_id === m.id);
    return {
      name: m.name,
      rolos: mProds.reduce((s, p) => s + p.rolls_produced, 0),
      kg: mProds.reduce((s, p) => s + p.weight_kg, 0),
      faturamento: mProds.reduce((s, p) => s + p.revenue, 0),
      eficiencia: mProds.length ? mProds.reduce((s, p) => s + p.efficiency, 0) / mProds.length : 0,
    };
  }).filter(m => m.rolos > 0);

  // By shift
  const byShift = (['manha', 'tarde', 'noite'] as ShiftType[]).map(s => {
    const sProds = filtered.filter(p => p.shift === s);
    return {
      name: SHIFT_LABELS[s].split(' (')[0],
      rolos: sProds.reduce((sum, p) => sum + p.rolls_produced, 0),
      kg: sProds.reduce((sum, p) => sum + p.weight_kg, 0),
      faturamento: sProds.reduce((sum, p) => sum + p.revenue, 0),
    };
  });

  // By client
  const byClient = clients.map(c => {
    const cArticles = articles.filter(a => a.client_id === c.id).map(a => a.id);
    const cProds = filtered.filter(p => cArticles.includes(p.article_id));
    return {
      name: c.name,
      value: cProds.reduce((s, p) => s + p.revenue, 0),
    };
  }).filter(c => c.value > 0);

  // Evolution (by date)
  const byDate = Object.entries(
    filtered.reduce((acc, p) => {
      if (!acc[p.date]) acc[p.date] = { rolos: 0, kg: 0, faturamento: 0 };
      acc[p.date].rolos += p.rolls_produced;
      acc[p.date].kg += p.weight_kg;
      acc[p.date].faturamento += p.revenue;
      return acc;
    }, {} as Record<string, { rolos: number; kg: number; faturamento: number }>)
  ).map(([date, vals]) => ({ date: format(new Date(date), 'dd/MM'), ...vals })).sort((a, b) => a.date.localeCompare(b.date));

  // Projection (simple: average daily * 30)
  const uniqueDays = new Set(filtered.map(p => p.date)).size || 1;
  const dailyAvgRevenue = totalRevenue / uniqueDays;
  const projectedMonthly = dailyAvgRevenue * 30;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground text-sm">Análise detalhada da produção</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Filtros Avançados</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-40 justify-start text-left", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-40 justify-start text-left", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{dateTo ? format(dateTo, "dd/MM/yyyy") : "Data Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Turnos</SelectItem>
                {Object.entries(SHIFT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMachine} onValueChange={setFilterMachine}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Máquina" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Rolos', value: totalRolls, icon: BarChart3, color: 'text-primary' },
          { label: 'Total Produzido', value: `${totalWeight.toFixed(1)} kg`, icon: Scale, color: 'text-accent' },
          { label: 'Valor Total', value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-success' },
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Machine */}
        {byMachine.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Produção por Máquina</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byMachine}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="rolos" fill="hsl(215, 80%, 45%)" name="Rolos" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* By Shift */}
        {byShift.some(s => s.rolos > 0) && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Produção por Turno</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byShift}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="rolos" fill="hsl(170, 60%, 42%)" name="Rolos" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="kg" fill="hsl(38, 92%, 50%)" name="Kg" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* By Client */}
        {byClient.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Faturamento por Cliente</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byClient} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {byClient.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Evolution */}
        {byDate.length > 1 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Evolução da Produção</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rolos" stroke="hsl(215, 80%, 45%)" name="Rolos" strokeWidth={2} />
                  <Line type="monotone" dataKey="kg" stroke="hsl(170, 60%, 42%)" name="Kg" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Machine Efficiency */}
        {byMachine.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Eficiência por Máquina</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byMachine}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Bar dataKey="eficiencia" fill="hsl(215, 80%, 45%)" name="Eficiência %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Projection */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Projeção Futura</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Média diária de faturamento</p>
                <p className="text-xl font-display font-bold text-foreground">R$ {dailyAvgRevenue.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground">Projeção mensal (30 dias)</p>
                <p className="text-xl font-display font-bold text-primary">R$ {projectedMonthly.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Dias com produção</p>
                <p className="text-xl font-display font-bold text-foreground">{uniqueDays}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {productions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Registre produções para ver os relatórios detalhados</p>
        </div>
      )}
    </div>
  );
}
