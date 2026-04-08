import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, getCompanyShiftMinutes, getCompanyShiftLabels } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subDays, differenceInCalendarDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Scale, DollarSign, Gauge, Clock,
  Settings2, Users, FileText, ClipboardList, Loader2,
  Factory, RotateCcw, Plus, Eye, BarChart3 as ChartIcon, Package, TrendingUp,
  AlertTriangle, Wrench, RefreshCw, PauseCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';

import {
  Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import MachinePerformanceModal from '@/components/MachinePerformanceModal';
import { usePermissions } from '@/hooks/usePermissions';

function getCurrentShift(): ShiftType {
  const h = new Date().getHours();
  if (h >= 5 && h < 13) return 'manha';
  if (h >= 13 && h < 22) return 'tarde';
  return 'noite';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { getProductions, getMachines, getMachineLogs, getClients, getArticles, getWeavers, shiftSettings, loading } = useSharedCompanyData();
  const { canSeeFinancial } = usePermissions();
  const companyShiftMinutes = useMemo(() => getCompanyShiftMinutes(shiftSettings), [shiftSettings]);
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();
  const weavers = getWeavers();
  const allMachineLogs = getMachineLogs();

  const [dayRange, setDayRange] = useState(15);
  const [customDate, setCustomDate] = useState<Date>();
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterArticle, setFilterArticle] = useState<string>('all');
  const [showAllMachines, setShowAllMachines] = useState(false);
  const [nowTick, setNowTick] = useState(new Date());

  const currentShift = getCurrentShift();

  // Machines that are stopped (not ativa, not inativa)
  const stoppedMachines = useMemo(() => 
    machines.filter(m => m.status !== 'ativa' && m.status !== 'inativa'),
    [machines]
  );

  // Build a map of machine_id -> started_at from logs (latest open log per machine)
  const stopStartTimes = useMemo(() => {
    const map: Record<string, string> = {};
    stoppedMachines.forEach(m => {
      // Find the latest log for this machine that has no ended_at
      const openLogs = allMachineLogs
        .filter(l => l.machine_id === m.id && !l.ended_at)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
      if (openLogs.length > 0) {
        map[m.id] = openLogs[0].started_at;
      }
    });
    return map;
  }, [stoppedMachines, allMachineLogs]);

  // Real-time tick for elapsed time
  useEffect(() => {
    if (stoppedMachines.length === 0) return;
    const interval = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(interval);
  }, [stoppedMachines.length]);

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
    // Always include current month
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
      const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterArticle !== 'all') data = data.filter(p => p.article_id === filterArticle);
    return data;
  }, [productions, dayRange, customDate, dateFrom, dateTo, filterMonth, filterShift, filterClient, filterArticle, articles]);

  // ── Previous period for comparison ──
  const currentPeriod = useMemo(() => {
    const today = new Date();
    if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) return null;
    if (dateFrom || dateTo) {
      return {
        start: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '2000-01-01',
        end: dateTo ? format(dateTo, 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd'),
      };
    }
    if (filterMonth !== 'all') {
      const [y, m] = filterMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return { start: `${filterMonth}-01`, end: `${filterMonth}-${String(lastDay).padStart(2, '0')}` };
    }
    if (customDate) {
      const d = format(customDate, 'yyyy-MM-dd');
      return { start: d, end: d };
    }
    return {
      start: format(subDays(today, dayRange - 1), 'yyyy-MM-dd'),
      end: format(today, 'yyyy-MM-dd'),
    };
  }, [dayRange, customDate, dateFrom, dateTo, filterMonth]);

  const previousPeriod = useMemo(() => {
    if (!currentPeriod) return null;
    if (filterMonth !== 'all') {
      const currentMonthDate = new Date(`${filterMonth}-01T12:00:00`);
      const previousMonthDate = subMonths(currentMonthDate, 1);
      return { start: format(startOfMonth(previousMonthDate), 'yyyy-MM-dd'), end: format(endOfMonth(previousMonthDate), 'yyyy-MM-dd') };
    }
    if (customDate) {
      const prev = format(subDays(customDate, 7), 'yyyy-MM-dd');
      return { start: prev, end: prev };
    }
    const startDate = new Date(currentPeriod.start + 'T12:00:00');
    const endDate = new Date(currentPeriod.end + 'T12:00:00');
    const durationDays = differenceInCalendarDays(endDate, startDate) + 1;
    const prevEnd = subDays(startDate, 1);
    const prevStart = subDays(prevEnd, durationDays - 1);
    return { start: format(prevStart, 'yyyy-MM-dd'), end: format(prevEnd, 'yyyy-MM-dd') };
  }, [currentPeriod, filterMonth, customDate]);

  const prevFiltered = useMemo(() => {
    if (!previousPeriod) return [];
    let data = [...productions];
    data = data.filter(p => p.date >= previousPeriod.start && p.date <= previousPeriod.end);
    if (filterShift !== 'all') data = data.filter(p => p.shift === filterShift);
    if (filterClient !== 'all') {
      const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
      data = data.filter(p => clientArticles.includes(p.article_id));
    }
    if (filterArticle !== 'all') data = data.filter(p => p.article_id === filterArticle);
    return data;
  }, [productions, previousPeriod, filterShift, filterClient, filterArticle, articles]);

  const showComparison = currentPeriod !== null;

  const totalRolls = filtered.reduce((s, p) => s + p.rolls_produced, 0);
  const totalWeight = filtered.reduce((s, p) => s + p.weight_kg, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const avgEfficiency = filtered.length ? filtered.reduce((s, p) => s + p.efficiency, 0) / filtered.length : 0;

  // Previous period KPIs
  const prevTotalRolls = prevFiltered.reduce((s, p) => s + p.rolls_produced, 0);
  const prevTotalWeight = prevFiltered.reduce((s, p) => s + p.weight_kg, 0);
  const prevTotalRevenue = prevFiltered.reduce((s, p) => s + p.revenue, 0);
  const prevAvgEfficiency = prevFiltered.length ? prevFiltered.reduce((s, p) => s + p.efficiency, 0) / prevFiltered.length : 0;

  // Calculate weighted average target efficiency from articles used in filtered productions
  const avgTargetEfficiency = useMemo(() => {
    if (!filtered.length) return 80;
    let totalTarget = 0;
    let count = 0;
    filtered.forEach(p => {
      const article = articles.find(a => a.id === p.article_id);
      const target = article?.target_efficiency || 80;
      totalTarget += target;
      count++;
    });
    return count > 0 ? totalTarget / count : 80;
  }, [filtered, articles]);

  const calendarHours = useMemo(() => {
    let days: number;
    if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
      // All data — use only days that have production records
      const uniqueDays = new Set(filtered.map(p => p.date)).size;
      days = uniqueDays || 1;
    } else if (dateFrom && dateTo) {
      days = differenceInCalendarDays(dateTo, dateFrom) + 1;
    } else if (dateFrom) {
      days = differenceInCalendarDays(new Date(), dateFrom) + 1;
    } else if (dateTo) {
      days = 1;
    } else if (customDate) {
      days = 1;
    } else if (filterMonth !== 'all') {
      const now = new Date();
      const currentMonthStr = format(now, 'yyyy-MM');
      if (filterMonth === currentMonthStr) {
        // Current month: use only days that have production records
        const uniqueDaysWithProduction = new Set(filtered.map(p => p.date)).size;
        days = uniqueDaysWithProduction || 1;
      } else {
        const [y, m] = filterMonth.split('-').map(Number);
        days = new Date(y, m, 0).getDate();
      }
    } else {
      days = dayRange;
    }

    if (filterShift !== 'all') {
      const shiftMinutes = companyShiftMinutes[filterShift as ShiftType] || 480;
      return days * (shiftMinutes / 60);
    }
    return days * 24;
  }, [customDate, filterMonth, dayRange, filterShift, dateFrom, dateTo, companyShiftMinutes, filtered]);

  const revenuePerHour = calendarHours > 0 ? totalRevenue / calendarHours : 0;
  const kgPerHour = calendarHours > 0 ? totalWeight / calendarHours : 0;

  const shiftData = (['manha', 'tarde', 'noite'] as ShiftType[]).map(shift => {
    const sp = filtered.filter(p => p.shift === shift);
    return {
      shift,
      label: companyShiftLabels[shift].split(' (')[0],
      rolls: sp.reduce((s, p) => s + p.rolls_produced, 0),
      kg: sp.reduce((s, p) => s + p.weight_kg, 0),
      revenue: sp.reduce((s, p) => s + p.revenue, 0),
    };
  });

  const machinePerf = machines.map(m => {
    const mp = filtered.filter(p => (p.machine_id && p.machine_id === m.id) || (!p.machine_id && p.machine_name === m.name));
    const eff = mp.length ? mp.reduce((s, p) => s + p.efficiency, 0) / mp.length : 0;
    const avgTargetEff = mp.length > 0
      ? mp.reduce((s, p) => { const art = articles.find(a => a.id === p.article_id); return s + (art?.target_efficiency || 80); }, 0) / mp.length
      : 80;
    return { name: m.name, rolls: mp.reduce((s, p) => s + p.rolls_produced, 0), kg: mp.reduce((s, p) => s + p.weight_kg, 0), efficiency: eff, records: mp.length, targetEfficiency: avgTargetEff };
  }).sort((a, b) => b.rolls - a.rolls).slice(0, 5);

  const trendData = useMemo(() => {
    const byDate: Record<string, { rolos: number; kg: number; faturamento: number; effSum: number; effCount: number }> = {};
    filtered.forEach(p => {
      if (!byDate[p.date]) byDate[p.date] = { rolos: 0, kg: 0, faturamento: 0, effSum: 0, effCount: 0 };
      byDate[p.date].rolos += p.rolls_produced;
      byDate[p.date].kg += p.weight_kg;
      byDate[p.date].faturamento += p.revenue;
      byDate[p.date].effSum += p.efficiency;
      byDate[p.date].effCount += 1;
    });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
      date: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
      rolos: d.rolos,
      kg: Math.round(d.kg * 100) / 100,
      faturamento: Math.round(d.faturamento * 100) / 100,
      eficiencia: d.effCount > 0 ? Math.round((d.effSum / d.effCount) * 10) / 10 : 0,
    }));
  }, [filtered]);

  const periodSummary = useMemo(() => {
    const toDisplayDate = (value: string) => new Date(`${value}T12:00:00`);
    const today = new Date();

    if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
      if (filtered.length > 0) {
        const dates = filtered.map(p => p.date).sort();
        return {
          label: `${format(toDisplayDate(dates[0]), 'dd/MM/yyyy')} a ${format(toDisplayDate(dates[dates.length - 1]), 'dd/MM/yyyy')}`,
        };
      }

      return { label: 'Sem dados no período' };
    }

    if (dateFrom && dateTo) {
      return {
        label: `${format(dateFrom, 'dd/MM/yyyy')} a ${format(dateTo, 'dd/MM/yyyy')}`,
      };
    }

    if (dateFrom) {
      return {
        label: `${format(dateFrom, 'dd/MM/yyyy')} a ${format(today, 'dd/MM/yyyy')}`,
      };
    }

    if (dateTo) {
      const dates = filtered.map(p => p.date).sort();
      const startDate = dates.length > 0 ? toDisplayDate(dates[0]) : dateTo;
      return {
        label: `${format(startDate, 'dd/MM/yyyy')} a ${format(dateTo, 'dd/MM/yyyy')}`,
      };
    }

    if (customDate) {
      const formattedDate = format(customDate, 'dd/MM/yyyy');
      return { label: `${formattedDate} a ${formattedDate}` };
    }

    if (filterMonth !== 'all') {
      const [year, month] = filterMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1, 12);
      const endDate = new Date(year, month, 0, 12);
      return {
        label: `${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`,
      };
    }

    const startDate = subDays(today, dayRange - 1);
    return {
      label: `${format(startDate, 'dd/MM/yyyy')} a ${format(today, 'dd/MM/yyyy')}`,
    };
  }, [customDate, dateFrom, dateTo, dayRange, filterMonth, filtered]);

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
            Visão geral da produção · {periodSummary.label}{filterShift !== 'all' ? ` · Turno: ${companyShiftLabels[filterShift as ShiftType].split(' (')[0]}` : ''}
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
            {[7, 15, 30].map(d => (
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

            <Button
              size="sm"
              variant={dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo ? 'default' : 'outline'}
              onClick={() => { setDayRange(0); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }}
              className={cn("min-w-[60px] rounded-lg", dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo && 'btn-gradient')}
            >
              Todo período
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("rounded-lg", !customDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customDate ? format(customDate, 'dd/MM/yyyy') : 'Dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDate} onSelect={(d) => { setCustomDate(d); setFilterMonth('all'); setDayRange(15); setDateFrom(undefined); setDateTo(undefined); }} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}>
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
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
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Turno</SelectItem>
                {Object.entries(companyShiftLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cliente</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterArticle} onValueChange={setFilterArticle}>
              <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Artigo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Artigo</SelectItem>
                {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards - border-l-4 style with comparison */}
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", canSeeFinancial ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <DashboardKpiCard
          label="Rolos"
          value={formatNumber(totalRolls)}
          previousValue={prevTotalRolls}
          currentRaw={totalRolls}
          borderColor="border-l-primary"
          icon={<Package className="h-5 w-5" />}
          showComparison={showComparison}
          footer={`${filtered.length} registros`}
        />
        <DashboardKpiCard
          label="Peso Total"
          value={`${formatNumber(totalWeight, 1)} kg`}
          previousValue={prevTotalWeight}
          currentRaw={totalWeight}
          borderColor="border-l-success"
          icon={<Scale className="h-5 w-5" />}
          showComparison={showComparison}
          footer={`${formatNumber(kgPerHour, 2)} kg/hora`}
          formatPrev={(v) => `${formatNumber(v, 1)} kg`}
        />
        {canSeeFinancial && <DashboardKpiCard
          label="Faturamento"
          value={formatCurrency(totalRevenue)}
          previousValue={prevTotalRevenue}
          currentRaw={totalRevenue}
          borderColor="border-l-warning"
          icon={<DollarSign className="h-5 w-5" />}
          showComparison={showComparison}
          footer={`${formatCurrency(revenuePerHour)}/hora`}
          formatPrev={(v) => formatCurrency(v)}
        />}
        <DashboardKpiCard
          label="Eficiência"
          value={formatPercent(avgEfficiency)}
          previousValue={prevAvgEfficiency}
          currentRaw={avgEfficiency}
          borderColor={avgEfficiency >= avgTargetEfficiency ? "border-l-success" : avgEfficiency >= (avgTargetEfficiency - 10) ? "border-l-warning" : "border-l-destructive"}
          icon={<Gauge className="h-5 w-5" />}
          showComparison={showComparison}
          footer={avgEfficiency >= avgTargetEfficiency ? `Dentro da meta (${formatPercent(avgTargetEfficiency)})` : `Abaixo da meta (${formatPercent(avgTargetEfficiency)})`}
          formatPrev={(v) => formatPercent(v)}
          efficiencyValue={avgEfficiency}
          targetEfficiency={avgTargetEfficiency}
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
                <p className="text-xs text-white/60 font-light">Rolos, Kg, Faturamento e Eficiência por dia</p>
              </div>
              <CardContent className="pt-4 pb-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRolos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(210, 100%, 52%)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(210, 100%, 52%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorKg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorEff" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 92%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(220, 9%, 55%)' }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(220, 9%, 55%)' }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(220, 9%, 55%)' }} domain={[0, 100]} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '10px', border: '1px solid hsl(220, 15%, 90%)', fontSize: '12px', boxShadow: '0 4px 20px hsl(0 0% 0% / 0.08)' }}
                        formatter={(v: number, name: string) => {
                          if (name === 'rolos') return [formatNumber(v), 'Rolos'];
                          if (name === 'kg') return [formatNumber(v, 2) + ' kg', 'Peso'];
                          if (name === 'faturamento') return [formatCurrency(v), 'Faturamento'];
                          if (name === 'eficiencia') return [formatPercent(v), 'Eficiência'];
                          return [v, name];
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={30}
                        formatter={(value: string) => {
                          const labels: Record<string, string> = { rolos: 'Rolos', kg: 'Kg', faturamento: 'Faturamento', eficiencia: 'Eficiência' };
                          return <span style={{ fontSize: '11px', color: 'hsl(220, 9%, 55%)' }}>{labels[value] || value}</span>;
                        }}
                      />
                      <Area yAxisId="left" type="monotone" dataKey="rolos" stroke="hsl(210, 100%, 52%)" strokeWidth={2} fill="url(#colorRolos)" />
                      <Area yAxisId="left" type="monotone" dataKey="kg" stroke="hsl(142, 71%, 45%)" strokeWidth={2} fill="url(#colorKg)" />
                      {canSeeFinancial && <Area yAxisId="left" type="monotone" dataKey="faturamento" stroke="hsl(38, 92%, 50%)" strokeWidth={2} fill="url(#colorFat)" />}
                      <Area yAxisId="right" type="monotone" dataKey="eficiencia" stroke="hsl(0, 84%, 60%)" strokeWidth={2} fill="url(#colorEff)" />
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
                    {canSeeFinancial && <span className="text-sm font-semibold text-foreground">{formatCurrency(s.revenue)}</span>}
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
                  {canSeeFinancial && <span className="text-sm font-bold text-foreground">{formatCurrency(totalRevenue)}</span>}
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
                      m.efficiency >= m.targetEfficiency ? "bg-success/10 text-success" :
                      m.efficiency >= m.targetEfficiency * 0.875 ? "bg-warning/10 text-warning" :
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
              {canSeeFinancial && <div className="flex items-center justify-between p-3 rounded-xl bg-warning/5 border border-warning/10">
                <span className="text-sm text-foreground">Faturamento/Hora</span>
                <span className="text-sm font-bold text-warning">{formatCurrency(revenuePerHour)}</span>
              </div>}
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

      {/* Stopped Machines Section */}
      {stoppedMachines.length > 0 && (
        <Card className="shadow-material border-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <PauseCircle className="h-4 w-4 text-warning" />
              Máquinas Paradas ({stoppedMachines.length})
            </CardTitle>
            <CardDescription className="text-xs">Máquinas fora de operação com tempo de parada em tempo real</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stoppedMachines.map(m => {
                const startedAt = stopStartTimes[m.id];
                const elapsed = startedAt ? Math.floor((nowTick.getTime() - new Date(startedAt).getTime()) / 1000) : null;
                const hours = elapsed !== null ? Math.floor(elapsed / 3600) : 0;
                const minutes = elapsed !== null ? Math.floor((elapsed % 3600) / 60) : 0;
                const seconds = elapsed !== null ? elapsed % 60 : 0;
                const timeStr = elapsed !== null
                  ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                  : '--:--:--';

                const statusLabels: Record<string, string> = {
                  manutencao_preventiva: 'Manutenção Preventiva',
                  manutencao_corretiva: 'Manutenção Corretiva',
                  troca_artigo: 'Troca de Artigo',
                };
                const statusIcons: Record<string, React.ReactNode> = {
                  manutencao_preventiva: <Wrench className="h-4 w-4" />,
                  manutencao_corretiva: <AlertTriangle className="h-4 w-4" />,
                  troca_artigo: <RefreshCw className="h-4 w-4" />,
                };
                const statusColors: Record<string, string> = {
                  manutencao_preventiva: 'text-warning bg-warning/10 border-warning/20',
                  manutencao_corretiva: 'text-destructive bg-destructive/10 border-destructive/20',
                  troca_artigo: 'text-info bg-info/10 border-info/20',
                };
                const colorClass = statusColors[m.status] || 'text-muted-foreground bg-muted border-border';

                return (
                  <div key={m.id} className={cn("rounded-xl border p-4 space-y-2", colorClass)}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{m.name}</span>
                      <span className="flex items-center gap-1 text-xs">
                        {statusIcons[m.status]}
                      </span>
                    </div>
                    <p className="text-xs opacity-80">{statusLabels[m.status] || m.status}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <Clock className="h-3.5 w-3.5 opacity-70" />
                      <span className="font-mono text-lg font-bold tracking-wider">{timeStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <MachinePerformanceModal
        open={showAllMachines}
        onOpenChange={setShowAllMachines}
        machines={machines}
        productions={productions}
        clients={clients}
        articles={articles}
        shiftSettings={shiftSettings}
      />
    </div>
  );
}

function DashboardKpiCard({ label, value, previousValue, currentRaw, borderColor, icon, showComparison, footer, formatPrev, efficiencyValue, targetEfficiency }: {
  label: string; value: string; previousValue: number; currentRaw: number; borderColor: string; icon: React.ReactNode; showComparison: boolean; footer: string; formatPrev?: (v: number) => string; efficiencyValue?: number; targetEfficiency?: number;
}) {
  const variation = previousValue > 0
    ? ((currentRaw - previousValue) / previousValue) * 100
    : (currentRaw > 0 ? 100 : 0);
  const isPositive = variation >= 0;
  const showVariation = showComparison && (previousValue > 0 || currentRaw > 0);

  const target = targetEfficiency || 80;
  const effBg = efficiencyValue !== undefined
    ? efficiencyValue >= target ? 'bg-success/10' : efficiencyValue >= (target - 10) ? 'bg-warning/10' : 'bg-destructive/10'
    : '';

  const prevDisplay = formatPrev ? formatPrev(previousValue) : formatNumber(previousValue);

  return (
    <Card className={cn('border-l-4', borderColor, effBg)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {showVariation && (
              <Badge variant="outline" className={cn(
                'text-[10px] mt-1',
                isPositive
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
              )}>
                {isPositive ? '▲' : '▼'} {formatPercent(Math.abs(variation))}
              </Badge>
            )}
            {showComparison && (
              <p className="text-xs text-muted-foreground mt-1">Anterior: {prevDisplay}</p>
            )}
            <p className="text-[11px] text-muted-foreground font-light mt-1">{footer}</p>
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
