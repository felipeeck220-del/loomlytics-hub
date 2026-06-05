 import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
 import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Loader2, RotateCcw, Download, Clock, Search,
  Package, TrendingUp, DollarSign, Gauge, FileText, Trophy, Medal, Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType, type Production, getCompanyShiftLabels } from '@/types';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { usePermissions } from '@/hooks/usePermissions';
 import { SearchableSelect } from '@/components/SearchableSelect';
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
    const { 
      getMachines, getClients, getArticles, shiftSettings, dbCompanyId, getProductions
    } = useSharedCompanyData();
    const productions = getProductions();
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const { canSeeFinancial } = usePermissions();
  const { user } = useAuth();
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
      .maybeSingle()
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

  // Pódio (Ranking por Turno) — filtros independentes
  const [podioRange, setPodioRange] = useState<'1' | '7' | 'custom'>('7');
  const [podioFrom, setPodioFrom] = useState<Date>();
  const [podioTo, setPodioTo] = useState<Date>();

   const avgTargetEfficiency = 80;
   const [loading, setLoading] = useState(true);
   const [kpis, setKpis] = useState<any>(null);
   const [byShift, setByShift] = useState<any[]>([]);
   const [byMachine, setByMachine] = useState<any[]>([]);
   const [byClient, setByClient] = useState<any[]>([]);
   const [byArticle, setByArticle] = useState<any[]>([]);
   const [evolutionData, setEvolutionData] = useState<any[]>([]);
 
   const hasActiveFilters = filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMachine !== 'all' || filterMonth !== 'all' || !!dateFrom || !!dateTo || !!customDate;
 
    const availableMonths = useMemo(() => {
      const months = new Set(productions.map(p => p.date.substring(0, 7)));
      months.add(format(new Date(), 'yyyy-MM'));
      return Array.from(months).sort().reverse();
    }, [productions]);

    useEffect(() => {
      if (!dbCompanyId || productions.length === 0) return;
      setLoading(true);
      
      const today = new Date();
      let dFrom = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined;
      let dTo = dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined;

      if (!dFrom && !dTo) {
        if (filterMonth !== 'all') {
          const [year, month] = filterMonth.split('-').map(Number);
          dFrom = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
          dTo = format(new Date(year, month, 0), 'yyyy-MM-dd');
        } else if (customDate) {
          dFrom = format(customDate, 'yyyy-MM-dd');
          dTo = dFrom;
        } else if (dayRange > 0) {
          dFrom = format(subDays(today, dayRange - 1), 'yyyy-MM-dd');
          dTo = format(today, 'yyyy-MM-dd');
        }
      }

      let filtered = [...productions];
      if (dFrom) filtered = filtered.filter(p => p.date >= dFrom!);
      if (dTo) filtered = filtered.filter(p => p.date <= dTo!);
      if (filterShift !== 'all') filtered = filtered.filter(p => p.shift === filterShift);
      if (filterMachine !== 'all') filtered = filtered.filter(p => p.machine_id === filterMachine);
      if (filterClient !== 'all') {
        const clientArticles = articles.filter(a => a.client_id === filterClient).map(a => a.id);
        filtered = filtered.filter(p => clientArticles.includes(p.article_id));
      }
      if (filterArticle !== 'all') filtered = filtered.filter(p => p.article_id === filterArticle);

      const total_rolls = filtered.reduce((acc, p) => acc + p.rolls_produced, 0);
      const total_weight = filtered.reduce((acc, p) => acc + p.weight_kg, 0);
      const total_revenue = filtered.reduce((acc, p) => acc + p.revenue, 0);
      const active_days = new Set(filtered.map(p => p.date)).size;
      
      const nonZeroEff = filtered.filter(p => p.rolls_produced > 0);
      const totalWeightForEff = nonZeroEff.reduce((acc, p) => acc + p.weight_kg, 0);
      const avg_efficiency = totalWeightForEff > 0 
        ? nonZeroEff.reduce((acc, p) => acc + (p.efficiency * p.weight_kg), 0) / totalWeightForEff
        : 0;

      setKpis({ total_rolls, total_weight, total_revenue, active_days, avg_efficiency });

      const shiftMap: Record<string, any> = {};
      ['manha', 'tarde', 'noite'].forEach(s => {
        const sf = filtered.filter(p => p.shift === s);
        const sWeight = sf.reduce((acc, p) => acc + p.weight_kg, 0);
        const sNonZeroEff = sf.filter(p => p.rolls_produced > 0);
        const sWeightForEff = sNonZeroEff.reduce((acc, p) => acc + p.weight_kg, 0);
        const sEff = sWeightForEff > 0 ? sNonZeroEff.reduce((acc, p) => acc + (p.efficiency * p.weight_kg), 0) / sWeightForEff : 0;
        
        shiftMap[s] = {
          shift: s,
          name: companyShiftLabels[s as ShiftType] || s,
          rolos: sf.reduce((acc, p) => acc + p.rolls_produced, 0),
          kg: sWeight,
          faturamento: sf.reduce((acc, p) => acc + p.revenue, 0),
          eficiencia: sEff,
          pct_rolls: total_rolls > 0 ? (sf.reduce((acc, p) => acc + p.rolls_produced, 0) / total_rolls) * 100 : 0,
          pct_revenue: total_revenue > 0 ? (sf.reduce((acc, p) => acc + p.revenue, 0) / total_revenue) * 100 : 0,
        };
      });
      setByShift(Object.values(shiftMap));

      const machineMap: Record<string, any> = {};
      filtered.forEach(p => {
        const key = p.machine_id || p.machine_name;
        if (!machineMap[key]) machineMap[key] = { name: p.machine_name, rolos: 0, kg: 0, faturamento: 0, efficiencySum: 0, weightForEff: 0, records: 0 };
        machineMap[key].rolos += p.rolls_produced;
        machineMap[key].kg += p.weight_kg;
        machineMap[key].faturamento += p.revenue;
        machineMap[key].records += 1;
        if (p.rolls_produced > 0) {
          machineMap[key].efficiencySum += (p.efficiency * p.weight_kg);
          machineMap[key].weightForEff += p.weight_kg;
        }
      });
      setByMachine(Object.values(machineMap).map((m: any) => ({
        ...m,
        eficiencia: m.weightForEff > 0 ? m.efficiencySum / m.weightForEff : 0,
        pct_rolls: total_rolls > 0 ? (m.rolos / total_rolls) * 100 : 0,
        pct_revenue: total_revenue > 0 ? (m.faturamento / total_revenue) * 100 : 0,
      })).sort((a, b) => {
        // Sort by machine number if possible, then by name
        const numA = parseInt(a.name.replace(/\D/g, ''));
        const numB = parseInt(b.name.replace(/\D/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }));

      const clientMap: Record<string, any> = {};
      filtered.forEach(p => {
        const art = articles.find(a => a.id === p.article_id);
        const clientName = art?.client_name || 'Diversos';
        if (!clientMap[clientName]) clientMap[clientName] = { name: clientName, rolos: 0, kg: 0, faturamento: 0 };
        clientMap[clientName].rolos += p.rolls_produced;
        clientMap[clientName].kg += p.weight_kg;
        clientMap[clientName].faturamento += p.revenue;
      });
      setByClient(Object.values(clientMap).map((c: any) => ({
        ...c,
        pct_rolls: total_rolls > 0 ? (c.rolos / total_rolls) * 100 : 0,
        pct_kg: total_weight > 0 ? (c.kg / total_weight) * 100 : 0,
        pct_revenue: total_revenue > 0 ? (c.faturamento / total_revenue) * 100 : 0,
      })).sort((a, b) => b.kg - a.kg));

      const articleMap: Record<string, any> = {};
      filtered.forEach(p => {
        const name = p.article_name;
        if (!articleMap[name]) {
          const art = articles.find(a => a.id === p.article_id);
          articleMap[name] = {
            id: p.article_id || name,
            name,
            clientName: art?.client_name || '',
            rolos: 0,
            kg: 0,
            faturamento: 0,
            records: 0,
            efficiencySum: 0,
            weightForEff: 0,
          };
        }
        articleMap[name].rolos += p.rolls_produced;
        articleMap[name].kg += p.weight_kg;
        articleMap[name].faturamento += p.revenue;
        articleMap[name].records += 1;
        if (p.rolls_produced > 0) {
          articleMap[name].efficiencySum += (p.efficiency * p.weight_kg);
          articleMap[name].weightForEff += p.weight_kg;
        }
      });
      setByArticle(Object.values(articleMap).map((a: any) => ({
        ...a,
        eficiencia: a.weightForEff > 0 ? a.efficiencySum / a.weightForEff : 0,
        targetEfficiency: avgTargetEfficiency,
        pct_rolls: total_rolls > 0 ? (a.rolos / total_rolls) * 100 : 0,
        pct_kg: total_weight > 0 ? (a.kg / total_weight) * 100 : 0,
        pct_revenue: total_revenue > 0 ? (a.faturamento / total_revenue) * 100 : 0,
      })).sort((a, b) => b.kg - a.kg));

      const evolutionMap: Record<string, any> = {};
      filtered.forEach(p => {
        if (!evolutionMap[p.date]) evolutionMap[p.date] = { date: p.date, rolos: 0, kg: 0, faturamento: 0 };
        evolutionMap[p.date].rolos += p.rolls_produced;
        evolutionMap[p.date].kg += p.weight_kg;
        evolutionMap[p.date].faturamento += p.revenue;
      });
      setEvolutionData(Object.values(evolutionMap).sort((a: any, b: any) => a.date.localeCompare(b.date)).map((d: any) => ({
        ...d,
        date: format(new Date(d.date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
      })));

      setLoading(false);
    }, [dbCompanyId, productions, dateFrom, dateTo, filterMonth, customDate, dayRange, filterShift, filterMachine, filterClient, filterArticle, companyShiftLabels, articles]);
  const clearFilters = () => {
     setDayRange(30); setFilterMonth('all');
    setCustomDate(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterMonth('all');
    setFilterShift('all');
    setFilterClient('all');
    setFilterArticle('all');
    setFilterMachine('all');
  };

   const periodLabel = useMemo(() => {
     const today = new Date();
     if (dateFrom && dateTo) return `${format(dateFrom, 'dd/MM/yyyy')} a ${format(dateTo, 'dd/MM/yyyy')}`;
     if (dateFrom) return `${format(dateFrom, 'dd/MM/yyyy')} a ${format(today, 'dd/MM/yyyy')}`;
     if (dateTo) return `Até ${format(dateTo, 'dd/MM/yyyy')}`;
     if (customDate) return format(customDate, 'dd/MM/yyyy');
     if (filterMonth !== 'all') {
       const [year, month] = filterMonth.split('-').map(Number);
       const startDate = new Date(year, month - 1, 1);
       const endDate = new Date(year, month, 0);
       return `${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`;
     }
     if (dayRange > 0) {
       const startDate = subDays(today, dayRange - 1);
       return `${format(startDate, 'dd/MM/yyyy')} a ${format(today, 'dd/MM/yyyy')}`;
     }
     return 'Todo período';
   }, [customDate, dateFrom, dateTo, dayRange, filterMonth]);

  // ---- PÓDIO: cálculo de ranking por turno ----
  const podioComputed = useMemo(() => {
    const today = new Date();
    let pFrom: string, pTo: string;
    if (podioRange === 'custom' && (podioFrom || podioTo)) {
      pFrom = podioFrom ? format(podioFrom, 'yyyy-MM-dd') : format(podioTo!, 'yyyy-MM-dd');
      pTo = podioTo ? format(podioTo, 'yyyy-MM-dd') : format(podioFrom!, 'yyyy-MM-dd');
    } else if (podioRange === '1') {
      pFrom = format(today, 'yyyy-MM-dd');
      pTo = pFrom;
    } else {
      pFrom = format(subDays(today, 6), 'yyyy-MM-dd');
      pTo = format(today, 'yyyy-MM-dd');
    }
    const list = productions.filter(p => p.date >= pFrom && p.date <= pTo);

    const aggregate = (rows: Production[]) => {
      const map: Record<string, { id: string; name: string; rolos: number; kg: number; effSum: number; effW: number }> = {};
      rows.forEach(p => {
        const key = p.shift || 'sem';
        const name = companyShiftLabels[p.shift as ShiftType]?.split(' (')[0] || p.shift || 'Sem turno';
        if (!map[key]) map[key] = { id: key, name, rolos: 0, kg: 0, effSum: 0, effW: 0 };
        map[key].rolos += p.rolls_produced;
        map[key].kg += p.weight_kg;
        if (p.rolls_produced > 0) {
          map[key].effSum += p.efficiency * p.weight_kg;
          map[key].effW += p.weight_kg;
        }
      });
      return Object.values(map).map(w => ({
        ...w,
        eficiencia: w.effW > 0 ? w.effSum / w.effW : 0,
      })).sort((a, b) => b.kg - a.kg);
    };

    const ranking = aggregate(list);

    // dias do período
    const dates: string[] = [];
    {
      const d0 = new Date(pFrom + 'T12:00:00');
      const d1 = new Date(pTo + 'T12:00:00');
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
        dates.push(format(d, 'yyyy-MM-dd'));
      }
    }
    const daily = dates.map(date => ({
      date,
      ranking: aggregate(list.filter(p => p.date === date)),
    }));

    const label = pFrom === pTo
      ? format(new Date(pFrom + 'T12:00:00'), 'dd/MM/yyyy')
      : `${format(new Date(pFrom + 'T12:00:00'), 'dd/MM/yyyy')} a ${format(new Date(pTo + 'T12:00:00'), 'dd/MM/yyyy')}`;

    return { ranking, daily, periodLabel: label, from: pFrom, to: pTo };
  }, [productions, podioRange, podioFrom, podioTo, companyShiftLabels]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Relatórios</h1>
           <p className="page-subtitle">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RotateCcw className="h-4 w-4 mr-1" /> Limpar
              </Button>
            </div>
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
                 onClick={() => { setDayRange(d); setFilterMonth('all'); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined); }}
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

              <SearchableSelect
                value={filterMachine}
                onValueChange={setFilterMachine}
                options={[
                  { value: 'all', label: 'Máquina' },
                  ...machines.map(m => ({ value: m.id, label: m.name }))
                ]}
                placeholder="Máquina"
                triggerClassName="w-[160px]"
                icon={<Search className="h-3.5 w-3.5 opacity-50" />}
              />
 
              <SearchableSelect
                value={filterClient}
                onValueChange={setFilterClient}
                options={[
                  { value: 'all', label: 'Cliente' },
                  ...clients.map(c => ({ value: c.id, label: c.name }))
                ]}
                placeholder="Cliente"
                triggerClassName="w-[160px]"
                icon={<Search className="h-3.5 w-3.5 opacity-50" />}
              />
 
              <SearchableSelect
                value={filterArticle}
                onValueChange={setFilterArticle}
                options={[
                  { value: 'all', label: 'Artigo' },
                  ...articles.map(a => ({ value: a.id, label: a.name }))
                ]}
                placeholder="Artigo"
                triggerClassName="w-[160px]"
                icon={<Search className="h-3.5 w-3.5 opacity-50" />}
              />
          </div>
        </CardContent>
      </Card>

        {/* Data Processing & Rendering */}
         {loading && !kpis ? (
           <div className="flex items-center justify-center py-20">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
             <span className="ml-3 text-muted-foreground">Carregando dados...</span>
           </div>
         ) : kpis ? (
           <div className={cn("space-y-6", loading && "opacity-50 pointer-events-none transition-opacity")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Total de Rolos"
                value={formatNumber(kpis.total_rolls)}
                subtitle={`Em ${kpis.active_days || 0} dias com registro`}
                icon={<Package className="h-5 w-5 text-primary" />}
                borderColor="border-l-primary"
              />
              <KpiCard
                label="Total Produzido"
                value={`${formatNumber(kpis.total_weight, 2)} kg`}
                subtitle="Peso total produzido"
                icon={<TrendingUp className="h-5 w-5 text-accent" />}
                borderColor="border-l-accent"
              />
              {canSeeFinancial && <KpiCard
                label="Valor Total"
                value={formatCurrency(kpis.total_revenue)}
                subtitle="Valor total faturado"
                icon={<DollarSign className="h-5 w-5 text-success" />}
                borderColor="border-l-success"
              />}
              <KpiCard
                label="Eficiência Média"
                value={formatPercent(kpis.avg_efficiency)}
                subtitle={`Meta: ${formatPercent(avgTargetEfficiency)}`}
                icon={<Gauge className="h-5 w-5 text-destructive" />}
                borderColor="border-l-destructive"
                extra={
                  kpis.avg_efficiency < avgTargetEfficiency ? (
                    <Badge variant="destructive" className="text-[10px] mt-1">Abaixo da meta ({formatPercent(avgTargetEfficiency)})</Badge>
                  ) : (
                    <Badge className="bg-success/10 text-success border-success/20 text-[10px] mt-1">Dentro da meta ({formatPercent(avgTargetEfficiency)})</Badge>
                  )
                }
              />
            </div>

            {/* Analysis Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full h-auto grid grid-cols-3 sm:grid-cols-7 gap-1 p-1">
                <TabsTrigger value="turno">Por Turno</TabsTrigger>
                <TabsTrigger value="maquina">Por Máquina</TabsTrigger>
                <TabsTrigger value="cliente">Por Cliente</TabsTrigger>
                <TabsTrigger value="artigo">Por Artigo</TabsTrigger>
                <TabsTrigger value="evolucao">Evolução</TabsTrigger>
                <TabsTrigger value="exportar" className="flex items-center gap-1"><Download className="h-3.5 w-3.5" />Exportar</TabsTrigger>
                <TabsTrigger value="podio" className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5" />Pódio</TabsTrigger>
              </TabsList>

              {/* POR TURNO */}
              <TabsContent value="turno" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {byShift.map((s: any) => {
                    const shiftColor = s.name === 'Manhã' ? 'hsl(38, 92%, 50%)' : s.name === 'Tarde' ? 'hsl(25, 95%, 53%)' : 'hsl(221, 83%, 53%)';
                    const pctRolls = s.pct_rolls || 0;
                    const pctRevenue = s.pct_revenue || 0;
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
                            <Bar dataKey="rolos" name="Peças" radius={[4, 4, 0, 0]}>
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
          {byMachine.length > 0 ? (
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
                    {(byMachine || []).filter((m: any) => (m.name || '').toLowerCase().includes(searchMachine.toLowerCase())).map((m: any) => {
                      const pctRolls = m.pct_rolls || 0;
                      const pctRevenue = m.pct_revenue || 0;
                      return (
                        <div key={m.name} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-display font-bold text-foreground">{m.name}</p>
                            <Badge className={cn(
                              "text-xs",
                              m.eficiencia >= avgTargetEfficiency ? "bg-success/10 text-success" : m.eficiencia >= avgTargetEfficiency * 0.875 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
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
            ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Sem dados de máquinas no período selecionado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* POR CLIENTE */}
        <TabsContent value="cliente" className="mt-6 space-y-6">
          {byClient.length > 0 ? (
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
                    {byClient.filter((c: any) => (c.name || '').toLowerCase().includes(searchClient.toLowerCase())).map((c: any) => {
                      const pctRolls = c.pct_rolls || 0;
                      const pctKg = c.pct_kg || 0;
                       const pctRevenue = c.pct_revenue || 0;
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
            ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Sem dados de clientes no período selecionado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* POR ARTIGO */}
        <TabsContent value="artigo" className="mt-6 space-y-6">
          {byArticle.length > 0 ? (
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
                    {byArticle.filter((a: any) => (a.name || '').toLowerCase().includes(searchArticle.toLowerCase()) || (a.clientName || '').toLowerCase().includes(searchArticle.toLowerCase())).map((a: any) => {
                      const pctRolls = a.pct_rolls || 0;
                      const pctKg = a.pct_kg || 0;
                      const pctRevenue = a.pct_revenue || 0;
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
            ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">Sem dados de artigos no período selecionado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

         <TabsContent value="evolucao" className="mt-6 space-y-6">
           {evolutionData.length > 1 ? (
            <>
              {/* Daily KPIs */}
               {(() => {
                 const bestDay = [...evolutionData].sort((a, b) => b.rolos - a.rolos)[0];
                 const avgRolls = evolutionData.reduce((s, d) => s + d.rolos, 0) / evolutionData.length;
                 const avgRevenue = evolutionData.reduce((s, d) => s + Number(d.faturamento || 0), 0) / evolutionData.length;
                 const avgWeight = kpis.total_weight / evolutionData.length;
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
                         <p className="text-2xl font-bold text-foreground">{formatWeight(avgWeight)}</p>
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
                     <AreaChart data={evolutionData}>
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
                     <LineChart data={evolutionData}>
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
                       <AreaChart data={evolutionData}>
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
                     <BarChart data={evolutionData}>
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
                     onClick={() => handleExport('completo', exportMode, includeCharts, exportFormat, [], byShift, byMachine, byClient, byArticle, periodLabel, companyLogoUrl, companyName)}
                   />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Exportação Específica</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                         <ExportButton
                           label="Por Artigo"
                           description="Rolos, Kg, Valor"
                           onClick={() => handleExport('artigo', exportMode, includeCharts, exportFormat, [], byShift, byMachine, byClient, byArticle, periodLabel, companyLogoUrl, companyName)}
                         />
                         <ExportButton
                           label="Por Máquina"
                           description="Performance individual"
                           onClick={() => handleExport('maquina', exportMode, includeCharts, exportFormat, [], byShift, byMachine, byClient, byArticle, periodLabel, companyLogoUrl, companyName)}
                         />
                         <ExportButton
                           label="Por Turno"
                           description="Análise comparativa"
                           onClick={() => handleExport('turno', exportMode, includeCharts, exportFormat, [], byShift, byMachine, byClient, byArticle, periodLabel, companyLogoUrl, companyName)}
                         />
                         <ExportButton
                           label="Por Cliente"
                           description="Produção por cliente"
                           onClick={() => handleExport('cliente', exportMode, includeCharts, exportFormat, [], byShift, byMachine, byClient, byArticle, periodLabel, companyLogoUrl, companyName)}
                         />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PÓDIO — Ranking por Turno */}
              <TabsContent value="podio" className="mt-4 space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          Pódio por Turno
                        </CardTitle>
                        <CardDescription>
                          Top 3 turnos somando eficiência, peças e peso produzido — {podioComputed.periodLabel}
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePodioExport(podioComputed, companyLogoUrl, companyName)}
                        disabled={podioComputed.ranking.length === 0}
                      >
                        <Download className="h-4 w-4 mr-1" /> Exportar PDF
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Filtros do pódio */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={podioRange === '1' ? 'default' : 'outline'}
                        onClick={() => { setPodioRange('1'); setPodioFrom(undefined); setPodioTo(undefined); }}
                      >1 Dia</Button>
                      <Button
                        size="sm"
                        variant={podioRange === '7' ? 'default' : 'outline'}
                        onClick={() => { setPodioRange('7'); setPodioFrom(undefined); setPodioTo(undefined); }}
                      >7 Dias</Button>
                      <div className="w-px h-6 bg-border mx-1" />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant={podioRange === 'custom' && podioFrom ? 'default' : 'outline'} size="sm">
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            {podioFrom ? format(podioFrom, 'dd/MM/yyyy') : 'De'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={podioFrom} onSelect={(d) => { setPodioFrom(d); setPodioRange('custom'); }} locale={ptBR} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant={podioRange === 'custom' && podioTo ? 'default' : 'outline'} size="sm">
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            {podioTo ? format(podioTo, 'dd/MM/yyyy') : 'Até'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={podioTo} onSelect={(d) => { setPodioTo(d); setPodioRange('custom'); }} locale={ptBR} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Pódio visual */}
                    {podioComputed.ranking.length === 0 ? (
                      <div className="text-center py-12 text-sm text-muted-foreground">
                        Nenhuma produção registrada no período.
                      </div>
                    ) : (
                      <>
                        <PodiumDisplay ranking={podioComputed.ranking} />

                        {/* Listagem por dia */}
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            Detalhamento por Dia
                          </p>
                          <div className="border border-border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50">
                                <tr className="text-left">
                                  <th className="px-3 py-2 font-medium">Data</th>
                                  <th className="px-3 py-2 font-medium">🥇 1º Lugar</th>
                                  <th className="px-3 py-2 font-medium">🥈 2º Lugar</th>
                                  <th className="px-3 py-2 font-medium">🥉 3º Lugar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {podioComputed.daily.map(d => (
                                  <tr key={d.date} className="border-t border-border">
                                    <td className="px-3 py-2 font-medium">
                                      {format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy (EEE)', { locale: ptBR })}
                                    </td>
                                    {[0, 1, 2].map(i => {
                                      const w = d.ranking[i];
                                      return (
                                        <td key={i} className="px-3 py-2 text-muted-foreground">
                                          {w ? (
                                            <div className="space-y-0.5">
                                              <div className="font-medium text-foreground">{w.name}</div>
                                              <div className="text-xs">
                                                {formatNumber(w.rolos)} pç · {formatNumber(w.kg, 2)} kg · {formatNumber(w.eficiencia, 1)}%
                                              </div>
                                            </div>
                                          ) : <span className="text-xs">—</span>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : kpis && kpis.total_rolls === 0 ? (
          <div className="text-center py-24 bg-muted/30 rounded-xl border border-dashed border-border">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">Nenhuma produção encontrada</h3>
            <p className="text-muted-foreground max-w-xs mx-auto mt-2">
              Não há registros de produção para os filtros selecionados no período de {periodLabel}.
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-6">
                <RotateCcw className="h-4 w-4 mr-2" /> Limpar Filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-24 bg-muted/30 rounded-xl border border-dashed border-border">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">Aguardando dados</h3>
            <p className="text-muted-foreground max-w-xs mx-auto mt-2">
              Registre produções para começar a visualizar seus relatórios detalhados.
            </p>
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

// --- Pódio: componente visual (1º acima, 2º e 3º abaixo formando triângulo) ---
// --- Pódio: componente visual moderno inspirado na imagem ---
function PodiumDisplay({ ranking }: { ranking: any[] }) {
  const first = ranking[0];
  const second = ranking[1];
  const third = ranking[2];

  const winnerMsg = first 
    ? `FOCO, DISCIPLINA E CONSTÂNCIA GERAM RESULTADOS. PARABÉNS AO TURNO ${first.name.toUpperCase()} PELO DESEMPENHO!` 
    : null;

  const PodiumBox = ({ winner, rank, isFirst = false }: { winner: any, rank: number, isFirst?: boolean }) => {
    const colors = {
      1: { border: 'border-amber-400', bg: 'bg-amber-400/10', text: 'text-amber-500', icon: Trophy, medalColor: 'bg-amber-500' },
      2: { border: 'border-slate-300', bg: 'bg-slate-300/10', text: 'text-slate-400', icon: Medal, medalColor: 'bg-slate-400' },
      3: { border: 'border-amber-700', bg: 'bg-amber-700/10', text: 'text-amber-800', icon: Award, medalColor: 'bg-amber-800' },
    }[rank] || { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-400', icon: Trophy, medalColor: 'bg-gray-400' };

    const Icon = colors.icon;

    return (
      <div className={cn(
        "relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all duration-300 hover:scale-105 hover:shadow-xl",
        colors.border,
        colors.bg,
        isFirst ? "md:-mt-12 z-10 bg-gradient-to-b from-amber-500/20 to-transparent" : "opacity-90"
      )}>
        <div className={cn(
          "absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-lg",
          colors.medalColor
        )}>
          <span className="text-white font-black text-xl">{rank}</span>
        </div>

        <div className="mt-4 mb-2 flex flex-col items-center">
          <div className={cn("p-3 rounded-full bg-white/80 mb-3 shadow-inner", colors.text)}>
            <Icon className={isFirst ? "h-10 w-10" : "h-8 w-8"} />
          </div>
          <h3 className={cn("text-center font-black uppercase tracking-tighter leading-none", isFirst ? "text-2xl" : "text-xl")}>
            {winner?.name || '—'}
          </h3>
        </div>

        <div className="w-full space-y-3 mt-4">
          <div className="flex justify-between items-end border-b border-black/5 pb-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-left">Peças</span>
            <span className="font-black text-lg leading-none">{formatNumber(winner?.rolos || 0)}</span>
          </div>
          <div className="flex justify-between items-end border-b border-black/5 pb-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-left">Peso (kg)</span>
            <span className="font-black text-lg leading-none">{formatWeight(winner?.kg || 0)}</span>
          </div>
          <div className="pt-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-left">Eficiência</span>
              <span className={cn("font-black text-xl italic", colors.text)}>
                {formatPercent(winner?.eficiencia || 0)}
              </span>
            </div>
            <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden shadow-inner">
              <div 
                className={cn("h-full rounded-full transition-all duration-1000", colors.medalColor)}
                style={{ width: `${Math.min(winner?.eficiencia || 0, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="py-12 px-4 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Trophy className="h-64 w-64 rotate-12" />
      </div>

      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4 bg-white px-4 py-1 border-amber-500 text-amber-600 font-bold tracking-widest uppercase">
            Ranking de Performance
          </Badge>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic">
            Pódio por Turno
          </h2>
          <p className="text-slate-500 font-medium max-w-lg mx-auto mt-2">
            O reconhecimento dos melhores resultados gera excelência. Parabéns aos líderes!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 items-end mt-8">
          {/* 2nd Place */}
          <div className="order-2 md:order-1">
            <PodiumBox winner={second} rank={2} />
          </div>

          {/* 1st Place */}
          <div className="order-1 md:order-2">
            <PodiumBox winner={first} rank={1} isFirst />
          </div>

          {/* 3rd Place */}
          <div className="order-3">
            <PodiumBox winner={third} rank={3} />
          </div>
        </div>

        {winnerMsg && (
          <div className="mt-16 text-center animate-bounce">
            <div className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-full shadow-2xl">
              <Gauge className="h-6 w-6 text-amber-400" />
              <span className="font-bold tracking-tight uppercase tracking-widest text-xs sm:text-sm text-center">
                {winnerMsg}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Pódio: exportação PDF ---
async function handlePodioExport(
  podio: { ranking: any[]; daily: { date: string; ranking: any[] }[]; periodLabel: string },
  logoUrl?: string | null,
  companyName?: string,
) {
  const fmtN = (v: number | undefined | null, d = 0) =>
    (v === undefined || v === null || isNaN(v as number))
      ? '0'
      : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

  const loadLogo = (url: string): Promise<{ data: string; width: number; height: number } | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  let logoInfo: { data: string; width: number; height: number } | null = null;
  if (logoUrl) logoInfo = await loadLogo(logoUrl);

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const colors = {
    grayBg: [249, 250, 251] as [number, number, number],
    border: [229, 231, 235] as [number, number, number],
    textDark: [17, 24, 39] as [number, number, number],
    textMid: [75, 85, 99] as [number, number, number],
    gold: [251, 191, 36] as [number, number, number],
    silver: [203, 213, 225] as [number, number, number],
    bronze: [251, 146, 60] as [number, number, number],
  };

  const cName = companyName || '';
  const dateStr = new Date().toLocaleString('pt-BR');
  const reportTitle = 'PÓDIO POR TURNO';

  const fitWithinBox = (width: number, height: number, maxWidth: number, maxHeight: number) => {
    if (!width || !height) return { width: maxWidth, height: maxHeight };
    const scale = Math.min(maxWidth / width, maxHeight / height);
    return { width: width * scale, height: height * scale };
  };

  const addHeader = () => {
    const headerH = 25;
    const leftX = margin + 5;
    const rightX = pageWidth - margin - 5;
    pdf.setFillColor(...colors.grayBg);
    pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'F');
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'S');

    if (logoInfo) {
      try {
        const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
        pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
      } catch { /* noop */ }
    } else if (cName) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      pdf.text(sanitizePdfText(cName), leftX, y + 10);
    }
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.textMid);
    pdf.text(dateStr, leftX, y + 22);

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textDark);
    const tw = pdf.getTextWidth(reportTitle);
    pdf.text(reportTitle, (pageWidth - tw) / 2, y + 14);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.textMid);
    const pw = pdf.getTextWidth(podio.periodLabel);
    pdf.text(podio.periodLabel, rightX - pw, y + 22);

    y += headerH + 8;
  };

  // Draw podium: 1st centered & tallest, 2nd left, 3rd right with a darker, modern aesthetic
  const drawPodium = () => {
    const first = podio.ranking[0];
    const second = podio.ranking[1];
    const third = podio.ranking[2];

    const boxW = 50;
    const gap = 8;
    const totalW = boxW * 3 + gap * 2;
    const startX = (pageWidth - totalW) / 2;
    const baseY = y + 70;

    // Dark background for podium section to match the "incetive/rivalry" vibe
    pdf.setFillColor(31, 41, 55); // Gray-800
    pdf.roundedRect(startX - 5, y - 5, totalW + 10, 85, 3, 3, 'F');

    const drawBox = (
      x: number,
      h: number,
      color: [number, number, number],
      place: string,
      w: any,
      isFirst = false
    ) => {
      const top = baseY - h;
      
      // Gradient-like effect for the box (outer shadow)
      pdf.setDrawColor(...color);
      pdf.setLineWidth(0.8);
      pdf.roundedRect(x, top, boxW, h, 2, 2, 'D');

      // Box body
      pdf.setFillColor(17, 24, 39); // Gray-900 (Darker)
      pdf.roundedRect(x, top, boxW, h, 2, 2, 'F');

      // Rank Number with Color
      pdf.setFontSize(isFirst ? 24 : 18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...color);
      const pw = pdf.getTextWidth(place);
      pdf.text(place, x + 6, top + (isFirst ? 14 : 10));

      // Trophy/Award Icon representation
      if (isFirst) {
        pdf.setFillColor(...color);
        pdf.circle(x + boxW - 10, top + 10, 4, 'F');
        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(6);
        pdf.text('WIN', x + boxW - 13, top + 11);
      }

      // Name
      pdf.setFontSize(isFirst ? 12 : 10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      const name = sanitizePdfText(w?.name || '—');
      const nameLines = pdf.splitTextToSize(name, boxW - 4) as string[];
      let ny = top + (isFirst ? 24 : 20);
      nameLines.slice(0, 2).forEach(line => {
        const lw = pdf.getTextWidth(line);
        pdf.text(line, x + boxW / 2 - lw / 2, ny);
        ny += 5;
      });

      if (w) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(isFirst ? 9 : 8);
        pdf.setTextColor(209, 213, 219); // Gray-300
        
        const metrics = [
          { label: 'PEÇAS', val: `${fmtN(w.rolos)}` },
          { label: 'PESO', val: `${fmtN(w.kg, 2)} kg` },
          { label: 'EFIC.', val: `${fmtN(w.eficiencia, 1)}%` }
        ];

        ny += 4;
        metrics.forEach((m) => {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...color);
          pdf.text(m.label, x + 4, ny);
          
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(255, 255, 255);
          const valW = pdf.getTextWidth(m.val);
          pdf.text(m.val, x + boxW - valW - 4, ny);
          ny += 5;
        });

        // Efficiency bar
        const barMaxW = boxW - 8;
        const barW = (Math.min(w.eficiencia, 100) / 100) * barMaxW;
        pdf.setFillColor(55, 65, 81); // Gray-700
        pdf.roundedRect(x + 4, ny, barMaxW, 2, 1, 1, 'F');
        pdf.setFillColor(...color);
        pdf.roundedRect(x + 4, ny, barW, 2, 1, 1, 'F');
      }
    };

    // Draw in order: 2nd, 1st (overlaps slightly if needed), 3rd
    if (second) drawBox(startX, 55, [192, 192, 192], '2', second);
    if (first) drawBox(startX + boxW + gap, 70, [234, 179, 8], '1', first, true); // Amber-500 for Gold
    if (third) drawBox(startX + 2 * (boxW + gap), 45, [205, 127, 50], '3', third);

    // Motivational Quote at the bottom of podium section
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(156, 163, 175); // Gray-400
    const quote = "FOCO, DISCIPLINA E CONSTÂNCIA GERAM RESULTADOS. PARABÉNS PELO DESEMPENHO!";
    const qw = pdf.getTextWidth(quote);
    pdf.text(quote, (pageWidth - qw) / 2, baseY + 10);

    y = baseY + 20;
  };

  const drawDailyTable = () => {
    const availW = pageWidth - 2 * margin;
    const cols = [38, (availW - 38) / 3, (availW - 38) / 3, (availW - 38) / 3];
    const rowH = 9;
    const headerH = 9;

    const drawTableHeader = () => {
      if (y + headerH + rowH > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        addHeader();
      }
      pdf.setFillColor(...colors.grayBg);
      pdf.rect(margin, y, availW, headerH, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, y, availW, headerH);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      const headers = ['Data', '1o Lugar', '2o Lugar', '3o Lugar'];
      let x = margin;
      headers.forEach((h, i) => {
        pdf.text(h, x + 2, y + 6);
        x += cols[i];
      });
      y += headerH;
    };

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textDark);
    pdf.text('Detalhamento por Dia', margin, y);
    y += 6;

    drawTableHeader();

    podio.daily.forEach((d, ri) => {
      if (y + rowH > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        addHeader();
        drawTableHeader();
      }
      pdf.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 252);
      pdf.rect(margin, y, availW, rowH, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.1);
      pdf.rect(margin, y, availW, rowH);

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colors.textDark);

      const dateLabel = (() => {
        const dt = new Date(d.date + 'T12:00:00');
        return dt.toLocaleDateString('pt-BR');
      })();
      let x = margin;
      pdf.text(dateLabel, x + 2, y + 5.5);
      x += cols[0];
      [0, 1, 2].forEach(idx => {
        const w = d.ranking[idx];
        const text = w
          ? `${sanitizePdfText(w.name).substring(0, 18)} - ${fmtN(w.kg, 2)}kg - ${fmtN(w.eficiencia, 1)}%`
          : '—';
        pdf.text(text, x + 2, y + 5.5);
        x += cols[idx + 1];
      });
      y += rowH;
    });
  };

  addHeader();
  drawPodium();
  drawDailyTable();

  const fileName = `podio_turnos_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
  pdf.save(fileName);
}

// --- Export handler ---

 function handleExport(
   type: string,
   mode: 'admin' | 'employee',
   _includeCharts: boolean,
   exportFormat: 'pdf' | 'csv',
   filtered: any[],
   byShift: any[],
   byMachine: any[],
   byClient: any[],
   byArticle: any[],
   periodLabel: string,
   logoUrl?: string | null,
   companyName?: string,
 ) {
  const isAdmin = mode === 'admin';

   const fmtN = (v: number | undefined | null, d = 0) => {
     if (v === undefined || v === null || isNaN(v as number)) return '0';
     return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
   };
  const fmtK = (v: number) => fmtN(v, 2);
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;
  const fmtE = (v: number) => `${fmtN(v, 1)}%`;

  // Build table data
  const sections: { title: string; headers: string[]; rows: (string | number)[][] }[] = [];

  if (type === 'completo' || type === 'turno') {
    const headers = isAdmin ? ['Turno', 'Rolos', 'Peso (kg)', 'Eficiência (%)', 'Faturamento'] : ['Turno', 'Rolos', 'Peso (kg)', 'Eficiência (%)'];
    const rows = byShift.map(s => isAdmin ? [s.name, fmtN(s.rolos), fmtK(s.kg), fmtE(s.eficiencia), fmtR(s.faturamento)] : [s.name, fmtN(s.rolos), fmtK(s.kg), fmtE(s.eficiencia)]);
    const tR = byShift.reduce((a, s) => a + s.rolos, 0), tK = byShift.reduce((a, s) => a + s.kg, 0), tF = byShift.reduce((a, s) => a + s.faturamento, 0);
    const avgE = byShift.length ? byShift.reduce((a, s) => a + s.eficiencia, 0) / byShift.length : 0;
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtE(avgE), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK), fmtE(avgE)]);
    sections.push({ title: 'Por Turno', headers, rows });
  }

  if (type === 'completo' || type === 'maquina') {
    const headers = isAdmin ? ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)', 'Faturamento'] : ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)'];
    const rows = byMachine.map(m => isAdmin ? [m.name, fmtN(m.rolos), fmtK(m.kg), fmtE(m.eficiencia), fmtR(m.faturamento)] : [m.name, fmtN(m.rolos), fmtK(m.kg), fmtE(m.eficiencia)]);
    const tR = byMachine.reduce((a, m) => a + m.rolos, 0), tK = byMachine.reduce((a, m) => a + m.kg, 0);
    const avgE = byMachine.length ? byMachine.reduce((a, m) => a + m.eficiencia, 0) / byMachine.length : 0;
    const tF = byMachine.reduce((a, m) => a + m.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtE(avgE), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK), fmtE(avgE)]);
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
     const headers = isAdmin ? ['Artigo', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Artigo', 'Rolos', 'Peso (kg)'];
     const rows = byArticle.map(a => isAdmin ? [a.name, fmtN(a.rolos), fmtK(a.kg), fmtR(a.faturamento)] : [a.name, fmtN(a.rolos), fmtK(a.kg)]);
     const tR = byArticle.reduce((ac, a) => ac + a.rolos, 0), tK = byArticle.reduce((ac, a) => ac + a.kg, 0), tF = byArticle.reduce((ac, a) => ac + a.faturamento, 0);
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
    const typeLabels: Record<string, string> = {
      completo: 'Produção - Completo',
      maquina: 'Produção - Máquinas',
      turno: 'Produção - Turnos',
      cliente: 'Produção - Clientes',
      artigo: 'Produção - Artigos',
    };
    const reportTitle = `RELATÓRIO ${(typeLabels[type] || 'Produção').toUpperCase()}`;
    const cName = companyName || '';
    const dateStr = new Date().toLocaleString('pt-BR');

    const typeFileNames: Record<string, string> = {
      completo: 'Completo',
      maquina: 'Maquinas',
      turno: 'Turnos',
      cliente: 'Clientes',
      artigo: 'Artigos',
    };
    const fileName = `relatorio_${typeFileNames[type] || type}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;

    // Load logo if available
    const loadLogo = (url: string): Promise<{ data: string; width: number; height: number } | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            resolve({ data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
          } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    };

    const doExport = async () => {
      let logoInfo: { data: string; width: number; height: number } | null = null;
      if (logoUrl) {
        logoInfo = await loadLogo(logoUrl);
      }

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const colors = {
        grayBg: [249, 250, 251] as [number, number, number],
        border: [229, 231, 235] as [number, number, number],
        textDark: [17, 24, 39] as [number, number, number],
        textMid: [75, 85, 99] as [number, number, number],
        barBlue: [37, 99, 235] as [number, number, number],
        barOrange: [245, 158, 11] as [number, number, number],
        barGreen: [22, 163, 74] as [number, number, number],
        barPurple: [139, 92, 246] as [number, number, number],
        totalBg: [255, 251, 235] as [number, number, number],
      };

      const fitWithinBox = (width: number, height: number, maxWidth: number, maxHeight: number) => {
        if (!width || !height) return { width: maxWidth, height: maxHeight };
        const scale = Math.min(maxWidth / width, maxHeight / height);
        return {
          width: width * scale,
          height: height * scale,
        };
      };

      const addHeader = () => {
        const headerH = 25;
        const leftX = margin + 5;
        const rightX = pageWidth - margin - 5;
        const titleMaxWidth = pageWidth - 2 * margin - 90;

        pdf.setFillColor(...colors.grayBg);
        pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'F');
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.5);
        pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'S');

        // Left side: logo OR company name, then date below
        if (logoInfo) {
          try {
            const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
            pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...colors.textMid);
            pdf.text(dateStr, leftX, y + 22);
          } catch {
            if (cName) {
              pdf.setFontSize(10);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(...colors.textDark);
              pdf.text(sanitizePdfText(cName), leftX, y + 10);
            }
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...colors.textMid);
            pdf.text(dateStr, leftX, y + 22);
          }
        } else {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colors.textDark);
          if (cName) {
            pdf.text(sanitizePdfText(cName), leftX, y + 10);
          }
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...colors.textMid);
          pdf.text(dateStr, leftX, y + 22);
        }

        // Center: Title slightly above middle
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colors.textDark);
        const titleLines = pdf.splitTextToSize(reportTitle, titleMaxWidth) as string[];
        let titleY = y + 10;
        titleLines.forEach((line) => {
          const titleW = pdf.getTextWidth(line);
          pdf.text(line, (pageWidth - titleW) / 2, titleY);
          titleY += 6;
        });

        // Right side: filter period (aligned with date/time at bottom)
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colors.textMid);
        const periodText = periodLabel;
        const pW = pdf.getTextWidth(periodText);
        pdf.text(periodText, rightX - pW, y + 22);

        y += headerH + 10;
      };

      const drawBarChart = (data: { label: string; value: number }[], color: [number, number, number], unit: string, chartTitle: string) => {
        if (data.length === 0) return;
        const barH = 6;
        const gap = 3;
        const chartHeight = data.length * (barH + gap) + 18;

        // Check page break
        if (y + chartHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
          addHeader();
        }

        // Chart title
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colors.textMid);
        pdf.text(chartTitle, margin, y);
        y += 5;

        const maxVal = Math.max(...data.map(d => d.value), 1);
        const labelW = 35;
        const barAreaW = pageWidth - 2 * margin - labelW - 30;

        data.forEach(d => {
          // Label
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...colors.textMid);
          const labelText = d.label.length > 16 ? d.label.substring(0, 15) + '…' : d.label;
          const lw = pdf.getTextWidth(labelText);
          pdf.text(labelText, margin + labelW - lw - 2, y + barH - 1);

          // Bar
          const barW = Math.max((d.value / maxVal) * barAreaW, 1);
          pdf.setFillColor(...color);
          pdf.roundedRect(margin + labelW, y, barW, barH, 1.5, 1.5, 'F');

          // Value label
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colors.textDark);
          const valStr = unit === 'R$' ? `R$ ${fmtN(d.value, 2)}` : fmtN(d.value, unit === '%' ? 1 : 0) + (unit === '%' ? '%' : unit === 'kg' ? ' kg' : '');
          pdf.text(valStr, margin + labelW + barW + 3, y + barH - 1);

          y += barH + gap;
        });
        y += 5;
      };

      const drawTable = (sec: { title: string; headers: string[]; rows: (string | number)[][] }) => {
        const colCount = sec.headers.length;
        const availW = pageWidth - 2 * margin;
        const colW = availW / colCount;
        const rowH = 8;
        const headerH = 10;

        const drawTableHeader = () => {
          // Check page break for header + at least 1 row
          if (y + headerH + rowH > pageHeight - margin) {
            pdf.addPage();
            y = margin;
            addHeader();
          }

          pdf.setFillColor(...colors.grayBg);
          pdf.rect(margin, y, availW, headerH, 'F');
          pdf.setDrawColor(...colors.border);
          pdf.setLineWidth(0.3);
          pdf.rect(margin, y, availW, headerH);

          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colors.textDark);

          sec.headers.forEach((h, i) => {
            pdf.text(h, margin + i * colW + 3, y + 7);
          });
          y += headerH;
        };

        drawTableHeader();

        // Data rows
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);

        sec.rows.forEach((row, ri) => {
          const isTotal = ri === sec.rows.length - 1;

          // Page break check
          if (y + rowH > pageHeight - margin) {
            pdf.addPage();
            y = margin;
            addHeader();
            drawTableHeader();
            // Reset font to normal after re-drawing header on new page
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
          }

          // Row background
          if (isTotal) {
            pdf.setFillColor(...colors.totalBg);
          } else {
            pdf.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 252);
          }
          pdf.rect(margin, y, availW, rowH, 'F');
          pdf.setDrawColor(...colors.border);
          pdf.setLineWidth(0.1);
          pdf.rect(margin, y, availW, rowH);

          if (isTotal) {
            pdf.setDrawColor(...colors.textDark);
            pdf.setLineWidth(0.5);
            pdf.line(margin, y, margin + availW, y);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
          }

          pdf.setTextColor(...colors.textDark);
          row.forEach((cell, ci) => {
            const text = String(cell);
            const truncated = text.length > 25 ? text.substring(0, 24) + '…' : text;
            pdf.text(truncated, margin + ci * colW + 3, y + 5.5);
          });

          if (isTotal) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
          }

          y += rowH;
        });
        y += 8;
      };

      // Build PDF
      addHeader();

      // Draw charts if enabled
      if (_includeCharts) {
        sections.forEach(sec => {
          if (sec.title === 'Por Turno') {
            drawBarChart(byShift.map(s => ({ label: s.name, value: s.eficiencia })), colors.barOrange, '%', 'Eficiência por Turno (%)');
            drawBarChart(byShift.map(s => ({ label: s.name, value: s.rolos })), colors.barBlue, '', 'Rolos por Turno');
            if (isAdmin) {
              drawBarChart(byShift.map(s => ({ label: s.name, value: s.faturamento })), colors.barGreen, 'R$', 'Faturamento por Turno');
            }
          } else if (sec.title === 'Por Máquina') {
            drawBarChart(byMachine.slice(0, 10).map(m => ({ label: m.name, value: m.eficiencia })), colors.barOrange, '%', 'Eficiência por Máquina (%)');
            drawBarChart(byMachine.slice(0, 10).map(m => ({ label: m.name, value: m.rolos })), colors.barBlue, '', 'Rolos por Máquina');
          } else if (sec.title === 'Por Cliente') {
            drawBarChart(byClient.slice(0, 8).map(c => ({ label: c.name, value: c.kg })), colors.barPurple, 'kg', 'Peso por Cliente (kg)');
            if (isAdmin) {
              drawBarChart(byClient.slice(0, 8).map(c => ({ label: c.name, value: c.faturamento })), colors.barGreen, 'R$', 'Faturamento por Cliente');
            }
          } else if (sec.title === 'Por Artigo') {
            const artData = sec.rows.slice(0, -1).slice(0, 10).map(r => ({
              label: String(r[0]),
              value: parseFloat(String(r[1]).replace(/\./g, '').replace(',', '.')) || 0,
            }));
            drawBarChart(artData, colors.barBlue, '', 'Rolos por Artigo');
          }
        });
      }

      // Draw tables
      sections.forEach(sec => {
        drawTable(sec);
      });

      pdf.save(fileName);
    };

    doExport();
  }
}
