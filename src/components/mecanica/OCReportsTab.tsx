import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Download, FileText, RotateCcw, AlertTriangle, Clock, Wrench, Users, Activity, TrendingUp, Search, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sanitizePdfText } from '@/lib/pdfUtils';
import type { Machine, MaintenanceOrder } from '@/types';

interface Props {
  orders: MaintenanceOrder[]; // já filtradas para OC (manutencao_corretiva)
  machines: Machine[];
  companyName?: string;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto', em_curso: 'Em Curso', finalizada: 'Finalizada', cancelada: 'Cancelada',
};
const STATUS_COLOR: Record<string, string> = {
  aberto: 'hsl(38, 92%, 50%)',
  em_curso: 'hsl(221, 83%, 53%)',
  finalizada: 'hsl(142, 71%, 45%)',
  cancelada: 'hsl(0, 0%, 55%)',
};

const CHART_COLORS = [
  'hsl(var(--primary))', 'hsl(38, 92%, 50%)', 'hsl(221, 83%, 53%)',
  'hsl(0, 84%, 60%)', 'hsl(280, 60%, 50%)', 'hsl(199, 89%, 48%)',
  'hsl(142, 71%, 45%)', 'hsl(24, 95%, 53%)',
];

function fmtDur(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', h ? '' : `${sec}s`].filter(Boolean).join(' ') || '0s';
}
function fmtHours(seconds: number): string {
  return (seconds / 3600).toFixed(1).replace('.', ',') + 'h';
}

type Period = 'current' | 'last30' | 'last90' | 'year' | 'all' | 'custom';

