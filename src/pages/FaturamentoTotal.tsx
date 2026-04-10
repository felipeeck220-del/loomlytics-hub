import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, subDays, differenceInCalendarDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Loader2, RotateCcw, Package, Factory, Recycle, DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const sb = (table: string) => (supabase.from as any)(table);

async function fetchAllPaginated<T>(table: string, companyId: string, orderCol: string = 'created_at', ascending = false): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb(table).select('*').eq('company_id', companyId).order(orderCol, { ascending }).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

interface ProductionRow { id: string; date: string; revenue: number; company_id: string; }
interface OutsourceRow { id: string; date: string; total_revenue: number; company_id: string; }
interface ResidueRow { id: string; date: string; total: number; company_id: string; }

function RevenueKpiCard({ label, value, previousValue, icon, borderColor, showComparison }: {
  label: string; value: number; previousValue: number; icon: React.ReactNode; borderColor: string; showComparison: boolean;
}) {
  const variation = previousValue > 0
    ? ((value - previousValue) / previousValue) * 100
    : (value > 0 ? 100 : 0);
  const isPositive = variation >= 0;
  const showVariation = showComparison && (previousValue > 0 || value > 0);

  return (
    <Card className={cn('border-l-4', borderColor)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(value)}</p>
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
              <p className="text-xs text-muted-foreground mt-1">Anterior: {formatCurrency(previousValue)}</p>
            )}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FaturamentoTotal() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const companyFirstName = (user?.company_name || '').split(' ')[0] || 'Empresa';
  const malhasLabel = `Malhas (${companyFirstName})`;

  const [dayRange, setDayRange] = useState(15);
  const [customDate, setCustomDate] = useState<Date>();
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterMonth, setFilterMonth] = useState('all');

  const { data: productions = [], isLoading: l1 } = useQuery({
    queryKey: ['fat-productions', companyId],
    queryFn: () => fetchAllPaginated<ProductionRow>('productions', companyId, 'date'),
    enabled: !!companyId,
  });
  const { data: outsource = [], isLoading: l2 } = useQuery({
    queryKey: ['fat-outsource', companyId],
    queryFn: () => fetchAllPaginated<OutsourceRow>('outsource_productions', companyId, 'date'),
    enabled: !!companyId,
  });
  const { data: residues = [], isLoading: l3 } = useQuery({
    queryKey: ['fat-residues', companyId],
    queryFn: () => fetchAllPaginated<ResidueRow>('residue_sales', companyId, 'date'),
    enabled: !!companyId,
  });

  const loading = l1 || l2 || l3;

  const clearFilters = () => {
    setDayRange(15);
    setCustomDate(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterMonth('all');
  };
  const hasActiveFilters = dayRange !== 15 || filterMonth !== 'all' || !!dateFrom || !!dateTo || !!customDate;

  // Available months from all 3 sources
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    productions.forEach(p => months.add(p.date.substring(0, 7)));
    outsource.forEach(p => months.add(p.date.substring(0, 7)));
    residues.forEach(p => months.add(p.date.substring(0, 7)));
    months.add(format(new Date(), 'yyyy-MM'));
    return Array.from(months).sort().reverse();
  }, [productions, outsource, residues]);

  // Compute current period range
  const currentPeriod = useMemo(() => {
    const today = new Date();
    if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
      return null; // all time
    }
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

  // Previous period for comparison
  const previousPeriod = useMemo(() => {
    if (!currentPeriod) return null;

    if (filterMonth !== 'all') {
      const currentMonthDate = new Date(`${filterMonth}-01T12:00:00`);
      const previousMonthDate = subMonths(currentMonthDate, 1);
      return {
        start: format(startOfMonth(previousMonthDate), 'yyyy-MM-dd'),
        end: format(endOfMonth(previousMonthDate), 'yyyy-MM-dd'),
      };
    }

    if (customDate) {
      const previousDate = format(subDays(customDate, 1), 'yyyy-MM-dd');
      return { start: previousDate, end: previousDate };
    }

    const startDate = new Date(currentPeriod.start + 'T12:00:00');
    const endDate = new Date(currentPeriod.end + 'T12:00:00');
    const durationDays = differenceInCalendarDays(endDate, startDate) + 1;
    const prevEnd = subDays(startDate, 1);
    const prevStart = subDays(prevEnd, durationDays - 1);
    return { start: format(prevStart, 'yyyy-MM-dd'), end: format(prevEnd, 'yyyy-MM-dd') };
  }, [currentPeriod, filterMonth, customDate]);

  const filterByPeriod = <T extends { date: string }>(data: T[], period: { start: string; end: string } | null) => {
    if (!period) return data;
    return data.filter(d => d.date >= period.start && d.date <= period.end);
  };

  const filteredProd = useMemo(() => filterByPeriod(productions, currentPeriod), [productions, currentPeriod]);
  const filteredOut = useMemo(() => filterByPeriod(outsource, currentPeriod), [outsource, currentPeriod]);
  const filteredRes = useMemo(() => filterByPeriod(residues, currentPeriod), [residues, currentPeriod]);

  const prevProd = useMemo(() => filterByPeriod(productions, previousPeriod), [productions, previousPeriod]);
  const prevOut = useMemo(() => filterByPeriod(outsource, previousPeriod), [outsource, previousPeriod]);
  const prevRes = useMemo(() => filterByPeriod(residues, previousPeriod), [residues, previousPeriod]);

  const malhasCurrent = filteredProd.reduce((s, p) => s + p.revenue, 0);
  const tercCurrent = filteredOut.reduce((s, p) => s + p.total_revenue, 0);
  const resCurrent = filteredRes.reduce((s, p) => s + p.total, 0);
  const totalCurrent = malhasCurrent + tercCurrent + resCurrent;

  const malhasPrev = prevProd.reduce((s, p) => s + p.revenue, 0);
  const tercPrev = prevOut.reduce((s, p) => s + p.total_revenue, 0);
  const resPrev = prevRes.reduce((s, p) => s + p.total, 0);
  const totalPrev = malhasPrev + tercPrev + resPrev;

  const showComparison = currentPeriod !== null;

  // Period label
  const periodLabel = useMemo(() => {
    if (!currentPeriod) {
      const allDates = [
        ...productions.map(p => p.date),
        ...outsource.map(p => p.date),
        ...residues.map(p => p.date),
      ].sort();
      if (allDates.length === 0) return 'Todo período';
      const first = allDates[0];
      const last = allDates[allDates.length - 1];
      return `Todo período: ${format(new Date(first + 'T12:00:00'), 'dd/MM/yyyy')} a ${format(new Date(last + 'T12:00:00'), 'dd/MM/yyyy')}`;
    }
    const s = format(new Date(currentPeriod.start + 'T12:00:00'), 'dd/MM/yyyy');
    const e = format(new Date(currentPeriod.end + 'T12:00:00'), 'dd/MM/yyyy');
    return s === e ? s : `${s} a ${e}`;
  }, [currentPeriod, productions, outsource, residues]);

  // Chart data
  const chartData = useMemo(() => {
    const dateMap: Record<string, { malhas: number; terceirizado: number; residuos: number }> = {};
    filteredProd.forEach(p => {
      if (!dateMap[p.date]) dateMap[p.date] = { malhas: 0, terceirizado: 0, residuos: 0 };
      dateMap[p.date].malhas += p.revenue;
    });
    filteredOut.forEach(p => {
      if (!dateMap[p.date]) dateMap[p.date] = { malhas: 0, terceirizado: 0, residuos: 0 };
      dateMap[p.date].terceirizado += p.total_revenue;
    });
    filteredRes.forEach(s => {
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
  }, [filteredProd, filteredOut, filteredRes]);

  // Table data
  const tableData = useMemo(() => {
    const rows = [
      { fonte: malhasLabel, current: malhasCurrent, prev: malhasPrev },
      { fonte: 'Terceirizado', current: tercCurrent, prev: tercPrev },
      { fonte: 'Resíduos', current: resCurrent, prev: resPrev },
    ];
    return rows.map(r => ({
      ...r,
      pct: totalCurrent > 0 ? (r.current / totalCurrent) * 100 : 0,
      variation: r.prev > 0 ? ((r.current - r.prev) / r.prev) * 100 : (r.current > 0 ? 100 : 0),
    }));
  }, [malhasCurrent, tercCurrent, resCurrent, malhasPrev, tercPrev, resPrev, totalCurrent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Faturamento Total</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar Filtros
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 items-end">
            {[7, 15, 30].map(d => (
              <Button key={d} size="sm" variant={dayRange === d && !customDate && filterMonth === 'all' && !dateFrom && !dateTo ? 'default' : 'outline'}
                onClick={() => { setDayRange(d); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }}>
                {d} dias
              </Button>
            ))}
            <Button size="sm" variant={dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo ? 'default' : 'outline'}
              onClick={() => { setDayRange(0); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); }}>
              Todo período
            </Button>

            {/* Day picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={customDate ? 'default' : 'outline'}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {customDate ? format(customDate, 'dd/MM/yyyy') : 'Dia'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDate} onSelect={(d) => { setCustomDate(d || undefined); if (d) { setDayRange(15); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); } }} locale={ptBR} />
              </PopoverContent>
            </Popover>

            {/* Month */}
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>
                    {format(new Date(m + '-15'), 'MMMM yyyy', { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={dateFrom ? 'default' : 'outline'}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {dateFrom ? format(dateFrom, 'dd/MM') : 'De'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d || undefined); if (d) { setDayRange(15); setCustomDate(undefined); setFilterMonth('all'); } }} locale={ptBR} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={dateTo ? 'default' : 'outline'}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {dateTo ? format(dateTo, 'dd/MM') : 'Até'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d || undefined); if (d) { setDayRange(15); setCustomDate(undefined); setFilterMonth('all'); } }} locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueKpiCard label={malhasLabel} value={malhasCurrent} previousValue={malhasPrev} borderColor="border-l-primary" icon={<Package className="h-5 w-5" />} showComparison={showComparison} />
        <RevenueKpiCard label="Terceirizado" value={tercCurrent} previousValue={tercPrev} borderColor="border-l-accent" icon={<Factory className="h-5 w-5" />} showComparison={showComparison} />
        <RevenueKpiCard label="Resíduos" value={resCurrent} previousValue={resPrev} borderColor="border-l-warning" icon={<Recycle className="h-5 w-5" />} showComparison={showComparison} />
        <RevenueKpiCard label="Total Geral" value={totalCurrent} previousValue={totalPrev} borderColor="border-l-success" icon={<DollarSign className="h-5 w-5" />} showComparison={showComparison} />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendência de Faturamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis tickFormatter={v => formatCurrency(v)} className="text-xs" width={100} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Area type="monotone" dataKey="malhas" name={malhasLabel} stackId="1" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" />
                <Area type="monotone" dataKey="terceirizado" name="Terceirizado" stackId="1" fill="hsl(var(--accent) / 0.3)" stroke="hsl(var(--accent))" />
                <Area type="monotone" dataKey="residuos" name="Resíduos" stackId="1" fill="hsl(var(--warning) / 0.3)" stroke="hsl(var(--warning))" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Summary Table */}
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
                {showComparison && <TableHead className="text-right">Receita Anterior</TableHead>}
                {showComparison && <TableHead className="text-right">Variação</TableHead>}
                <TableHead className="text-right">% do Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map(r => {
                const isPos = r.variation >= 0;
                return (
                  <TableRow key={r.fonte}>
                    <TableCell className="font-medium">{r.fonte}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.current)}</TableCell>
                    {showComparison && <TableCell className="text-right">{formatCurrency(r.prev)}</TableCell>}
                    {showComparison && (
                      <TableCell className={cn('text-right font-medium', isPos ? 'text-success' : 'text-destructive')}>
                        {isPos ? '▲' : '▼'} {formatPercent(Math.abs(r.variation))}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                        </div>
                        <span className="text-xs w-12 text-right">{formatPercent(r.pct)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Total row */}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatCurrency(totalCurrent)}</TableCell>
                {showComparison && <TableCell className="text-right">{formatCurrency(totalPrev)}</TableCell>}
                {showComparison && (
                  <TableCell className={cn('text-right', (totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) >= 0 : true) ? 'text-success' : 'text-destructive')}>
                    {(totalPrev > 0 || totalCurrent > 0)
                      ? `${(totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) >= 0 : true) ? '▲' : '▼'} ${formatPercent(Math.abs(totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 100))}`
                      : '—'}
                  </TableCell>
                )}
                <TableCell className="text-right">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
