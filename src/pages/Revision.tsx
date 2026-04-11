import { useState, useMemo, useRef, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CalendarIcon, Trash2, Loader2, AlertTriangle, Search, Scale, Ruler, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType, type DefectRecord, type MeasureType, getCompanyShiftLabels } from '@/types';
import { formatNumber } from '@/lib/formatters';

const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];

export default function RevisionPage() {
  const { getMachines, getWeavers, getArticles, getDefectRecords, addDefectRecords, updateDefectRecords, deleteDefectRecords, shiftSettings, loading } = useSharedCompanyData();
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const { logAction, userName, userCode } = useAuditLog();

  const machines = getMachines();
  const weavers = getWeavers();
  const articles = getArticles();
  const defectRecords = getDefectRecords();

  const sortedMachines = useMemo(() => [...machines].sort((a, b) => a.number - b.number), [machines]);

  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DefectRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [showDelete, setShowDelete] = useState<DefectRecord | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

  const [form, setForm] = useState({
    date: new Date(),
    shift: '' as ShiftType | '',
    machine_id: '',
    weaver_id: '',
    article_id: '',
    defect_name: '',
    measure_type: 'kg' as MeasureType,
    measure_value: '',
    observations: '',
  });

  const [articleSearch, setArticleSearch] = useState('');
  const [weaverSearch, setWeaverSearch] = useState('');
  const articleSearchRef = useRef<HTMLInputElement>(null);
  const weaverSearchRef = useRef<HTMLInputElement>(null);

  const getArticleLabel = (a: { name: string; client_name?: string }) =>
    a.client_name ? `${a.name} (${a.client_name})` : a.name;

  const filteredArticlesModal = useMemo(() => {
    if (!articleSearch) return articles;
    const s = articleSearch.toLowerCase();
    return articles.filter(a => a.name.toLowerCase().includes(s) || (a.client_name || '').toLowerCase().includes(s));
  }, [articles, articleSearch]);

  const filteredWeaversModal = useMemo(() => {
    if (!weaverSearch) return weavers;
    const s = weaverSearch.toLowerCase();
    return weavers.filter(w => w.name.toLowerCase().includes(s) || w.code.toLowerCase().includes(s));
  }, [weavers, weaverSearch]);

  // Available months for filter
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    defectRecords.forEach(d => {
      if (d.date) monthSet.add(d.date.substring(0, 7)); // yyyy-MM
    });
    return Array.from(monthSet).sort().reverse();
  }, [defectRecords]);

  const filtered = useMemo(() => {
    let data = defectRecords;
    if (filterDate) data = data.filter(d => d.date === filterDate);
    if (filterMonth && !filterDate) data = data.filter(d => d.date?.startsWith(filterMonth));
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      data = data.filter(d =>
        (d.machine_name || '').toLowerCase().includes(s) ||
        (d.article_name || '').toLowerCase().includes(s) ||
        (d.weaver_name || '').toLowerCase().includes(s)
      );
    }
    return data;
  }, [defectRecords, filterDate, filterMonth, searchTerm]);

  const stats = useMemo(() => {
    const totalKg = filtered.filter(d => d.measure_type === 'kg').reduce((s, d) => s + d.measure_value, 0);
    const totalMetros = filtered.filter(d => d.measure_type === 'metro').reduce((s, d) => s + d.measure_value, 0);
    return { total: filtered.length, totalKg, totalMetros };
  }, [filtered]);

  const openNew = () => {
    setEditingRecord(null);
    setForm({ date: new Date(), shift: '', machine_id: '', weaver_id: '', article_id: '', defect_name: '', measure_type: 'kg', measure_value: '', observations: '' });
    setArticleSearch('');
    setWeaverSearch('');
    setShowModal(true);
  };

  const openEdit = (record: DefectRecord) => {
    setEditingRecord(record);
    // Parse defect_name and observations from stored observations field
    let defectName = '';
    let obs = '';
    if (record.observations) {
      const match = record.observations.match(/^\[(.+?)\]\s*(.*)/);
      if (match) {
        defectName = match[1];
        obs = match[2];
      } else {
        defectName = record.observations;
      }
    }
    setForm({
      date: new Date(record.date + 'T12:00:00'),
      shift: record.shift as ShiftType,
      machine_id: record.machine_id,
      weaver_id: record.weaver_id,
      article_id: record.article_id,
      defect_name: defectName,
      measure_type: record.measure_type,
      measure_value: String(record.measure_value),
      observations: obs,
    });
    setArticleSearch('');
    setWeaverSearch('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.shift || !form.machine_id || !form.article_id || !form.weaver_id || !form.measure_value || !form.defect_name) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const machine = machines.find(m => m.id === form.machine_id);
      const article = articles.find(a => a.id === form.article_id);
      const weaver = weavers.find(w => w.id === form.weaver_id);
      const obsText = form.observations ? `[${form.defect_name}] ${form.observations}` : form.defect_name;

      if (editingRecord) {
        const updated: DefectRecord = {
          ...editingRecord,
          machine_id: form.machine_id,
          article_id: form.article_id,
          weaver_id: form.weaver_id,
          date: format(form.date, 'yyyy-MM-dd'),
          shift: form.shift as ShiftType,
          measure_type: form.measure_type,
          measure_value: parseFloat(form.measure_value),
          machine_name: machine?.name,
          article_name: article?.name,
          weaver_name: weaver?.name,
          observations: obsText,
        };
        await updateDefectRecords(updated);
        logAction('defect_update', { machine: machine?.name, article: article?.name, date: form.date, shift: form.shift });
        toast.success('Falha atualizada com sucesso!');
      } else {
        const record: DefectRecord = {
          id: crypto.randomUUID(),
          company_id: '',
          machine_id: form.machine_id,
          article_id: form.article_id,
          weaver_id: form.weaver_id,
          date: format(form.date, 'yyyy-MM-dd'),
          shift: form.shift as ShiftType,
          measure_type: form.measure_type,
          measure_value: parseFloat(form.measure_value),
          machine_name: machine?.name,
          article_name: article?.name,
          weaver_name: weaver?.name,
          observations: obsText,
          created_by_name: userName || undefined,
          created_by_code: userCode || undefined,
          created_at: new Date().toISOString(),
        };
        await addDefectRecords([record]);
        logAction('defect_create', { machine: machine?.name, article: article?.name, date: form.date, shift: form.shift });
        toast.success('Falha registrada com sucesso!');
      }
      setShowModal(false);
    } catch (e) {
      toast.error(editingRecord ? 'Erro ao atualizar falha' : 'Erro ao registrar falha');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDelete || deleteWord !== 'EXCLUIR') return;
    try {
      await deleteDefectRecords([showDelete.id]);
      logAction('defect_delete', { machine: showDelete.machine_name, date: showDelete.date });
      toast.success('Registro excluído');
      setShowDelete(null);
      setDeleteWord('');
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
    return format(date, 'MMM/yyyy', { locale: ptBR });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revisão</h1>
          <p className="text-sm text-muted-foreground">Registre falhas de produção por tecelão</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Registrar Falha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total de Falhas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total em Kg</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Scale className="h-5 w-5 text-warning" />{formatNumber(stats.totalKg)} kg</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total em Metros</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Ruler className="h-5 w-5 text-info" />{formatNumber(stats.totalMetros)} m</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 justify-start min-w-[180px]">
              <CalendarIcon className="h-4 w-4" />
              {filterDate ? format(new Date(filterDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Todas as datas'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filterDate ? new Date(filterDate + 'T12:00:00') : undefined}
              onSelect={d => { setFilterDate(d ? format(d, 'yyyy-MM-dd') : ''); if (d) setFilterMonth(''); }}
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Select value={filterMonth} onValueChange={v => { setFilterMonth(v === 'all' ? '' : v); if (v !== 'all') setFilterDate(''); }}>
          <SelectTrigger className="min-w-[150px] w-auto">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {availableMonths.map(m => (
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por máquina, artigo ou tecelão..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        {(filterDate || filterMonth) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterDate(''); setFilterMonth(''); }}>Limpar filtros</Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead>Artigo</TableHead>
              <TableHead>Tecelão</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Obs</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Nenhuma falha registrada{filterDate ? ' nesta data' : filterMonth ? ' neste mês' : ''}
                </TableCell>
              </TableRow>
            ) : filtered.map(d => (
              <TableRow key={d.id}>
                <TableCell>{format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                <TableCell><Badge variant="outline">{companyShiftLabels[d.shift] || d.shift}</Badge></TableCell>
                <TableCell className="font-medium">{d.machine_name}</TableCell>
                <TableCell>{d.article_name}</TableCell>
                <TableCell>{d.weaver_name}</TableCell>
                <TableCell><Badge variant={d.measure_type === 'kg' ? 'secondary' : 'outline'}>{d.measure_type === 'kg' ? 'Kg' : 'Metro'}</Badge></TableCell>
                <TableCell className="text-right font-mono">{formatNumber(d.measure_value)} {d.measure_type === 'kg' ? 'kg' : 'm'}</TableCell>
                <TableCell className="max-w-[120px] truncate text-muted-foreground text-xs">{d.observations || '—'}</TableCell>
                <TableCell className="text-xs text-primary font-medium whitespace-nowrap">
                  {d.created_by_name ? `${d.created_by_name}${d.created_by_code ? ` #${d.created_by_code}` : ''}` : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(d)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setShowDelete(d); setDeleteWord(''); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Register/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto" onEscapeKeyDown={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {editingRecord ? 'Editar Falha' : 'Registrar Falha'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Row 1: Date + Shift */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {format(form.date, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.date} onSelect={d => d && setForm(f => ({ ...f, date: d }))} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Turno *</Label>
                <Select value={form.shift} onValueChange={v => setForm(f => ({ ...f, shift: v as ShiftType }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map(s => <SelectItem key={s} value={s}>{companyShiftLabels[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Machine + Article */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Máquina *</Label>
                <Select value={form.machine_id} onValueChange={v => setForm(f => ({ ...f, machine_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
                    {sortedMachines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Artigo *</Label>
                <Select value={form.article_id} onValueChange={v => { setForm(f => ({ ...f, article_id: v })); setArticleSearch(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o artigo" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
                    <div className="px-2 pb-2">
                      <Input ref={articleSearchRef} placeholder="Buscar artigo..." value={articleSearch} onChange={e => setArticleSearch(e.target.value)} className="h-8" autoFocus />
                    </div>
                    {filteredArticlesModal.map(a => <SelectItem key={a.id} value={a.id}>{getArticleLabel(a)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Weaver + Defect Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tecelão *</Label>
                <Select value={form.weaver_id} onValueChange={v => { setForm(f => ({ ...f, weaver_id: v })); setWeaverSearch(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tecelão" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
                    <div className="px-2 pb-2">
                      <Input ref={weaverSearchRef} placeholder="Buscar tecelão..." value={weaverSearch} onChange={e => setWeaverSearch(e.target.value)} className="h-8" autoFocus />
                    </div>
                    {filteredWeaversModal.map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Falha (Nome) *</Label>
                <Input placeholder="Ex: Furo, Mancha, Barramento..." value={form.defect_name} onChange={e => setForm(f => ({ ...f, defect_name: e.target.value }))} />
              </div>
            </div>

            {/* Row 4: Measure type + value + observations */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Medida *</Label>
                <Select value={form.measure_type} onValueChange={v => setForm(f => ({ ...f, measure_type: v as MeasureType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Quilogramas (kg)</SelectItem>
                    <SelectItem value="metro">Metros (m)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <Input type="number" step="0.01" min="0" placeholder={form.measure_type === 'kg' ? 'Ex: 2.5' : 'Ex: 10'} value={form.measure_value} onChange={e => setForm(f => ({ ...f, measure_value: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Input placeholder="Detalhes adicionais..." value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2 mt-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRecord ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingRecord ? 'Salvar Alterações' : 'Registrar Falha'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!showDelete} onOpenChange={() => { setShowDelete(null); setDeleteWord(''); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Excluir Registro</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <Button variant="destructive" disabled={deleteWord !== 'EXCLUIR'} onClick={handleDelete} className="w-full">Excluir</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
