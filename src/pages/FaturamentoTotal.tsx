 import { useState, useMemo, useEffect } from 'react';
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

   const [rpcData, setRpcData] = useState<any>(null);
   const [isLoading, setIsLoading] = useState(true);
   const [availableMonthsList, setAvailableMonthsList] = useState<string[]>([]);
   // Load available months only once
    useEffect(() => {
      const loadMonths = async () => {
        if (!companyId) return;
        try {
          const { data, error } = await supabase.rpc('get_faturamento_available_months', { p_company_id: companyId });
          
          if (error) {
            console.error('Error loading months via RPC:', error);
            // Fallback to basic production loading if RPC fails
            const { data: prodData } = await supabase.from('productions')
              .select('date')
              .eq('company_id', companyId)
              .order('date', { ascending: false })
              .limit(1000);
            
            const months = new Set<string>();
            prodData?.forEach(p => months.add(p.date.substring(0, 7)));
            months.add(format(new Date(), 'yyyy-MM'));
            setAvailableMonthsList(Array.from(months).sort().reverse());
            return;
          }

          const months = new Set<string>(data?.map((m: any) => m.month_str) || []);
          months.add(format(new Date(), 'yyyy-MM'));
          setAvailableMonthsList(Array.from(months).sort().reverse());
        } catch (err) {
          console.error('Unexpected error loading months:', err);
        }
      };
      loadMonths();
    }, [companyId]);
   // Compute current and previous period ranges
   const currentPeriod = useMemo(() => {
     const today = new Date();
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
     if (dayRange === 0) {
       return { start: '2000-01-01', end: format(today, 'yyyy-MM-dd') };
     }
     return {
       start: format(subDays(today, dayRange - 1), 'yyyy-MM-dd'),
       end: format(today, 'yyyy-MM-dd'),
     };
   }, [dayRange, customDate, dateFrom, dateTo, filterMonth]);
 
   const previousPeriod = useMemo(() => {
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
 
      // Load data via RPC - Wrapped in try/catch and ensures all params are present
      useEffect(() => {
        const fetchRpcData = async () => {
          if (!companyId) return;
          
          const params = {
            p_company_id: companyId,
            p_start_date: currentPeriod?.start || format(subDays(new Date(), 14), 'yyyy-MM-dd'),
            p_end_date: currentPeriod?.end || format(new Date(), 'yyyy-MM-dd'),
            p_prev_start_date: previousPeriod?.start || format(subDays(new Date(), 29), 'yyyy-MM-dd'),
            p_prev_end_date: previousPeriod?.end || format(subDays(new Date(), 15), 'yyyy-MM-dd'),
          };

          setIsLoading(true);
          try {
            // Use generic call to avoid type mismatch issues if the generated types are stale
            const { data, error } = await (supabase.rpc as any)('get_faturamento_total_metrics', params);
            
            if (error) {
              console.error('RPC Execution Error:', error);
              return;
            }
            
            if (data) {
              setRpcData(data);
            }
          } catch (err) {
            console.error('Unexpected error in fetchRpcData:', err);
          } finally {
            setIsLoading(false);
          }
        };
  
        fetchRpcData();
      }, [companyId, currentPeriod, previousPeriod]);
 
   const clearFilters = () => {
     setDayRange(15);
     setCustomDate(undefined);
     setDateFrom(undefined);
     setDateTo(undefined);
     setFilterMonth('all');
   };
   const hasActiveFilters = dayRange !== 15 || filterMonth !== 'all' || !!dateFrom || !!dateTo || !!customDate;
 
   const malhasCurrent = rpcData?.current_period?.malhas || 0;
   const tercCurrent = rpcData?.current_period?.terceirizado || 0;
   const resCurrent = rpcData?.current_period?.residuos || 0;
   const totalCurrent = rpcData?.current_period?.total || 0;
 
   const malhasPrev = rpcData?.previous_period?.malhas || 0;
   const tercPrev = rpcData?.previous_period?.terceirizado || 0;
   const resPrev = rpcData?.previous_period?.residuos || 0;
   const totalPrev = rpcData?.previous_period?.total || 0;
 
   const showComparison = true;
 
   const periodLabel = useMemo(() => {
     const s = format(new Date(currentPeriod.start + 'T12:00:00'), 'dd/MM/yyyy');
     const e = format(new Date(currentPeriod.end + 'T12:00:00'), 'dd/MM/yyyy');
     return s === e ? s : `${s} a ${e}`;
   }, [currentPeriod]);
 
   const chartData = useMemo(() => {
     if (!rpcData?.chart_data) return [];
     return rpcData.chart_data.map((vals: any) => ({
       date: format(new Date(vals.date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
       malhas: Math.round(vals.malhas * 100) / 100,
       terceirizado: Math.round(vals.terceirizado * 100) / 100,
       residuos: Math.round(vals.residuos * 100) / 100,
       total: Math.round((vals.malhas + vals.terceirizado + vals.residuos) * 100) / 100,
     }));
   }, [rpcData]);
 
   const tableData = useMemo(() => {
     const rows = [
       { fonte: malhasLabel, current: malhasCurrent, prev: malhasPrev },
       { fonte: 'Terceirizado (Lucro)', current: tercCurrent, prev: tercPrev },
       { fonte: 'Resíduos', current: resCurrent, prev: resPrev },
     ];
     return rows.map(r => ({
       ...r,
       pct: totalCurrent > 0 ? (r.current / totalCurrent) * 100 : 0,
       variation: r.prev > 0 ? ((r.current - r.prev) / r.prev) * 100 : (r.current > 0 ? 100 : 0),
     }));
   }, [malhasCurrent, tercCurrent, resCurrent, malhasPrev, tercPrev, resPrev, totalCurrent, malhasLabel]);
 
      if (isLoading && !rpcData) {
        return null;
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
                {availableMonthsList.map(m => (
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
        <RevenueKpiCard label="Terceirizado (Lucro)" value={tercCurrent} previousValue={tercPrev} borderColor="border-l-accent" icon={<Factory className="h-5 w-5" />} showComparison={showComparison} />
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
                <Area type="monotone" dataKey="terceirizado" name="Terceirizado (Lucro)" stackId="1" fill="hsl(25, 95%, 53%, 0.35)" stroke="hsl(25, 95%, 53%)" />
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
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-2">
            {tableData.map(r => {
              const isPos = r.variation >= 0;
              return (
                <div key={r.fonte} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{r.fonte}</span>
                    <span className="text-sm font-semibold">{formatCurrency(r.current)}</span>
                  </div>
                  {showComparison && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Anterior: {formatCurrency(r.prev)}</span>
                      <span className={cn('font-medium', isPos ? 'text-success' : 'text-destructive')}>
                        {isPos ? '▲' : '▼'} {formatPercent(Math.abs(r.variation))}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                    </div>
                    <span className="text-xs w-12 text-right">{formatPercent(r.pct)}</span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border p-3 bg-muted/50 space-y-1">
              <div className="flex items-center justify-between font-bold text-sm">
                <span>Total</span>
                <span>{formatCurrency(totalCurrent)}</span>
              </div>
              {showComparison && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Anterior: {formatCurrency(totalPrev)}</span>
                  <span className={cn('font-medium', (totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) >= 0 : true) ? 'text-success' : 'text-destructive')}>
                    {(totalPrev > 0 || totalCurrent > 0)
                      ? `${(totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) >= 0 : true) ? '▲' : '▼'} ${formatPercent(Math.abs(totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 100))}`
                      : '—'}
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
