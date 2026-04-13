import { useState, useMemo } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, Pencil, Trash2, Loader2, Clock, Users, FileBarChart, CalendarIcon, Package, TrendingUp, Scale, AlertTriangle, Ruler, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatNumber, formatWeight, formatCurrency } from '@/lib/formatters';
import type { Weaver, ShiftType, Production, DefectRecord, Article } from '@/types';
import { SHIFT_LABELS } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { sanitizePdfText } from '@/lib/pdfUtils';

const SHIFT_TIME_LABELS: Record<ShiftType, string> = {
  manha: '05:00 às 13:30',
  tarde: '13:30 às 22:00',
  noite: '22:00 às 05:00',
};

export default function Weavers() {
  const { getWeavers, saveWeavers, getProductions, getDefectRecords, getArticles, getMachines, loading } = useSharedCompanyData();
  const { canSeeFinancial } = usePermissions();
  const { logAction } = useAuditLog();
  const weavers = getWeavers();
  const productions = getProductions();
  const defectRecords = getDefectRecords();
  const articles = getArticles();
  const machines = getMachines();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Weaver | null>(null);
  const [showDelete, setShowDelete] = useState<Weaver | null>(null);

  const [form, setForm] = useState({
    name: '', phone: '', shift_type: 'fixo' as 'fixo' | 'especifico',
    fixed_shift: '' as ShiftType | '', start_time: '', end_time: '',
  });

  // Counts
  const counts = useMemo(() => {
    const fixo = weavers.filter(w => w.shift_type === 'fixo');
    const especifico = weavers.filter(w => w.shift_type === 'especifico');
    const manha = fixo.filter(w => w.fixed_shift === 'manha');
    const tarde = fixo.filter(w => w.fixed_shift === 'tarde');
    const noite = fixo.filter(w => w.fixed_shift === 'noite');
    return { total: weavers.length, fixo: fixo.length, especifico: especifico.length, manha, tarde, noite };
  }, [weavers]);

  const generateCode = () => {
    const existing = weavers.map(w => parseInt(w.code.replace('#', '')));
    let code = 100;
    while (existing.includes(code) && code <= 999) code++;
    return `#${code}`;
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', phone: '', shift_type: 'fixo', fixed_shift: '', start_time: '', end_time: '' });
    setShowModal(true);
  };

  const openEdit = (w: Weaver) => {
    setEditing(w);
    setForm({ name: w.name, phone: w.phone || '', shift_type: w.shift_type, fixed_shift: w.fixed_shift || '', start_time: w.start_time || '', end_time: w.end_time || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Nome é obrigatório'); return; }
    const all = [...weavers];
    if (editing) {
      const idx = all.findIndex(w => w.id === editing.id);
      all[idx] = { ...all[idx], name: form.name, phone: form.phone || undefined, shift_type: form.shift_type, fixed_shift: form.shift_type === 'fixo' ? (form.fixed_shift as ShiftType) : undefined, start_time: form.shift_type === 'especifico' ? form.start_time : undefined, end_time: form.shift_type === 'especifico' ? form.end_time : undefined };
      await saveWeavers(all); toast.success('Tecelão atualizado');
      logAction('weaver_update', { name: form.name, code: editing.code, shift_type: form.shift_type });
    } else {
      const newCode = generateCode();
      all.push({
        id: crypto.randomUUID(), company_id: '', code: newCode, name: form.name, phone: form.phone || undefined,
        shift_type: form.shift_type, fixed_shift: form.shift_type === 'fixo' ? (form.fixed_shift as ShiftType) : undefined,
        start_time: form.shift_type === 'especifico' ? form.start_time : undefined,
        end_time: form.shift_type === 'especifico' ? form.end_time : undefined,
        created_at: new Date().toISOString(),
      });
      await saveWeavers(all); toast.success('Tecelão cadastrado');
      logAction('weaver_create', { name: form.name, code: newCode, shift_type: form.shift_type });
    }
    setShowModal(false);
  };

  const handleDelete = async () => {
    const deleted = showDelete!;
    await saveWeavers(weavers.filter(w => w.id !== deleted.id));
    logAction('weaver_delete', { name: deleted.name, code: deleted.code });
    setShowDelete(null); toast.success('Tecelão excluído');
  };

  const renderWeaverCard = (w: Weaver) => (
    <div key={w.id} className="rounded-lg border border-border bg-background p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display font-bold text-foreground">{w.name}</p>
            <Badge variant="outline" className="font-mono text-xs font-bold text-primary">{w.code}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{w.phone || 'Sem telefone'}</p>
          <Badge variant="secondary" className="text-xs mt-1">
            {w.shift_type === 'fixo' ? 'Turno Fixo' : `${w.start_time} - ${w.end_time}`}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setShowDelete(w)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderShiftSection = (title: string, subtitle: string, weaverList: Weaver[], emptyMsg: string) => (
    <div className="card-glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-display font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle} - {weaverList.length} tecelões</p>
        </div>
      </div>
      {weaverList.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {weaverList.map(renderWeaverCard)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40 mb-2" />
          <p className="text-muted-foreground">{emptyMsg}</p>
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Carregando...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Tecelões</h1>
          <p className="text-muted-foreground text-sm">Gerencie os tecelões e seus turnos de trabalho</p>
        </div>
      </div>

      <Tabs defaultValue="weavers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weavers" className="gap-1.5">
            <Users className="h-4 w-4" /> Tecelões
          </TabsTrigger>
          <TabsTrigger value="defects" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Falhas
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileBarChart className="h-4 w-4" /> Relatórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weavers" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={openNew} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Novo Tecelão</Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-3xl font-display font-bold text-foreground">{counts.total}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Carga Horária</span>
                <Clock className="h-5 w-5 text-success" />
              </div>
              <span className="text-3xl font-display font-bold text-success">{counts.especifico}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Manhã</span>
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <span className="text-3xl font-display font-bold text-warning">{counts.manha.length}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tarde</span>
                <Clock className="h-5 w-5 text-info" />
              </div>
              <span className="text-3xl font-display font-bold text-info">{counts.tarde.length}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Noite</span>
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <span className="text-3xl font-display font-bold text-primary">{counts.noite.length}</span>
            </div>
          </div>

          {/* Shift Sections */}
          {renderShiftSection('Turno Manhã', SHIFT_TIME_LABELS.manha, counts.manha, 'Nenhum tecelão neste turno')}
          {renderShiftSection('Turno Tarde', SHIFT_TIME_LABELS.tarde, counts.tarde, 'Nenhum tecelão neste turno')}
          {renderShiftSection('Turno Noite', SHIFT_TIME_LABELS.noite, counts.noite, 'Nenhum tecelão neste turno')}
          {renderShiftSection('Carga Horária Específica', 'Tecelões com horários personalizados', weavers.filter(w => w.shift_type === 'especifico'), 'Nenhum tecelão com carga horária específica')}
        </TabsContent>

        <TabsContent value="defects">
          <WeaverDefectsTab weavers={weavers} defectRecords={defectRecords} articles={articles} machines={machines} />
        </TabsContent>

        <TabsContent value="reports">
          <WeaverReportsTab weavers={weavers} productions={productions} />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{editing ? 'Editar Tecelão' : 'Novo Tecelão'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Tipo de Turno</Label>
              <Select value={form.shift_type} onValueChange={v => setForm(p => ({ ...p, shift_type: v as 'fixo' | 'especifico' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo">Fixo</SelectItem>
                  <SelectItem value="especifico">Carga Horária Específica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.shift_type === 'fixo' && (
              <div className="space-y-2">
                <Label>Turno</Label>
                <Select value={form.fixed_shift} onValueChange={v => setForm(p => ({ ...p, fixed_shift: v as ShiftType }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                  <SelectContent>{Object.entries(SHIFT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.shift_type === 'especifico' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Hora Início</Label><Input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Hora Fim</Label><Input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="btn-gradient">{editing ? 'Salvar' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir {showDelete?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este tecelão? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Weaver Reports Tab ──────────────────────────────────────
function WeaverReportsTab({ weavers, productions }: { weavers: Weaver[]; productions: Production[] }) {
  const { canSeeFinancial } = usePermissions();
  const [selectedWeaverId, setSelectedWeaverId] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const selectedWeaver = weavers.find(w => w.id === selectedWeaverId);

  const filtered = useMemo(() => {
    if (!selectedWeaverId) return [];
    let result = productions.filter(p => p.weaver_id === selectedWeaverId);
    if (startDate) {
      const start = format(startDate, 'yyyy-MM-dd');
      result = result.filter(p => p.date >= start);
    }
    if (endDate) {
      const end = format(endDate, 'yyyy-MM-dd');
      result = result.filter(p => p.date <= end);
    }
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [productions, selectedWeaverId, startDate, endDate]);

  const totals = useMemo(() => ({
    days: new Set(filtered.map(p => p.date)).size,
    rolls: filtered.reduce((s, p) => s + p.rolls_produced, 0),
    weight: filtered.reduce((s, p) => s + p.weight_kg, 0),
    revenue: filtered.reduce((s, p) => s + p.revenue, 0),
    avgEfficiency: (() => { const nz = filtered.filter(p => p.rolls_produced > 0); return nz.length > 0 ? nz.reduce((s, p) => s + p.efficiency, 0) / nz.length : 0; })(),
  }), [filtered]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><FileBarChart className="h-5 w-5" /> Relatório por Tecelão</CardTitle>
        <CardDescription>Selecione um tecelão e filtre por período</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tecelão</Label>
            <Select value={selectedWeaverId} onValueChange={setSelectedWeaverId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione um tecelão" />
              </SelectTrigger>
              <SelectContent>
                {weavers.map(w => {
                  const shiftLabel = w.shift_type === 'fixo'
                    ? w.fixed_shift === 'manha' ? '1º Turno' : w.fixed_shift === 'tarde' ? '2º Turno' : w.fixed_shift === 'noite' ? '3º Turno' : ''
                    : 'Horário Específico';
                  return (
                    <SelectItem key={w.id} value={w.id}>{w.code} — {w.name} - {shiftLabel}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Período</Label>
              <div className="flex items-center gap-2">
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                      {startDate ? format(startDate, 'dd/MM/yy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); }} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">até</span>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                      {endDate ? format(endDate, 'dd/MM/yy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setStartDate(undefined); setEndDate(undefined); }}>
                ✕ Limpar datas
              </Button>
            )}
          </div>
        </div>

        {!selectedWeaverId ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground">Selecione um tecelão para ver o relatório</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum registro de produção encontrado para este tecelão no período selecionado.</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Dias</p>
                <p className="text-lg font-bold text-foreground">{totals.days}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peças</p>
                <p className="text-lg font-bold text-foreground">{formatNumber(totals.rolls, 1)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peso</p>
                <p className="text-lg font-bold text-foreground">{formatWeight(totals.weight)}</p>
              </div>
              {canSeeFinancial && (
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Faturamento</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totals.revenue)}</p>
              </div>
              )}
              <div className={cn("rounded-lg border p-3", totals.avgEfficiency >= 80 ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-warning/30 bg-warning/5")}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Eficiência Média</p>
                <p className={cn("text-lg font-bold", totals.avgEfficiency >= 80 ? "text-success" : "text-warning")}>{totals.avgEfficiency.toFixed(2)}%</p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Artigo</TableHead>
                    <TableHead className="text-right">Peças</TableHead>
                    <TableHead className="text-right">Peso (kg)</TableHead>
                    {canSeeFinancial && <TableHead className="text-right">Faturamento</TableHead>}
                    <TableHead className="text-right">Eficiência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{p.date}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {p.shift === 'manha' ? 'Manhã' : p.shift === 'tarde' ? 'Tarde' : 'Noite'}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.machine_name || '—'}</TableCell>
                      <TableCell>{p.article_name || '—'}</TableCell>
                      <TableCell className="text-right font-medium">{formatNumber(p.rolls_produced, 1)}</TableCell>
                      <TableCell className="text-right">{formatWeight(p.weight_kg)}</TableCell>
                      {canSeeFinancial && <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>}
                      <TableCell className="text-right">
                        <Badge variant={p.efficiency >= 80 ? 'default' : 'destructive'} className={p.efficiency >= 80 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                          {p.efficiency.toFixed(2)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Weaver Defects Tab ──────────────────────────────────────
function WeaverDefectsTab({ weavers, defectRecords, articles, machines }: { weavers: Weaver[]; defectRecords: DefectRecord[]; articles: Article[]; machines: any[] }) {
  const { user } = useAuth();
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [selectedWeaverId, setSelectedWeaverId] = useState<string | null>(null);

  // Available months from defect records
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(currentMonth);
    defectRecords.forEach(d => months.add(d.date.substring(0, 7)));
    return Array.from(months).sort().reverse();
  }, [defectRecords, currentMonth]);

  // Filtered records by month
  const filtered = useMemo(() => {
    if (filterMonth === 'all') return defectRecords;
    return defectRecords.filter(d => d.date.startsWith(filterMonth));
  }, [defectRecords, filterMonth]);

  // Global KPIs
  const kpis = useMemo(() => ({
    count: filtered.length,
    totalKg: filtered.filter(d => d.measure_type === 'kg').reduce((s, d) => s + d.measure_value, 0),
    totalMetros: filtered.filter(d => d.measure_type === 'metro').reduce((s, d) => s + d.measure_value, 0),
    weaverCount: new Set(filtered.map(d => d.weaver_id)).size,
  }), [filtered]);

  // Ranking per weaver
  const weaverRanking = useMemo(() => {
    const map: Record<string, { name: string; code: string; count: number; kg: number; metros: number }> = {};
    filtered.forEach(d => {
      if (!d.weaver_id) return;
      if (!map[d.weaver_id]) map[d.weaver_id] = { name: d.weaver_name || '', code: '', count: 0, kg: 0, metros: 0 };
      map[d.weaver_id].count++;
      if (d.measure_type === 'kg') map[d.weaver_id].kg += d.measure_value;
      else map[d.weaver_id].metros += d.measure_value;
    });
    weavers.forEach(w => { if (map[w.id]) { map[w.id].code = w.code; map[w.id].name = w.name; } });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [filtered, weavers]);

  const getBadgeColor = (count: number) => {
    if (count >= 8) return 'bg-destructive/10 text-destructive border-destructive/20';
    if (count >= 4) return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-success/10 text-success border-success/20';
  };

  // Detail data for selected weaver
  const selectedWeaver = weavers.find(w => w.id === selectedWeaverId);
  const weaverDefects = useMemo(() => {
    if (!selectedWeaverId) return [];
    return filtered.filter(d => d.weaver_id === selectedWeaverId).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered, selectedWeaverId]);

  const weaverKpis = useMemo(() => ({
    count: weaverDefects.length,
    kg: weaverDefects.filter(d => d.measure_type === 'kg').reduce((s, d) => s + d.measure_value, 0),
    metros: weaverDefects.filter(d => d.measure_type === 'metro').reduce((s, d) => s + d.measure_value, 0),
  }), [weaverDefects]);

  // Groupings for modal
  const byArticle = useMemo(() => {
    const map: Record<string, { name: string; count: number; kg: number; metros: number }> = {};
    weaverDefects.forEach(d => {
      const key = d.article_id || 'unknown';
      const art = articles.find(a => a.id === d.article_id);
      const label = art ? (art.client_name ? `${art.name} (${art.client_name})` : art.name) : (d.article_name || 'Sem artigo');
      if (!map[key]) map[key] = { name: label, count: 0, kg: 0, metros: 0 };
      map[key].count++;
      if (d.measure_type === 'kg') map[key].kg += d.measure_value;
      else map[key].metros += d.measure_value;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [weaverDefects, articles]);

  const byMachine = useMemo(() => {
    const map: Record<string, { name: string; count: number; kg: number; metros: number }> = {};
    weaverDefects.forEach(d => {
      const key = d.machine_id || 'unknown';
      if (!map[key]) map[key] = { name: d.machine_name || 'Sem máquina', count: 0, kg: 0, metros: 0 };
      map[key].count++;
      if (d.measure_type === 'kg') map[key].kg += d.measure_value;
      else map[key].metros += d.measure_value;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [weaverDefects]);

  const byDefect = useMemo(() => {
    const map: Record<string, { name: string; count: number; kg: number; metros: number }> = {};
    weaverDefects.forEach(d => {
      const match = d.observations?.match(/^\[(.+?)\]/);
      const defectName = match ? match[1] : (d.observations?.split(' ')[0] || 'Sem defeito');
      if (!map[defectName]) map[defectName] = { name: defectName, count: 0, kg: 0, metros: 0 };
      map[defectName].count++;
      if (d.measure_type === 'kg') map[defectName].kg += d.measure_value;
      else map[defectName].metros += d.measure_value;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [weaverDefects]);

  // Export general PDF
  const handleExportPdf = async () => {
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    let y = 15;
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(sanitizePdfText('Relatorio de Falhas por Tecelao'), pageW / 2, 12, { align: 'center' });
    doc.setFontSize(10);
    const periodLabel = filterMonth === 'all' ? 'Todo periodo' : format(new Date(filterMonth + '-01'), 'MMMM yyyy', { locale: ptBR });
    doc.text(sanitizePdfText(`Periodo: ${periodLabel}`), pageW / 2, 20, { align: 'center' });
    y = 36;

    // KPIs
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`Total de Falhas: ${kpis.count}  |  Kg: ${formatNumber(kpis.totalKg)}  |  Metros: ${formatNumber(kpis.totalMetros)}  |  Teceloes: ${kpis.weaverCount}`, 14, y);
    y += 10;

    // Ranking table
    doc.setFontSize(12);
    doc.text('Ranking de Falhas', 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Tecelao', 14, y);
    doc.text('Falhas', 100, y);
    doc.text('Kg', 125, y);
    doc.text('Metros', 155, y);
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, pageW - 14, y);
    y += 4;
    doc.setTextColor(0, 0, 0);

    weaverRanking.forEach(([, s]) => {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.text(sanitizePdfText(`${s.code} - ${s.name}`), 14, y);
      doc.text(String(s.count), 100, y);
      doc.text(formatNumber(s.kg), 125, y);
      doc.text(formatNumber(s.metros), 155, y);
      y += 5;
    });

    doc.save(`falhas_teceloes_${filterMonth === 'all' ? 'total' : filterMonth}.pdf`);
    toast.success('PDF exportado com sucesso');
  };

  // Export individual PDF
  const handleExportIndividualPdf = async () => {
    if (!selectedWeaver) return;
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    let y = 15;
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(sanitizePdfText(`Falhas - ${selectedWeaver.name} ${selectedWeaver.code}`), pageW / 2, 12, { align: 'center' });
    doc.setFontSize(10);
    const periodLabel = filterMonth === 'all' ? 'Todo periodo' : format(new Date(filterMonth + '-01'), 'MMMM yyyy', { locale: ptBR });
    doc.text(sanitizePdfText(`Periodo: ${periodLabel}`), pageW / 2, 20, { align: 'center' });
    y = 36;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`Falhas: ${weaverKpis.count}  |  Kg: ${formatNumber(weaverKpis.kg)}  |  Metros: ${formatNumber(weaverKpis.metros)}`, 14, y);
    y += 10;

    // By Article
    if (byArticle.length > 0) {
      doc.setFontSize(12);
      doc.text('Por Artigo', 14, y);
      y += 6;
      doc.setFontSize(9);
      byArticle.forEach(a => {
        if (y > 270) { doc.addPage(); y = 15; }
        doc.text(sanitizePdfText(`${a.name}: ${a.count} falha(s), ${formatNumber(a.kg)} kg, ${formatNumber(a.metros)} m`), 18, y);
        y += 5;
      });
      y += 4;
    }

    // By Machine
    if (byMachine.length > 0) {
      doc.setFontSize(12);
      doc.text('Por Maquina', 14, y);
      y += 6;
      doc.setFontSize(9);
      byMachine.forEach(m => {
        if (y > 270) { doc.addPage(); y = 15; }
        doc.text(sanitizePdfText(`${m.name}: ${m.count} falha(s), ${formatNumber(m.kg)} kg, ${formatNumber(m.metros)} m`), 18, y);
        y += 5;
      });
      y += 4;
    }

    // Detail table
    doc.setFontSize(12);
    if (y > 250) { doc.addPage(); y = 15; }
    doc.text('Detalhamento', 14, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Data', 14, y);
    doc.text('Turno', 40, y);
    doc.text('Maquina', 60, y);
    doc.text('Artigo', 95, y);
    doc.text('Medida', 145, y);
    doc.text('Obs', 170, y);
    y += 3;
    doc.line(14, y, pageW - 14, y);
    y += 4;
    doc.setTextColor(0, 0, 0);

    weaverDefects.forEach(d => {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(format(new Date(d.date + 'T12:00:00'), 'dd/MM/yy'), 14, y);
      doc.text(d.shift === 'manha' ? 'Manha' : d.shift === 'tarde' ? 'Tarde' : 'Noite', 40, y);
      doc.text(sanitizePdfText(d.machine_name || '-').substring(0, 18), 60, y);
      doc.text(sanitizePdfText(d.article_name || '-').substring(0, 25), 95, y);
      doc.text(`${formatNumber(d.measure_value)} ${d.measure_type === 'kg' ? 'kg' : 'm'}`, 145, y);
      doc.text(sanitizePdfText((d.observations || '-')).substring(0, 15), 170, y);
      y += 5;
    });

    doc.save(sanitizePdfText(`falhas_${selectedWeaver.name}_${filterMonth === 'all' ? 'total' : filterMonth}.pdf`));
    toast.success('PDF individual exportado');
  };

  const renderGroupSection = (title: string, data: { name: string; count: number; kg: number; metros: number }[]) => {
    if (data.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        <div className="space-y-1">
          {data.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-md bg-muted/30">
              <span className="font-medium truncate max-w-[200px]">{item.name}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span>{item.count} falha{item.count !== 1 ? 's' : ''}</span>
                {item.kg > 0 && <span>{formatNumber(item.kg)} kg</span>}
                {item.metros > 0 && <span>{formatNumber(item.metros)} m</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Falhas por Tecelão</CardTitle>
              <CardDescription>Análise de defeitos registrados na Revisão</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="h-9 text-sm w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo período</SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m}>
                      {format(new Date(m + '-01'), 'MMMM yyyy', { locale: ptBR })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {weaverRanking.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-glass p-4 flex flex-col justify-between min-h-[80px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Falhas</span>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <span className="text-2xl font-display font-bold text-destructive">{kpis.count}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[80px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Kg</span>
                <Scale className="h-4 w-4 text-warning" />
              </div>
              <span className="text-2xl font-display font-bold text-foreground">{formatNumber(kpis.totalKg)}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[80px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Metros</span>
                <Ruler className="h-4 w-4 text-info" />
              </div>
              <span className="text-2xl font-display font-bold text-foreground">{formatNumber(kpis.totalMetros)}</span>
            </div>
            <div className="card-glass p-4 flex flex-col justify-between min-h-[80px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Tecelões</span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-2xl font-display font-bold text-foreground">{kpis.weaverCount}</span>
            </div>
          </div>

          {/* Ranking */}
          {weaverRanking.length > 0 ? (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ranking de Falhas — clique para ver detalhes</p>
              <div className="space-y-1">
                {weaverRanking.map(([id, s], i) => (
                  <div
                    key={id}
                    className="flex items-center justify-between text-sm py-2 px-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedWeaverId(id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                      <span className="font-medium">{s.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px] font-bold text-primary">{s.code}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn('text-[10px] font-bold', getBadgeColor(s.count))}>
                        {s.count} falha{s.count !== 1 ? 's' : ''}
                      </Badge>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {s.kg > 0 && <span>{formatNumber(s.kg)} kg</span>}
                        {s.metros > 0 && <span>{formatNumber(s.metros)} m</span>}
                      </div>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-muted-foreground">Nenhuma falha registrada no período selecionado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedWeaverId} onOpenChange={(open) => { if (!open) setSelectedWeaverId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Falhas — {selectedWeaver?.name} <Badge variant="outline" className="font-mono text-xs">{selectedWeaver?.code}</Badge>
            </DialogTitle>
            <DialogDescription>
              {filterMonth === 'all' ? 'Todo período' : format(new Date(filterMonth + '-01'), 'MMMM yyyy', { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>

          {weaverDefects.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma falha registrada para este tecelão no período.</p>
          ) : (
            <div className="space-y-5">
              {/* Individual KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Falhas</p>
                  <p className="text-lg font-bold text-destructive">{weaverKpis.count}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Kg</p>
                  <p className="text-lg font-bold text-foreground">{formatNumber(weaverKpis.kg)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Metros</p>
                  <p className="text-lg font-bold text-foreground">{formatNumber(weaverKpis.metros)}</p>
                </div>
              </div>

              {/* Groupings */}
              {renderGroupSection('Por Artigo', byArticle)}
              {renderGroupSection('Por Máquina', byMachine)}
              {renderGroupSection('Por Defeito', byDefect)}

              {/* Detail table */}
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Máquina</TableHead>
                      <TableHead>Artigo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Obs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weaverDefects.map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{d.shift === 'manha' ? 'Manhã' : d.shift === 'tarde' ? 'Tarde' : 'Noite'}</Badge></TableCell>
                        <TableCell>{d.machine_name || '—'}</TableCell>
                        <TableCell>{d.article_name || '—'}</TableCell>
                        <TableCell><Badge variant="outline">{d.measure_type === 'kg' ? 'Kg' : 'Metro'}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(d.measure_value)} {d.measure_type === 'kg' ? 'kg' : 'm'}</TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">{d.observations || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {weaverDefects.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportIndividualPdf}>
                <Download className="h-3.5 w-3.5" /> Exportar PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedWeaverId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
