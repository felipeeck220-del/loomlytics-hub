import { useState, useMemo, useRef, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Loader2, RotateCcw, Download, Clock, Search,
  Package, TrendingUp, DollarSign, Gauge, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType, getCompanyShiftLabels } from '@/types';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import { usePermissions } from '@/hooks/usePermissions';
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
  const { getProductions, getMachines, getClients, getArticles, shiftSettings, loading } = useSharedCompanyData();
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const { canSeeFinancial } = usePermissions();
  const { user } = useAuth();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');

  // Fetch company logo and name
  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)('companies')
      .select('logo_url, name')
      .eq('id', user.company_id)
      .single()
      .then(({ data }: any) => {
        if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
        if (data?.name) setCompanyName(data.name);
      });
  }, [user?.company_id]);

  // Filters
  const [dayRange, setDayRange] = useState(30);
  const [customDate, setCustomDate] = useState<Date>();
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
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
  const [searchMachine, setSearchMachine] = useState('');
  const [searchClient, setSearchClient] = useState('');
  const [searchArticle, setSearchArticle] = useState('');

  const hasActiveFilters = filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMachine !== 'all' || filterMonth !== 'all' || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setDayRange(30);
    setCustomDate(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterMonth('all');
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
    setFilterMachine('all');
  };

  const availableMonths = useMemo(() => {
    const months = new Set(productions.map(p => p.date.substring(0, 7)));
    months.add(format(new Date(), 'yyyy-MM'));
    return Array.from(months).sort().reverse();
  }, [productions]);

  const filtered = useMemo(() => {
    let data = [...productions];
    const today = new Date();

    if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
      // Todo período — no date filter
    } else if (dateFrom || dateTo) {
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
      const start = format(subDays(today, dayRange - 1), 'yyyy-MM-dd');
      const end = format(today, 'yyyy-MM-dd');
      data = data.filter(p => p.date >= start && p.date <= end);
    }

    if (filterShift !== 'all') data = data.filter(p => p.shift === filterShift);
    if (filterClient !== 'all') {
      const selectedClient = clients.find(c => c.id === filterClient);
      const clientArticles = articles.filter(a => 
        a.client_id === filterClient || 
        (selectedClient && a.client_name === selectedClient.name)
      ).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterArticle !== 'all') data = data.filter(p => p.article_id === filterArticle);
    if (filterMachine !== 'all') {
      const selectedMachine = machines.find(m => m.id === filterMachine);
      data = data.filter(p => p.machine_id === filterMachine || (!p.machine_id && selectedMachine && p.machine_name === selectedMachine.name));
    }
    return data;
  }, [productions, dayRange, customDate, dateFrom, dateTo, filterMonth, filterShift, filterClient, filterArticle, filterMachine, articles, machines]);

  // KPIs
  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;
  const uniqueDays = new Set(filtered.map(p => p.date)).size || 1;

  // Calculate weighted average target efficiency
  const avgTargetEfficiency = useMemo(() => {
    if (!filtered.length) return 80;
    let total = 0;
    filtered.forEach(p => {
      const article = articles.find(a => a.id === p.article_id);
      total += (article?.target_efficiency || 80);
    });
    return total / filtered.length;
  }, [filtered, articles]);

  // By shift
  const byShift = (['manha', 'tarde', 'noite'] as ShiftType[]).map(s => {
    const sp = filtered.filter(p => p.shift === s);
    const eff = sp.length ? sp.reduce((sum, p) => sum + p.efficiency, 0) / sp.length : 0;
    return {
      name: companyShiftLabels[s].split(' (')[0],
      rolos: sp.reduce((sum, p) => sum + p.rolls_produced, 0),
      kg: sp.reduce((sum, p) => sum + p.weight_kg, 0),
      faturamento: sp.reduce((sum, p) => sum + p.revenue, 0),
      eficiencia: eff,
    };
  });

  // By machine
  const byMachine = machines.map(m => {
    const mp = filtered.filter(p => (p.machine_id && p.machine_id === m.id) || (!p.machine_id && p.machine_name === m.name));
    const eff = mp.length ? mp.reduce((s, p) => s + p.efficiency, 0) / mp.length : 0;
    const avgTargetEff = mp.length > 0
      ? mp.reduce((s, p) => { const art = articles.find(a => a.id === p.article_id); return s + (art?.target_efficiency || 80); }, 0) / mp.length
      : 80;
    return {
      name: m.name,
      rolos: mp.reduce((s, p) => s + p.rolls_produced, 0),
      kg: mp.reduce((s, p) => s + p.weight_kg, 0),
      faturamento: mp.reduce((s, p) => s + p.revenue, 0),
      eficiencia: eff,
      records: mp.length,
      targetEfficiency: avgTargetEff,
    };
  }).filter(m => m.records > 0).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));

  // By client — match via client_id OR client_name (fallback when client_id is null)
  const byClient = useMemo(() => {
    // Build a map: client name -> aggregated data
    const clientMap: Record<string, { name: string; rolos: number; kg: number; faturamento: number }> = {};

    // First, map articles to client names (prefer client from clients table, fallback to client_name on article)
    const articleClientName: Record<string, string> = {};
    articles.forEach(a => {
      if (a.client_id) {
        const client = clients.find(c => c.id === a.client_id);
        if (client) articleClientName[a.id] = client.name;
      }
      if (!articleClientName[a.id] && a.client_name) {
        articleClientName[a.id] = a.client_name;
      }
    });

    filtered.forEach(p => {
      const cName = articleClientName[p.article_id];
      if (!cName) return;
      if (!clientMap[cName]) clientMap[cName] = { name: cName, rolos: 0, kg: 0, faturamento: 0 };
      clientMap[cName].rolos += p.rolls_produced;
      clientMap[cName].kg += p.weight_kg;
      clientMap[cName].faturamento += p.revenue;
    });

    return Object.values(clientMap)
      .filter(c => c.rolos > 0)
      .sort((a, b) => b.faturamento - a.faturamento);
  }, [filtered, articles, clients]);

  // By article
  const byArticle = articles.map(a => {
    const ap = filtered.filter(p => p.article_id === a.id);
    const eff = ap.length ? ap.reduce((s, p) => s + p.efficiency, 0) / ap.length : 0;
    const client = clients.find(c => c.id === a.client_id);
    return {
      id: a.id,
      name: a.name,
      clientName: client?.name || a.client_name || '—',
      rolos: ap.reduce((s, p) => s + p.rolls_produced, 0),
      kg: ap.reduce((s, p) => s + p.weight_kg, 0),
      faturamento: ap.reduce((s, p) => s + p.revenue, 0),
      eficiencia: eff,
      targetEfficiency: a.target_efficiency || 80,
      records: ap.length,
    };
  }).filter(a => a.records > 0).sort((a, b) => b.faturamento - a.faturamento);

  const byDate = useMemo(() => {
    const acc: Record<string, { rolos: number; kg: number; faturamento: number; effSum: number; effCount: number }> = {};
    filtered.forEach(p => {
      if (!acc[p.date]) acc[p.date] = { rolos: 0, kg: 0, faturamento: 0, effSum: 0, effCount: 0 };
      acc[p.date].rolos += p.rolls_produced;
      acc[p.date].kg += p.weight_kg;
      acc[p.date].faturamento += p.revenue;
      acc[p.date].effSum += p.efficiency;
      acc[p.date].effCount += 1;
    });
    return Object.entries(acc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
        rolos: vals.rolos,
        kg: vals.kg,
        faturamento: vals.faturamento,
        eficiencia: vals.effCount > 0 ? vals.effSum / vals.effCount : 0,
      }));
  }, [filtered]);

  const periodLabel = useMemo(() => {
    const toDisplayDate = (value: string) => new Date(`${value}T12:00:00`);
    const today = new Date();

    if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
      if (filtered.length > 0) {
        const dates = filtered.map(p => p.date).sort();
        return `${format(toDisplayDate(dates[0]), 'dd/MM/yyyy')} a ${format(toDisplayDate(dates[dates.length - 1]), 'dd/MM/yyyy')}`;
      }

      return 'Sem dados no período';
    }

    if (dateFrom && dateTo) return `${format(dateFrom, 'dd/MM/yyyy')} a ${format(dateTo, 'dd/MM/yyyy')}`;
    if (dateFrom) return `${format(dateFrom, 'dd/MM/yyyy')} a ${format(today, 'dd/MM/yyyy')}`;

    if (dateTo) {
      const dates = filtered.map(p => p.date).sort();
      const startDate = dates.length > 0 ? toDisplayDate(dates[0]) : dateTo;
      return `${format(startDate, 'dd/MM/yyyy')} a ${format(dateTo, 'dd/MM/yyyy')}`;
    }

    if (customDate) {
      const formattedDate = format(customDate, 'dd/MM/yyyy');
      return `${formattedDate} a ${formattedDate}`;
    }

    if (filterMonth !== 'all') {
      const [year, month] = filterMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1, 12);
      const endDate = new Date(year, month, 0, 12);
      return `${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`;
    }

    const startDate = subDays(today, dayRange - 1);
    return `${format(startDate, 'dd/MM/yyyy')} a ${format(today, 'dd/MM/yyyy')}`;
  }, [customDate, dateFrom, dateTo, dayRange, filterMonth, filtered]);

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
          <p className="page-subtitle">Produção · {periodLabel}{filterShift !== 'all' ? ` · Turno: ${companyShiftLabels[filterShift as ShiftType].split(' (')[0]}` : ''}</p>
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
            {[7, 15, 30].map(d => (
              <Button
                key={d}
                size="sm"
                variant={dayRange === d && filterMonth === 'all' && !customDate && !dateFrom && !dateTo ? 'default' : 'outline'}
                onClick={() => { setDayRange(d); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }}
              >
                {d} Dias
              </Button>
            ))}

            <Button
              size="sm"
              variant={dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo ? 'default' : 'outline'}
              onClick={() => { setDayRange(0); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }}
            >
              Todo período
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!customDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customDate ? format(customDate, 'dd/MM/yyyy') : 'Escolher dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDate} onSelect={(d) => { setCustomDate(d); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mês</SelectItem>
                {availableMonths.map(m => {
                  const [year, month] = m.split('-').map(Number);
                  return (
                    <SelectItem key={m} value={m}>
                      {format(new Date(year, month - 1, 1, 12), 'MMMM yyyy', { locale: ptBR })}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <div className="w-px h-6 bg-border mx-1" />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!dateFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'De'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setFilterMonth('all'); setCustomDate(undefined); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!dateTo && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Até'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setFilterMonth('all'); setCustomDate(undefined); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <div className="w-px h-6 bg-border mx-1" />

            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Turno</SelectItem>
                {Object.entries(companyShiftLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMachine} onValueChange={setFilterMachine}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Máquina" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Máquina</SelectItem>
                {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cliente</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Artigo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Artigo</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total de Rolos"
          value={formatNumber(totalRolls)}
          subtitle={`Em ${uniqueDays} dias com registro`}
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
        {canSeeFinancial && <KpiCard
          label="Valor Total"
          value={formatCurrency(totalRevenue)}
          subtitle="Valor total faturado"
          icon={<DollarSign className="h-5 w-5 text-success" />}
          borderColor="border-l-success"
        />}
        <KpiCard
          label="Eficiência Média"
          value={formatPercent(avgEfficiency)}
          subtitle={`Meta: ${formatPercent(avgTargetEfficiency)}`}
          icon={<Gauge className="h-5 w-5 text-destructive" />}
          borderColor="border-l-destructive"
          extra={
            avgEfficiency < avgTargetEfficiency ? (
              <Badge variant="destructive" className="text-[10px] mt-1">Abaixo da meta ({formatPercent(avgTargetEfficiency)})</Badge>
            ) : (
              <Badge className="bg-success/10 text-success border-success/20 text-[10px] mt-1">Dentro da meta ({formatPercent(avgTargetEfficiency)})</Badge>
            )
          }
        />
      </div>

      {/* Analysis Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full h-auto grid grid-cols-3 sm:grid-cols-6 gap-1 p-1">
          <TabsTrigger value="turno">Por Turno</TabsTrigger>
          <TabsTrigger value="maquina">Por Máquina</TabsTrigger>
          <TabsTrigger value="cliente">Por Cliente</TabsTrigger>
          <TabsTrigger value="artigo">Por Artigo</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
          <TabsTrigger value="exportar" className="flex items-center gap-1"><Download className="h-3.5 w-3.5" />Exportar</TabsTrigger>
        </TabsList>

        {/* POR TURNO */}
        <TabsContent value="turno" className="mt-6 space-y-6">
          {/* Shift summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {byShift.map((s, i) => {
              const shiftColor = s.name === 'Manhã' ? 'hsl(38, 92%, 50%)' : s.name === 'Tarde' ? 'hsl(25, 95%, 53%)' : 'hsl(221, 83%, 53%)';
              const totalShiftRolls = byShift.reduce((sum, sh) => sum + sh.rolos, 0);
              const totalShiftRevenue = byShift.reduce((sum, sh) => sum + sh.faturamento, 0);
              const pctRolls = totalShiftRolls > 0 ? (s.rolos / totalShiftRolls * 100) : 0;
              const pctRevenue = totalShiftRevenue > 0 ? (s.faturamento / totalShiftRevenue * 100) : 0;
              return (
                <Card key={s.name} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: shiftColor }} />
                  <CardContent className="pt-5 pb-4 pl-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-display font-bold text-foreground text-lg">{s.name}</p>
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge variant="secondary" className="text-[10px] font-mono">{pctRolls.toFixed(1)}% da produção</Badge>
                        {canSeeFinancial && <Badge variant="secondary" className="text-[10px] font-mono">{pctRevenue.toFixed(1)}% do faturamento</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peças</p>
                        <p className="text-base font-bold text-foreground">{formatNumber(s.rolos)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peso</p>
                        <p className="text-base font-bold text-foreground">{formatWeight(s.kg)}</p>
                      </div>
                      {canSeeFinancial && (
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Faturamento</p>
                          <p className="text-base font-bold text-success">{formatCurrency(s.faturamento)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Eficiência</p>
                        <p className={cn("text-base font-bold", s.eficiencia >= 80 ? "text-success" : s.eficiencia >= 70 ? "text-warning" : "text-destructive")}>
                          {formatPercent(s.eficiencia)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart - Rolos & Kg comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Peças e Peso por Turno
                </CardTitle>
                <CardDescription>Comparativo de produção entre turnos</CardDescription>
              </CardHeader>
              <CardContent>
                {byShift.some(s => s.rolos > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={byShift} barGap={8}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number, name: string) => [formatNumber(v, 1), name === 'rolos' ? 'Peças' : 'Kg']} />
                      <Legend formatter={(value) => value === 'rolos' ? 'Peças' : 'Peso (kg)'} />
                      {byShift.map((entry) => null)}
                      <Bar dataKey="rolos" name="rolos" radius={[4, 4, 0, 0]}>
                        {byShift.map((entry, i) => (
                          <Cell key={i} fill={SHIFT_CHART_COLORS[entry.name] || CHART_COLORS[i]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
                )}
              </CardContent>
            </Card>

            {/* Pie chart - Revenue distribution */}
            {canSeeFinancial && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Faturamento por Turno
                  </CardTitle>
                  <CardDescription>Distribuição do faturamento</CardDescription>
                </CardHeader>
                <CardContent>
                  {byShift.some(s => s.faturamento > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={byShift.filter(s => s.faturamento > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          dataKey="faturamento"
                          label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                          labelLine={true}
                          paddingAngle={3}
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
            )}

            {/* Efficiency comparison */}
            <Card className={cn(canSeeFinancial ? "lg:col-span-2" : "")}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  Eficiência por Turno
                </CardTitle>
                <CardDescription>Comparativo de eficiência média</CardDescription>
              </CardHeader>
              <CardContent>
                {byShift.some(s => s.eficiencia > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={byShift} barSize={50}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis domain={[0, 100]} fontSize={12} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: number) => [`${formatPercent(v)}`, 'Eficiência']} />
                      <Bar dataKey="eficiencia" name="Eficiência" radius={[4, 4, 0, 0]}>
                        {byShift.map((entry, i) => (
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

        {/* POR MÁQUINA */}
        <TabsContent value="maquina" className="mt-6 space-y-6">
          {byMachine.length > 0 ? (() => {
            const totalMachineRolls = byMachine.reduce((s, m) => s + m.rolos, 0);
            const totalMachineRevenue = byMachine.reduce((s, m) => s + m.faturamento, 0);
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">Detalhamento por Máquina</CardTitle>
                      <CardDescription>Todos os dados de cada máquina no período</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar máquina..." value={searchMachine} onChange={e => setSearchMachine(e.target.value)} className="pl-9 h-9 text-sm" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {byMachine.filter(m => (m.name || '').toLowerCase().includes(searchMachine.toLowerCase())).map(m => {
                      const pctRolls = totalMachineRolls > 0 ? (m.rolos / totalMachineRolls * 100) : 0;
                      const pctRevenue = totalMachineRevenue > 0 ? (m.faturamento / totalMachineRevenue * 100) : 0;
                      return (
                        <div key={m.name} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-display font-bold text-foreground">{m.name}</p>
                            <Badge className={cn(
                              "text-xs",
                              m.eficiencia >= m.targetEfficiency ? "bg-success/10 text-success" : m.eficiencia >= m.targetEfficiency * 0.875 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                            )}>
                              {formatPercent(m.eficiencia)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Peças</p>
                              <p className="font-semibold text-foreground">{formatNumber(m.rolos)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Peso</p>
                              <p className="font-semibold text-foreground">{formatWeight(m.kg)}</p>
                            </div>
                            {canSeeFinancial && (
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Faturamento</p>
                                <p className="font-semibold text-success">{formatCurrency(m.faturamento)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Registros</p>
                              <p className="font-semibold text-foreground">{m.records}</p>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{pctRolls.toFixed(1)}% da produção</Badge>
                            {canSeeFinancial && <Badge variant="secondary" className="text-[10px]">{pctRevenue.toFixed(1)}% do faturamento</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })() : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Sem dados de máquinas no período selecionado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* POR CLIENTE */}
        <TabsContent value="cliente" className="mt-6 space-y-6">
          {byClient.length > 0 ? (() => {
            const totalClientRolls = byClient.reduce((s, c) => s + c.rolos, 0);
            const totalClientKg = byClient.reduce((s, c) => s + c.kg, 0);
            const totalClientRevenue = byClient.reduce((s, c) => s + c.faturamento, 0);
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">Detalhamento por Cliente</CardTitle>
                      <CardDescription>Todos os dados de cada cliente no período</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar cliente..." value={searchClient} onChange={e => setSearchClient(e.target.value)} className="pl-9 h-9 text-sm" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {byClient.filter(c => (c.name || '').toLowerCase().includes(searchClient.toLowerCase())).map(c => {
                      const pctRolls = totalClientRolls > 0 ? (c.rolos / totalClientRolls * 100) : 0;
                      const pctKg = totalClientKg > 0 ? (c.kg / totalClientKg * 100) : 0;
                      const pctRevenue = totalClientRevenue > 0 ? (c.faturamento / totalClientRevenue * 100) : 0;
                      return (
                        <div key={c.name} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-display font-bold text-foreground">{c.name}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Peças</p>
                              <p className="font-semibold text-foreground">{formatNumber(c.rolos)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Peso</p>
                              <p className="font-semibold text-foreground">{formatWeight(c.kg)}</p>
                            </div>
                            {canSeeFinancial && (
                              <div className="col-span-2">
                                <p className="text-[10px] text-muted-foreground uppercase">Faturamento</p>
                                <p className="font-semibold text-success">{formatCurrency(c.faturamento)}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{pctRolls.toFixed(1)}% das peças</Badge>
                            <Badge variant="secondary" className="text-[10px]">{pctKg.toFixed(1)}% do peso</Badge>
                            {canSeeFinancial && <Badge variant="secondary" className="text-[10px]">{pctRevenue.toFixed(1)}% do faturamento</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })() : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Sem dados de clientes no período selecionado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* POR ARTIGO */}
        <TabsContent value="artigo" className="mt-6 space-y-6">
          {byArticle.length > 0 ? (() => {
            const totalArticleRolls = byArticle.reduce((s, a) => s + a.rolos, 0);
            const totalArticleKg = byArticle.reduce((s, a) => s + a.kg, 0);
            const totalArticleRevenue = byArticle.reduce((s, a) => s + a.faturamento, 0);
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">Detalhamento por Artigo</CardTitle>
                      <CardDescription>Todos os dados de cada artigo no período</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar artigo..." value={searchArticle} onChange={e => setSearchArticle(e.target.value)} className="pl-9 h-9 text-sm" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {byArticle.filter(a => (a.name || '').toLowerCase().includes(searchArticle.toLowerCase()) || (a.clientName || '').toLowerCase().includes(searchArticle.toLowerCase())).map(a => {
                      const pctRolls = totalArticleRolls > 0 ? (a.rolos / totalArticleRolls * 100) : 0;
                      const pctKg = totalArticleKg > 0 ? (a.kg / totalArticleKg * 100) : 0;
                      const pctRevenue = totalArticleRevenue > 0 ? (a.faturamento / totalArticleRevenue * 100) : 0;
                      return (
                        <div key={a.id} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-display font-bold text-foreground">{a.name}</p>
                              <p className="text-xs text-muted-foreground">{a.clientName}</p>
                            </div>
                            <Badge className={cn(
                              "text-xs",
                              a.eficiencia >= a.targetEfficiency ? "bg-success/10 text-success" : a.eficiencia >= a.targetEfficiency * 0.875 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                            )}>
                              {formatPercent(a.eficiencia)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Peças</p>
                              <p className="font-semibold text-foreground">{formatNumber(a.rolos)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Peso</p>
                              <p className="font-semibold text-foreground">{formatWeight(a.kg)}</p>
                            </div>
                            {canSeeFinancial && (
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Faturamento</p>
                                <p className="font-semibold text-success">{formatCurrency(a.faturamento)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Registros</p>
                              <p className="font-semibold text-foreground">{a.records}</p>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{pctRolls.toFixed(1)}% das peças</Badge>
                            <Badge variant="secondary" className="text-[10px]">{pctKg.toFixed(1)}% do peso</Badge>
                            {canSeeFinancial && <Badge variant="secondary" className="text-[10px]">{pctRevenue.toFixed(1)}% do faturamento</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })() : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Sem dados de artigos no período selecionado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="evolucao" className="mt-6 space-y-6">
          {byDate.length > 1 ? (
            <>
              {/* Daily KPIs */}
              {(() => {
                const bestDay = [...byDate].sort((a, b) => b.rolos - a.rolos)[0];
                const worstDay = [...byDate].sort((a, b) => a.rolos - b.rolos)[0];
                const avgRolls = byDate.reduce((s, d) => s + d.rolos, 0) / byDate.length;
                const avgKg = byDate.reduce((s, d) => s + d.kg, 0) / byDate.length;
                const avgRevenue = byDate.reduce((s, d) => s + d.faturamento, 0) / byDate.length;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Média Diária Peças</p>
                        <p className="text-2xl font-bold text-foreground">{formatNumber(avgRolls, 1)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Média Diária Kg</p>
                        <p className="text-2xl font-bold text-foreground">{formatWeight(avgKg)}</p>
                      </CardContent>
                    </Card>
                    {canSeeFinancial && (
                      <Card>
                        <CardContent className="pt-4 pb-3">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Média Diária Faturamento</p>
                          <p className="text-2xl font-bold text-success">{formatCurrency(avgRevenue)}</p>
                        </CardContent>
                      </Card>
                    )}
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Melhor Dia</p>
                        <p className="text-2xl font-bold text-primary">{formatNumber(bestDay.rolos)}</p>
                        <p className="text-[11px] text-muted-foreground">{bestDay.date}</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Production evolution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Evolução da Produção
                  </CardTitle>
                  <CardDescription>Peças e peso ao longo do período</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={byDate}>
                      <defs>
                        <linearGradient id="evoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number, name: string) => [formatNumber(v, 1), name === 'Peças' ? 'Peças' : 'Kg']} />
                      <Legend />
                      <Area type="monotone" dataKey="rolos" stroke="hsl(221, 83%, 53%)" fill="url(#evoGrad)" strokeWidth={2} name="Peças" />
                      <Line type="monotone" dataKey="kg" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Kg" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Efficiency evolution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    Evolução da Eficiência
                  </CardTitle>
                  <CardDescription>Eficiência média diária ao longo do período</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={byDate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis domain={[0, 100]} fontSize={12} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: number) => [`${formatPercent(v)}`, 'Eficiência']} />
                      <Line type="monotone" dataKey="eficiencia" stroke="hsl(38, 92%, 50%)" strokeWidth={2.5} name="Eficiência" dot={{ r: 3, fill: 'hsl(38, 92%, 50%)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Revenue evolution */}
              {canSeeFinancial && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      Evolução do Faturamento
                    </CardTitle>
                    <CardDescription>Faturamento diário ao longo do período</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={byDate}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                        <XAxis dataKey="date" fontSize={11} />
                        <YAxis fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => [formatCurrency(v), 'Faturamento']} />
                        <Area type="monotone" dataKey="faturamento" stroke="hsl(142, 71%, 45%)" fill="url(#revGrad)" strokeWidth={2} name="Faturamento" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Daily production bar chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Produção Diária
                  </CardTitle>
                  <CardDescription>Peças produzidas por dia</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byDate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number) => [formatNumber(v, 1), 'Peças']} />
                      <Bar dataKey="rolos" name="Peças" radius={[4, 4, 0, 0]} fill="hsl(221, 83%, 53%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Dados insuficientes para mostrar evolução (mínimo 2 dias)</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* EXPORTAR RELATÓRIOS */}
        <TabsContent value="exportar" className="mt-4">
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
                      Equipe
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Formato:</Label>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                    <Button
                      size="sm"
                      variant={exportFormat === 'pdf' ? 'default' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setExportFormat('pdf')}
                    >
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant={exportFormat === 'csv' ? 'default' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setExportFormat('csv')}
                    >
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="include-charts"
                    checked={includeCharts}
                    onCheckedChange={setIncludeCharts}
                    disabled={exportFormat === 'csv'}
                  />
                  <Label htmlFor="include-charts" className={cn("text-sm cursor-pointer", exportFormat === 'csv' && "text-muted-foreground/50")}>
                    Incluir gráficos {exportFormat === 'csv' && '(só PDF)'}
                  </Label>
                </div>
              </div>

              <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                {exportMode === 'admin' ? (
                  <p>📊 <strong>Modo Admin:</strong> Inclui todos os dados financeiros (faturamento, valor por kg, receitas) além de rolos, peso e eficiência.</p>
                ) : (
                  <p>👷 <strong>Modo Equipe:</strong> Inclui apenas dados de produção (rolos, peso, eficiência). Dados financeiros são omitidos.</p>
                )}
              </div>

              {/* Export options */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">Exportação Geral</p>
                <ExportButton
                  label="Relatório Completo"
                  description={`${exportMode === 'admin' ? 'Todos os dados' : 'Dados de produção'} em ${exportFormat === 'pdf' ? 'PDF estilizado' : 'CSV'}`}
                  onClick={() => handleExport('completo', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl, companyName)}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground mb-3">Exportação Específica</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <ExportButton
                    label="Por Artigo"
                    description="Rolos, Kg, Valor"
                    onClick={() => handleExport('artigo', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl, companyName)}
                  />
                  <ExportButton
                    label="Por Máquina"
                    description="Performance individual"
                    onClick={() => handleExport('maquina', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                  <ExportButton
                    label="Por Turno"
                    description="Análise comparativa"
                    onClick={() => handleExport('turno', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                  <ExportButton
                    label="Por Cliente"
                    description="Produção por cliente"
                    onClick={() => handleExport('cliente', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
  exportFormat: 'pdf' | 'csv',
  filtered: any[],
  byShift: any[],
  byMachine: any[],
  byClient: any[],
  periodLabel: string,
  logoUrl?: string | null,
) {
  const isAdmin = mode === 'admin';

  const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtK = (v: number) => fmtN(v, 2);
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;

  // Build table data
  const sections: { title: string; headers: string[]; rows: (string | number)[][] }[] = [];

  if (type === 'completo' || type === 'turno') {
    const headers = isAdmin ? ['Turno', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Turno', 'Rolos', 'Peso (kg)'];
    const rows = byShift.map(s => isAdmin ? [s.name, fmtN(s.rolos), fmtK(s.kg), fmtR(s.faturamento)] : [s.name, fmtN(s.rolos), fmtK(s.kg)]);
    const tR = byShift.reduce((a, s) => a + s.rolos, 0), tK = byShift.reduce((a, s) => a + s.kg, 0), tF = byShift.reduce((a, s) => a + s.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK)]);
    sections.push({ title: 'Por Turno', headers, rows });
  }

  if (type === 'completo' || type === 'maquina') {
    const headers = isAdmin ? ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)', 'Faturamento'] : ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)'];
    const rows = byMachine.map(m => isAdmin ? [m.name, fmtN(m.rolos), fmtK(m.kg), fmtN(m.eficiencia, 1), fmtR(m.faturamento)] : [m.name, fmtN(m.rolos), fmtK(m.kg), fmtN(m.eficiencia, 1)]);
    const tR = byMachine.reduce((a, m) => a + m.rolos, 0), tK = byMachine.reduce((a, m) => a + m.kg, 0);
    const avgE = byMachine.length ? byMachine.reduce((a, m) => a + m.eficiencia, 0) / byMachine.length : 0;
    const tF = byMachine.reduce((a, m) => a + m.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtN(avgE, 1), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK), fmtN(avgE, 1)]);
    sections.push({ title: 'Por Máquina', headers, rows });
  }

  if (type === 'completo' || type === 'cliente') {
    const headers = isAdmin ? ['Cliente', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Cliente', 'Rolos', 'Peso (kg)'];
    const rows = byClient.map(c => isAdmin ? [c.name, fmtN(c.rolos), fmtK(c.kg), fmtR(c.faturamento)] : [c.name, fmtN(c.rolos), fmtK(c.kg)]);
    const tR = byClient.reduce((a, c) => a + c.rolos, 0), tK = byClient.reduce((a, c) => a + c.kg, 0), tF = byClient.reduce((a, c) => a + c.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK)]);
    sections.push({ title: 'Por Cliente', headers, rows });
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
    const headers = isAdmin ? ['Artigo', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Artigo', 'Rolos', 'Peso (kg)'];
    const artVals = Object.values(articleMap).sort((a, b) => b.rolos - a.rolos);
    const rows = artVals.map(a => isAdmin ? [a.name, fmtN(a.rolos), fmtK(a.kg), fmtR(a.faturamento)] : [a.name, fmtN(a.rolos), fmtK(a.kg)]);
    const tR = artVals.reduce((ac, a) => ac + a.rolos, 0), tK = artVals.reduce((ac, a) => ac + a.kg, 0), tF = artVals.reduce((ac, a) => ac + a.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK)]);
    sections.push({ title: 'Por Artigo', headers, rows });
  }

  if (exportFormat === 'csv') {
    let csvContent = '';
    const BOM = '\uFEFF';
    const addLine = (values: (string | number)[]) => { csvContent += values.map(v => `"${v}"`).join(';') + '\n'; };
    sections.forEach(sec => {
      addLine([sec.title]);
      addLine(sec.headers);
      sec.rows.forEach(r => addLine(r));
      csvContent += '\n';
    });
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${type}-${mode}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    // PDF via styled print window
    const modeLabel = mode === 'admin' ? 'Administrador' : 'Equipe';
    const date = new Date().toLocaleDateString('pt-BR');

    // Generate SVG bar chart HTML for a section
    const buildChart = (data: { label: string; value: number }[], color: string, unit: string) => {
      if (data.length === 0) return '';
      const maxVal = Math.max(...data.map(d => d.value), 1);
      const barH = 28;
      const gap = 6;
      const chartH = data.length * (barH + gap) + 10;
      const labelW = 120;
      const chartW = 500;
      const bars = data.map((d, i) => {
        const w = Math.max((d.value / maxVal) * (chartW - labelW - 60), 2);
        const y = i * (barH + gap) + 5;
        const valLabel = unit === 'R$' ? `R$ ${fmtN(d.value, 2)}` : fmtN(d.value, unit === '%' ? 1 : 0) + (unit === '%' ? '%' : unit === 'kg' ? ' kg' : '');
        return `
          <g>
            <text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" fill="#475569">${d.label}</text>
            <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
            <text x="${labelW + w + 6}" y="${y + barH / 2 + 4}" font-size="11" fill="#1e293b" font-weight="500">${valLabel}</text>
          </g>`;
      }).join('');
      return `<svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg" style="margin:12px 0 8px 0;">${bars}</svg>`;
    };

    let tablesHtml = sections.map(sec => {
      let chartHtml = '';
      if (_includeCharts) {
        // Determine chart data based on section title
        if (sec.title === 'Por Turno') {
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Eficiência por Turno (%)</p>';
          chartHtml += buildChart(byShift.map(s => ({ label: s.name, value: s.eficiencia })), '#f59e0b', '%');
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Rolos por Turno</p>';
          chartHtml += buildChart(byShift.map(s => ({ label: s.name, value: s.rolos })), '#2563eb', '');
          if (isAdmin) {
            chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Faturamento por Turno</p>';
            chartHtml += buildChart(byShift.map(s => ({ label: s.name, value: s.faturamento })), '#16a34a', 'R$');
          }
        } else if (sec.title === 'Por Máquina') {
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Eficiência por Máquina (%)</p>';
          chartHtml += buildChart(byMachine.slice(0, 10).map(m => ({ label: m.name, value: m.eficiencia })), '#f59e0b', '%');
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Rolos por Máquina</p>';
          chartHtml += buildChart(byMachine.slice(0, 10).map(m => ({ label: m.name, value: m.rolos })), '#2563eb', '');
        } else if (sec.title === 'Por Cliente') {
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Peso por Cliente (kg)</p>';
          chartHtml += buildChart(byClient.slice(0, 8).map(c => ({ label: c.name, value: c.kg })), '#8b5cf6', 'kg');
          if (isAdmin) {
            chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Faturamento por Cliente</p>';
            chartHtml += buildChart(byClient.slice(0, 8).map(c => ({ label: c.name, value: c.faturamento })), '#16a34a', 'R$');
          }
        } else if (sec.title === 'Por Artigo') {
          const articleRows = sec.rows.slice(0, 10);
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Rolos por Artigo</p>';
          chartHtml += buildChart(articleRows.map(r => ({ label: String(r[0]), value: parseFloat(String(r[1]).replace(/\./g, '').replace(',', '.')) || 0 })), '#0ea5e9', '');
        }
      }

      return `
        <div class="section">
          <h2>${sec.title}</h2>
          ${chartHtml}
          <table>
            <thead><tr>${sec.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${sec.rows.map((r, ri) => `<tr class="${ri === sec.rows.length - 1 ? 'total-row' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title>
    <style>
      @page { margin: 15mm 20mm; size: A4; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; padding: 0; }
      .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: #fff; padding: 20px 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; }
      .header-logo { height: 48px; width: 48px; border-radius: 8px; object-fit: contain; background: rgba(255,255,255,0.15); padding: 4px; }
      .header-text h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
      .header .meta { font-size: 12px; opacity: 0.85; display: flex; gap: 16px; }
      .section { margin-bottom: 28px; }
      .section h2 { font-size: 15px; font-weight: 600; color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
      td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; }
      tr:nth-child(even) td { background: #fafbfc; }
      tr:hover td { background: #f0f4ff; }
      .total-row td { background: #e2e8f0 !important; font-weight: 700; border-top: 2px solid #94a3b8; }
      svg { display: block; }
      .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #94a3b8; text-align: center; }
    </style></head><body>
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" class="header-logo" />` : ''}
        <div class="header-text">
          <h1>Relatório de Produção</h1>
          <div class="meta">
            <span>Período: ${periodLabel}</span>
            <span>Modo: ${modeLabel}</span>
            <span>Gerado em: ${date}</span>
          </div>
        </div>
      </div>
      ${tablesHtml}
      <div class="footer">Relatório gerado automaticamente pelo sistema MalhaGest · ${date}</div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  }
}
