import { useState, useMemo } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import type { Weaver, ShiftType } from '@/types';
import { SHIFT_LABELS } from '@/types';

const SHIFT_TIME_LABELS: Record<ShiftType, string> = {
  manha: '05:00 às 13:30',
  tarde: '13:30 às 22:00',
  noite: '22:00 às 05:00',
};

export default function Weavers() {
  const { getWeavers, saveWeavers, loading } = useSharedCompanyData();
  const weavers = getWeavers();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Weaver | null>(null);
  const [showDelete, setShowDelete] = useState<Weaver | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

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
    } else {
      all.push({
        id: crypto.randomUUID(), company_id: '', code: generateCode(), name: form.name, phone: form.phone || undefined,
        shift_type: form.shift_type, fixed_shift: form.shift_type === 'fixo' ? (form.fixed_shift as ShiftType) : undefined,
        start_time: form.shift_type === 'especifico' ? form.start_time : undefined,
        end_time: form.shift_type === 'especifico' ? form.end_time : undefined,
        created_at: new Date().toISOString(),
      });
      await saveWeavers(all); toast.success('Tecelão cadastrado');
    }
    setShowModal(false);
  };

  const handleDelete = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    await saveWeavers(weavers.filter(w => w.id !== showDelete?.id));
    setShowDelete(null); setDeleteWord(''); toast.success('Tecelão excluído');
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
          <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDelete(w); setDeleteWord(''); }}>
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
        <Button onClick={openNew} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Novo Tecelão</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <span className="text-3xl font-display font-bold text-foreground">{counts.total}</span>
        </div>
        <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Turno Fixo</span>
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
          <span className="text-3xl font-display font-bold text-blue-600">{counts.fixo}</span>
        </div>
        <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Carga Horária</span>
            <Clock className="h-5 w-5 text-emerald-500" />
          </div>
          <span className="text-3xl font-display font-bold text-emerald-600">{counts.especifico}</span>
        </div>
        <div className="card-glass p-4 flex flex-col justify-between min-h-[90px]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Manhã</span>
            <Clock className="h-5 w-5 text-yellow-500" />
          </div>
          <span className="text-3xl font-display font-bold text-yellow-600">{counts.manha.length}</span>
        </div>
      </div>

      {/* Shift Sections */}
      {renderShiftSection('Turno Manhã', SHIFT_TIME_LABELS.manha, counts.manha, 'Nenhum tecelão neste turno')}
      {renderShiftSection('Turno Tarde', SHIFT_TIME_LABELS.tarde, counts.tarde, 'Nenhum tecelão neste turno')}
      {renderShiftSection('Turno Noite', SHIFT_TIME_LABELS.noite, counts.noite, 'Nenhum tecelão neste turno')}

      {/* Specific hours section */}
      {renderShiftSection(
        'Carga Horária Específica',
        'Tecelões com horários personalizados',
        weavers.filter(w => w.shift_type === 'especifico'),
        'Nenhum tecelão com carga horária específica'
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
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
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
