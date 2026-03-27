import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarIcon, Search, RotateCcw, Factory, TrendingUp, Flame, Scale, DollarSign, Package } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatNumber, formatCurrency, formatPercent } from '@/lib/formatters';
import { SHIFT_LABELS, SHIFT_MINUTES, MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS, type ShiftType, type MachineStatus, type CompanyShiftSettings, getCompanyShiftMinutes, getCompanyShiftLabels } from '@/types';
import type { Machine, Production, Client, Article } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  productions: Production[];
  clients: Client[];
  articles: Article[];
  shiftSettings?: CompanyShiftSettings;
}

export default function MachinePerformanceModal({ open, onOpenChange, machines, productions, clients, articles, shiftSettings }: Props) {
  const companyShiftMinutes = useMemo(() => getCompanyShiftMinutes(shiftSettings), [shiftSettings]);
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const [dayRange, setDayRange] = useState(0);
  const [customDate, setCustomDate] = useState<Date>();
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterShift, setFilterShift] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterArticle, setFilterArticle] = useState('all');
  const [search, setSearch] = useState('');

  const availableMonths = useMemo(() => {
    const months = new Set(productions.map(p => p.date.substring(0, 7)));
    months.add(format(new Date(), 'yyyy-MM'));
    return Array.from(months).sort().reverse();
  }, [productions]);

  const availableYears = useMemo(() => {
    const years = new Set(productions.map(p => p.date.substring(0, 4)));
    return Array.from(years).sort().reverse();
  }, [productions]);

  const clearFilters = () => {
    setDayRange(0);
    setCustomDate(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterMonth('all');
    setFilterYear('all');
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
    setSearch('');
  };

  const filtered = useMemo(() => {
    let data = [...productions];
    const today = new Date();

    if (dayRange === 0 && filterYear === 'all' && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
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
    } else if (filterYear !== 'all') {
      data = data.filter(p => p.date.startsWith(filterYear));
      if (filterMonth !== 'all') {
        data = data.filter(p => p.date.startsWith(filterMonth));
      }
    } else if (filterMonth !== 'all') {
      data = data.filter(p => p.date.startsWith(filterMonth));
    } else if (customDate) {
      const dateStr = format(customDate, 'yyyy-MM-dd');
      data = data.filter(p => p.date === dateStr);
    } else if (dayRange > 0) {
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
  }, [productions, dayRange, customDate, dateFrom, dateTo, filterMonth, filterYear, filterShift, filterClient, filterArticle, articles]);

  const machinePerf = useMemo(() => {
    return machines
      .map(m => {
        const mp = filtered.filter(p => (p.machine_id && p.machine_id === m.id) || (!p.machine_id && p.machine_name === m.name));
        const rolls = mp.reduce((s, p) => s + p.rolls_produced, 0);
        const kg = mp.reduce((s, p) => s + p.weight_kg, 0);
        const revenue = mp.reduce((s, p) => s + p.revenue, 0);
        const eff = mp.length ? mp.reduce((s, p) => s + p.efficiency, 0) / mp.length : 0;
        const totalHours = mp.reduce((s, p) => s + ((companyShiftMinutes[p.shift as ShiftType] || 480) / 60), 0);
        const revenuePerHour = totalHours > 0 ? revenue / totalHours : 0;
        const kgPerHour = totalHours > 0 ? kg / totalHours : 0;

        // Weighted average target efficiency from articles produced
        const avgTargetEff = mp.length > 0
          ? mp.reduce((s, p) => {
              const art = articles.find(a => a.id === p.article_id);
              return s + (art?.target_efficiency || 80);
            }, 0) / mp.length
          : 80;

        const currentArticle = m.article_id ? articles.find(a => a.id === m.article_id) : null;
        const articleName = currentArticle?.name || 'Sem artigo';
        const statusLabel = MACHINE_STATUS_LABELS[m.status as MachineStatus] || m.status;
        const statusColor = MACHINE_STATUS_COLORS[m.status as MachineStatus] || 'bg-muted text-muted-foreground';

        return { id: m.id, name: m.name, articleName, statusLabel, statusColor, rolls, kg, revenue, efficiency: eff, revenuePerHour, kgPerHour, records: mp.length, targetEfficiency: avgTargetEff };
      })
      .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  }, [machines, filtered, articles, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 shrink-0 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Factory className="h-5 w-5 text-muted-foreground" />
            Performance de Todas as Máquinas
          </DialogTitle>
          <DialogDescription>Visualização completa do desempenho de todas as máquinas</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Filters */}
          <Card className="shadow-material border-0">
            <CardContent className="py-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-1">Período:</span>
                {[1, 7, 15, 30].map(d => (
                  <Button
                    key={d}
                    size="sm"
                    variant={dayRange === d && filterMonth === 'all' && !customDate && filterYear === 'all' && !dateFrom && !dateTo ? 'default' : 'outline'}
                    onClick={() => { setDayRange(d); setCustomDate(undefined); setFilterMonth('all'); setFilterYear('all'); setDateFrom(undefined); setDateTo(undefined); }}
                    className={cn("min-w-[60px] rounded-lg", dayRange === d && filterMonth === 'all' && !customDate && filterYear === 'all' && !dateFrom && !dateTo && 'btn-gradient')}
                  >
                    {d} dia{d > 1 ? 's' : ''}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={dayRange === 0 && filterMonth === 'all' && !customDate && filterYear === 'all' && !dateFrom && !dateTo ? 'default' : 'outline'}
                  onClick={() => { setDayRange(0); setCustomDate(undefined); setFilterMonth('all'); setFilterYear('all'); setDateFrom(undefined); setDateTo(undefined); }}
                  className={cn("min-w-[60px] rounded-lg", dayRange === 0 && filterMonth === 'all' && !customDate && filterYear === 'all' && !dateFrom && !dateTo && 'btn-gradient')}
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
                    <Calendar mode="single" selected={customDate} onSelect={(d) => { setCustomDate(d); setFilterMonth('all'); setFilterYear('all'); setDateFrom(undefined); setDateTo(undefined); }} locale={ptBR} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>

                <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}>
                  <SelectTrigger className="w-[120px] h-9 rounded-lg"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mês</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy', { locale: ptBR })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}>
                  <SelectTrigger className="w-[100px] h-9 rounded-lg"><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Ano</SelectItem>
                    {availableYears.map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
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
                    <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setFilterMonth('all'); setFilterYear('all'); setCustomDate(undefined); }} locale={ptBR} className="pointer-events-auto" />
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
                    <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setFilterMonth('all'); setFilterYear('all'); setCustomDate(undefined); }} locale={ptBR} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-1">Filtros:</span>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-9 w-[150px] rounded-lg"
                  />
                </div>

                <Select value={filterShift} onValueChange={setFilterShift}>
                  <SelectTrigger className="w-[130px] h-9 rounded-lg"><SelectValue placeholder="Todos os turnos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os</SelectItem>
                    {Object.entries(companyShiftLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.split(' (')[0]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterClient} onValueChange={setFilterClient}>
                  <SelectTrigger className="w-[120px] h-9 rounded-lg"><SelectValue placeholder="Cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cliente</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={filterArticle} onValueChange={setFilterArticle}>
                  <SelectTrigger className="w-[120px] h-9 rounded-lg"><SelectValue placeholder="Artigo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Artigo</SelectItem>
                    {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Button variant="outline" size="sm" onClick={clearFilters} className="rounded-lg">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Machine Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {machinePerf.map(m => (
              <Card key={m.id} className="shadow-material border-0 hover:shadow-lg transition-shadow">
                <CardContent className="p-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">{m.name}</h3>
                    <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-lg", m.statusColor)}>{m.statusLabel}</span>
                  </div>

                  {/* Efficiency Badge */}
                  <div className="flex justify-center">
                    <span className={cn(
                      "text-sm font-bold px-5 py-1.5 rounded-full text-white",
                      m.efficiency >= m.targetEfficiency ? "bg-success" :
                      m.efficiency >= m.targetEfficiency * 0.875 ? "bg-warning" :
                      "bg-destructive"
                    )}>
                      {formatPercent(m.efficiency)} (Meta {Math.round(m.targetEfficiency)}%)
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Package className="h-3.5 w-3.5 text-primary" /> Rolos
                      </span>
                      <span className="font-semibold text-foreground">{formatNumber(m.rolls)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Scale className="h-3.5 w-3.5 text-success" /> Peso
                      </span>
                      <span className="font-semibold text-foreground">{formatNumber(m.kg, 2)} kg</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5 text-primary" /> Valor
                      </span>
                      <span className="font-semibold text-foreground">{formatCurrency(m.revenue)}</span>
                    </div>
                  </div>

                  {/* Per Hour */}
                  <div className="pt-2 border-t border-border/50 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Por hora:</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5 text-warning" /> Faturamento/h
                      </span>
                      <span className="font-semibold text-foreground">{formatCurrency(m.revenuePerHour)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Flame className="h-3.5 w-3.5 text-destructive" /> Kg/h
                      </span>
                      <span className="font-semibold text-foreground">{formatNumber(m.kgPerHour, 2)} kg/h</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {machinePerf.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Nenhuma máquina encontrada para os filtros selecionados.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