export default function OCReportsTab({ orders, machines, companyName }: Props) {
  const now = new Date();
  const [detailOrder, setDetailOrder] = useState<MaintenanceOrder | null>(null);
  const [detailPhotoUrls, setDetailPhotoUrls] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<Period>('current');
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [minMinutes, setMinMinutes] = useState<string>('');
  const [maxMinutes, setMaxMinutes] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const applyPeriod = (p: Period) => {
    setPeriod(p);
    const today = new Date();
    if (p === 'current') {
      setDateFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(today), 'yyyy-MM-dd'));
    } else if (p === 'last30') {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      setDateFrom(format(d, 'yyyy-MM-dd'));
      setDateTo(format(today, 'yyyy-MM-dd'));
    } else if (p === 'last90') {
      const d = new Date(today); d.setDate(d.getDate() - 89);
      setDateFrom(format(d, 'yyyy-MM-dd'));
      setDateTo(format(today, 'yyyy-MM-dd'));
    } else if (p === 'year') {
      setDateFrom(`${today.getFullYear()}-01-01`);
      setDateTo(`${today.getFullYear()}-12-31`);
    } else if (p === 'all') {
      setDateFrom('2000-01-01');
      setDateTo('2999-12-31');
    }
  };

  const machineById = useMemo(() => {
    const m = new Map<string, Machine>();
    machines.forEach(x => m.set(x.id, x));
    return m;
  }, [machines]);

  const allUsers = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => {
      if (o.created_by_name) s.add(o.created_by_name);
      if (o.started_by_name) s.add(o.started_by_name);
      if (o.finished_by_name) s.add(o.finished_by_name);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [orders]);

  const filtered = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to = new Date(dateTo + 'T23:59:59');
    const minNum = Number(minMinutes);
    const maxNum = Number(maxMinutes);
    const minSec = minMinutes !== '' && Number.isFinite(minNum) && minNum >= 0 ? minNum * 60 : null;
    const maxSec = maxMinutes !== '' && Number.isFinite(maxNum) && maxNum >= 0 ? maxNum * 60 : null;
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      const created = new Date(o.created_at);
      if (created < from || created > to) return false;
      if (machineFilter !== 'all' && o.machine_id !== machineFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (userFilter !== 'all') {
        const names = [o.created_by_name, o.started_by_name, o.finished_by_name].filter(Boolean) as string[];
        if (!names.includes(userFilter)) return false;
      }
      const dur = o.duration_seconds ?? 0;
      if (minSec != null && dur < minSec) return false;
      if (maxSec != null && dur > maxSec) return false;
      if (q) {
        const machine = machineById.get(o.machine_id);
        const hay = [
          o.oc_number != null ? String(o.oc_number).padStart(3, '0') : '',
          machine?.name || '',
          o.description || '',
          o.created_by_name || '', o.started_by_name || '', o.finished_by_name || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, dateFrom, dateTo, machineFilter, userFilter, statusFilter, minMinutes, maxMinutes, search, machineById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, machineFilter, userFilter, statusFilter, minMinutes, maxMinutes, search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const detailPhotos: { path: string; description?: string }[] = useMemo(() => {
    if (!detailOrder) return [];
    const arr = (detailOrder as any).oc_photos;
    return Array.isArray(arr) ? arr : [];
  }, [detailOrder]);

  useEffect(() => {
    if (!detailOrder || detailPhotos.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = detailPhotos.filter(p => !detailPhotoUrls[p.path]);
      if (missing.length === 0) return;
      const entries: Record<string, string> = {};
      for (const p of missing) {
        const { data } = await supabase.storage.from('oc-photos').createSignedUrl(p.path, 3600);
        if (data?.signedUrl) entries[p.path] = data.signedUrl;
      }
      if (!cancelled && Object.keys(entries).length) {
        setDetailPhotoUrls(prev => ({ ...prev, ...entries }));
      }
    })();
    return () => { cancelled = true; };
  }, [detailOrder, detailPhotos, detailPhotoUrls]);

  // KPIs
  const kpis = useMemo(() => {
    const finalized = filtered.filter(o => o.status === 'finalizada');
    const open = filtered.filter(o => o.status === 'aberto').length;
    const running = filtered.filter(o => o.status === 'em_curso').length;
    const cancelled = filtered.filter(o => o.status === 'cancelada').length;
    const totalDur = finalized.reduce((s, o) => s + (o.duration_seconds || 0), 0);
    const avgDur = finalized.length ? totalDur / finalized.length : 0;
    const maxDur = finalized.reduce((m, o) => Math.max(m, o.duration_seconds || 0), 0);
    // Máquina mais afetada
    const byMachine = new Map<string, number>();
    filtered.forEach(o => byMachine.set(o.machine_id, (byMachine.get(o.machine_id) || 0) + 1));
    let topMachineId = ''; let topMachineCount = 0;
    byMachine.forEach((v, k) => { if (v > topMachineCount) { topMachineCount = v; topMachineId = k; } });
    // Top usuário criador
    const byUser = new Map<string, number>();
    filtered.forEach(o => {
      if (o.created_by_name) byUser.set(o.created_by_name, (byUser.get(o.created_by_name) || 0) + 1);
    });
    let topUser = ''; let topUserCount = 0;
    byUser.forEach((v, k) => { if (v > topUserCount) { topUserCount = v; topUser = k; } });
    return {
      total: filtered.length, finalized: finalized.length, open, running, cancelled,
      totalDur, avgDur, maxDur,
      topMachine: topMachineId ? (machineById.get(topMachineId)?.name || '—') : '—',
      topMachineCount, topUser: topUser || '—', topUserCount,
    };
  }, [filtered, machineById]);

  // Chart: OCs por máquina (top 10)
  const byMachineChart = useMemo(() => {
    const map = new Map<string, { name: string; count: number; downtime: number }>();
    filtered.forEach(o => {
      const name = machineById.get(o.machine_id)?.name || '—';
      const cur = map.get(name) || { name, count: 0, downtime: 0 };
      cur.count += 1;
      cur.downtime += (o.duration_seconds || 0) / 3600;
      map.set(name, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(r => ({ ...r, downtime: Number(r.downtime.toFixed(2)) }));
  }, [filtered, machineById]);

  // Chart: OCs por dia
  const byDayChart = useMemo(() => {
    if (!filtered.length) return [];
    const from = new Date(dateFrom + 'T00:00:00');
    const to = new Date(dateTo + 'T00:00:00');
    const spanDays = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86400000) + 1);
    // Se período muito grande, agrupa por mês (evita explodir renderização diária)
    if (spanDays > 90) {
      const map = new Map<string, number>();
      filtered.forEach(o => {
        const k = format(new Date(o.created_at), 'yyyy-MM');
        map.set(k, (map.get(k) || 0) + 1);
      });
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ label: format(parseISO(k + '-01'), 'MMM/yy', { locale: ptBR }), count: v }));
    }
    const days = eachDayOfInterval({ start: from, end: to });
    const map = new Map<string, number>();
    filtered.forEach(o => {
      const k = format(new Date(o.created_at), 'yyyy-MM-dd');
      map.set(k, (map.get(k) || 0) + 1);
    });
    return days.map(d => ({
      label: format(d, 'dd/MM'),
      count: map.get(format(d, 'yyyy-MM-dd')) || 0,
    }));
  }, [filtered, dateFrom, dateTo]);

  // Chart: por usuário criador
  const byUserChart = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(o => {
      const u = o.created_by_name || '—';
      map.set(u, (map.get(u) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [filtered]);

  // Chart: por status
  const byStatusChart = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(o => map.set(o.status, (map.get(o.status) || 0) + 1));
    return Array.from(map.entries()).map(([status, value]) => ({
      name: STATUS_LABEL[status] || status, value, color: STATUS_COLOR[status] || 'hsl(var(--muted))',
    }));
  }, [filtered]);

  const resetFilters = () => {
    applyPeriod('current');
    setMachineFilter('all'); setUserFilter('all'); setStatusFilter('all');
    setMinMinutes(''); setMaxMinutes(''); setSearch('');
  };

  const exportCsv = () => {
    if (!filtered.length) { toast.error('Nenhum registro para exportar'); return; }
    const header = ['Número','Máquina','Status','Descrição','Criada em','Criada por','Iniciada em','Iniciada por','Finalizada em','Finalizada por','Duração (min)'];
    const rows = filtered.map(o => {
      const m = machineById.get(o.machine_id);
      return [
        o.oc_number != null ? String(o.oc_number).padStart(3,'0') : '—',
        m?.name || '—',
        STATUS_LABEL[o.status] || o.status,
        (o.description || '').replace(/[\r\n"]/g, ' '),
        format(new Date(o.created_at), 'dd/MM/yyyy HH:mm'),
        o.created_by_name || '—',
        o.started_at ? format(new Date(o.started_at), 'dd/MM/yyyy HH:mm') : '—',
        o.started_by_name || '—',
        o.finished_at ? format(new Date(o.finished_at), 'dd/MM/yyyy HH:mm') : '—',
        o.finished_by_name || '—',
        o.duration_seconds ? (o.duration_seconds / 60).toFixed(1).replace('.', ',') : '',
      ];
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio-oc-${dateFrom}-a-${dateTo}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const exportPdf = () => {
    if (!filtered.length) { toast.error('Nenhum registro para exportar'); return; }
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(15, 23, 42); pdf.rect(0, 0, pageW, 22, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
    pdf.text(sanitizePdfText(`Relatório de OCs — ${companyName || ''}`.trim()), 14, 13);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
    pdf.text(sanitizePdfText(`Período: ${format(new Date(dateFrom+'T00:00:00'),'dd/MM/yyyy')} a ${format(new Date(dateTo+'T00:00:00'),'dd/MM/yyyy')}`), 14, 19);
    pdf.setTextColor(0, 0, 0);

    // KPI resumo
    autoTable(pdf, {
      startY: 28,
      head: [['Total OCs','Finalizadas','Abertas','Em Curso','Canceladas','Tempo Total Parada','Média Parada','Máquina Mais Afetada']],
      body: [[
        String(kpis.total), String(kpis.finalized), String(kpis.open), String(kpis.running), String(kpis.cancelled),
        fmtHours(kpis.totalDur), fmtHours(kpis.avgDur), sanitizePdfText(`${kpis.topMachine} (${kpis.topMachineCount})`),
      ]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      theme: 'grid',
    });

    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable.finalY + 6,
      head: [['Nº','Máquina','Status','Descrição','Criada','Iniciada','Finalizada','Parada']],
      body: filtered.map(o => {
        const m = machineById.get(o.machine_id);
        return [
          o.oc_number != null ? String(o.oc_number).padStart(3,'0') : '—',
          sanitizePdfText(m?.name || '—'),
          STATUS_LABEL[o.status] || o.status,
          sanitizePdfText((o.description || '').slice(0, 60)),
          format(new Date(o.created_at), 'dd/MM HH:mm'),
          o.started_at ? format(new Date(o.started_at),'dd/MM HH:mm') : '—',
          o.finished_at ? format(new Date(o.finished_at),'dd/MM HH:mm') : '—',
          o.duration_seconds ? fmtDur(o.duration_seconds) : '—',
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      theme: 'grid',
    });

    pdf.save(`relatorio-oc-${dateFrom}-a-${dateTo}.pdf`);
    toast.success('PDF gerado');
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total de OCs" value={String(kpis.total)} icon={<AlertTriangle className="h-4 w-4" />} accent="from-primary/20 to-primary/5" />
        <KpiCard label="Finalizadas" value={String(kpis.finalized)} sub={`${kpis.open} abertas · ${kpis.running} em curso`} icon={<Wrench className="h-4 w-4" />} accent="from-emerald-500/20 to-emerald-500/5" />
        <KpiCard label="Tempo Total Parada" value={fmtHours(kpis.totalDur)} sub={`Média ${fmtHours(kpis.avgDur)} · Máx ${fmtHours(kpis.maxDur)}`} icon={<Clock className="h-4 w-4" />} accent="from-amber-500/20 to-amber-500/5" />
        <KpiCard label="Máquina Mais Afetada" value={kpis.topMachine} sub={kpis.topMachineCount ? `${kpis.topMachineCount} OC(s)` : ''} icon={<Activity className="h-4 w-4" />} accent="from-red-500/20 to-red-500/5" />
      </div>

      {/* Filtros */}
      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Filtros</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar</Button>
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
              <Button size="sm" onClick={exportPdf}><FileText className="h-3.5 w-3.5 mr-1" /> PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {([
              ['current','Mês atual'],['last30','Últimos 30d'],['last90','Últimos 90d'],['year','Ano'],['all','Tudo'],
            ] as [Period,string][]).map(([p, l]) => (
              <Button key={p} size="sm" variant={period===p?'default':'outline'} className="h-7 text-xs" onClick={() => applyPeriod(p)}>{l}</Button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPeriod('custom'); }} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPeriod('custom'); }} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Máquina</Label>
              <SearchableSelect
                value={machineFilter}
                onValueChange={setMachineFilter}
                options={[{ value: 'all', label: 'Todas as máquinas' }, ...machines.map(m => ({ value: m.id, label: m.name }))]}
                placeholder="Máquina"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_curso">Em Curso</SelectItem>
                  <SelectItem value="finalizada">Finalizada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Usuário</Label>
              <SearchableSelect
                value={userFilter}
                onValueChange={setUserFilter}
                options={[{ value: 'all', label: 'Todos usuários' }, ...allUsers.map(u => ({ value: u, label: u }))]}
                placeholder="Usuário"
              />
            </div>
            <div>
              <Label className="text-xs">Parada mín. (min)</Label>
              <Input type="number" min="0" value={minMinutes} onChange={e => setMinMinutes(e.target.value)} placeholder="0" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Parada máx. (min)</Label>
              <Input type="number" min="0" value={maxMinutes} onChange={e => setMaxMinutes(e.target.value)} placeholder="∞" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Busca</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nº, máquina, descrição…" className="h-9 pl-8" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-mono">{filtered.length}</Badge>
            <span>registro(s) encontrados</span>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="OCs por máquina (Top 10)" subtitle="Ordenadas pela quantidade de ocorrências">
          {byMachineChart.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byMachineChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: any, k: any) => k === 'downtime' ? [`${v} h`, 'Parada'] : [v, 'OCs']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="OCs" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
                <Bar dataKey="downtime" name="Parada (h)" fill="hsl(24, 95%, 53%)" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Evolução no período" subtitle="Total de OCs criadas ao longo do tempo">
          {byDayChart.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={byDayChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="ocGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#ocGrad)" name="OCs" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="OCs por usuário (criador)" subtitle="Top 8 usuários que abriram OCs no período">
          {byUserChart.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byUserChart} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="OCs" fill="hsl(221, 83%, 53%)" radius={[0,6,6,0]}>
                  {byUserChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Distribuição por status" subtitle="Situação atual das OCs no período">
          {byStatusChart.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byStatusChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {byStatusChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Detalhamento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Detalhamento ({filtered.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? <Empty /> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Nº</th>
                      <th className="text-left px-3 py-2 font-semibold">Máquina</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                      <th className="text-left px-3 py-2 font-semibold">Descrição</th>
                      <th className="text-left px-3 py-2 font-semibold">Criada</th>
                      <th className="text-left px-3 py-2 font-semibold">Criada por</th>
                      <th className="text-left px-3 py-2 font-semibold">Finalizada</th>
                      <th className="text-left px-3 py-2 font-semibold">Finalizada por</th>
                      <th className="text-right px-3 py-2 font-semibold">Parada</th>
                      <th className="text-center px-3 py-2 font-semibold w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(o => {
                      const m = machineById.get(o.machine_id);
                      return (
                        <tr key={o.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono">{o.oc_number != null ? String(o.oc_number).padStart(3,'0') : '—'}</td>
                          <td className="px-3 py-2">{m?.name || '—'}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px]" style={{ borderColor: STATUS_COLOR[o.status], color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status] || o.status}</Badge>
                          </td>
                          <td className="px-3 py-2 max-w-[280px] truncate" title={o.description || ''}>{o.description || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{format(new Date(o.created_at),'dd/MM/yy HH:mm')}</td>
                          <td className="px-3 py-2">{o.created_by_name || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{o.finished_at ? format(new Date(o.finished_at),'dd/MM/yy HH:mm') : '—'}</td>
                          <td className="px-3 py-2">{o.finished_by_name || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">{o.duration_seconds ? fmtDur(o.duration_seconds) : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailOrder(o)} title="Ver relatório">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {paginated.map(o => {
                  const m = machineById.get(o.machine_id);
                  return (
                    <div key={o.id} className="rounded-md border p-3 bg-card">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">OC {o.oc_number != null ? String(o.oc_number).padStart(3,'0') : '—'}</span>
                          <Badge variant="outline" className="text-[10px]" style={{ borderColor: STATUS_COLOR[o.status], color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status] || o.status}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{format(new Date(o.created_at),'dd/MM/yy HH:mm')}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDetailOrder(o)} title="Ver relatório">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm font-medium">{m?.name || '—'}</div>
                      {o.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.description}</div>}
                      <div className="grid grid-cols-2 gap-1 mt-2 text-[11px]">
                        <div><span className="text-muted-foreground">Criou:</span> {o.created_by_name || '—'}</div>
                        <div><span className="text-muted-foreground">Finalizou:</span> {o.finished_by_name || '—'}</div>
                        {o.duration_seconds ? <div className="col-span-2"><span className="text-muted-foreground">Parada:</span> <span className="font-mono">{fmtDur(o.duration_seconds)}</span></div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages: (number | 'dots')[] = [];
  const push = (v: number | 'dots') => { if (pages[pages.length - 1] !== v) pages.push(v); };
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) push(i);
    else push('dots');
  }
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-3 pt-3 border-t">
      <div className="text-[11px] text-muted-foreground">Exibindo <span className="font-semibold text-foreground">{from}-{to}</span> de <span className="font-semibold text-foreground">{total}</span></div>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        {pages.map((p, i) => p === 'dots'
          ? <span key={`d${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          : <Button key={p} size="sm" variant={p === page ? 'default' : 'outline'} className="h-8 min-w-8 px-2 text-xs" onClick={() => onChange(p)}>{p}</Button>
        )}
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === totalPages} onClick={() => onChange(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <Card className="relative overflow-hidden border-primary/10">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} pointer-events-none`} />
      <CardContent className="relative p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="text-xl md:text-2xl font-bold leading-tight truncate" title={value}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty() {
  return <div className="text-center text-xs text-muted-foreground py-8">Sem dados para os filtros atuais.</div>;
}