import { useState } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import type { Weaver, ShiftType } from '@/types';
import { SHIFT_LABELS } from '@/types';

export default function Weavers() {
  const { getWeavers, saveWeavers, loading } = useCompanyData();
  const weavers = getWeavers();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Weaver | null>(null);
  const [showDelete, setShowDelete] = useState<Weaver | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

  const [form, setForm] = useState({
    name: '', phone: '', shift_type: 'fixo' as 'fixo' | 'especifico',
    fixed_shift: '' as ShiftType | '', start_time: '', end_time: '',
  });

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

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Carregando...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Tecelões</h1>
          <p className="text-muted-foreground text-sm">{weavers.length} tecelões cadastrados</p>
        </div>
        <Button onClick={openNew} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Novo Tecelão</Button>
      </div>

      <div className="grid gap-3">
        {weavers.map(w => (
          <div key={w.id} className="card-glass p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono font-bold text-primary">{w.code}</Badge>
              <div>
                <p className="font-display font-semibold text-foreground">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.shift_type === 'fixo' ? (w.fixed_shift ? SHIFT_LABELS[w.fixed_shift] : 'Turno não definido') : `${w.start_time} - ${w.end_time}`}
                  {w.phone && ` · ${w.phone}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(w)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="outline" size="sm" onClick={() => { setShowDelete(w); setDeleteWord(''); }}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
        {weavers.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum tecelão cadastrado</p>}
      </div>

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
