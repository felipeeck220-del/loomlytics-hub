import { useState } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Pencil, Trash2, FileBarChart } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Machine, MachineStatus, MachineLog } from '@/types';
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS } from '@/types';
import { cn } from '@/lib/utils';

const ALL_STATUSES: MachineStatus[] = ['ativa', 'manutencao_preventiva', 'manutencao_corretiva', 'troca_artigo', 'inativa'];

export default function Machines() {
  const { getMachines, saveMachines, getMachineLogs, saveMachineLogs, getArticles } = useCompanyData();
  const [machines, setMachines] = useState<Machine[]>(getMachines());
  const [logs, setLogs] = useState<MachineLog[]>(getMachineLogs());
  const articles = getArticles();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [showDelete, setShowDelete] = useState<Machine | null>(null);
  const [deleteWord, setDeleteWord] = useState('');
  const [showReport, setShowReport] = useState<Machine | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [form, setForm] = useState({ number: '', rpm: '', status: 'ativa' as MachineStatus, article_id: '', observations: '' });

  const refresh = () => { setMachines(getMachines()); setLogs(getMachineLogs()); };

  const openNew = () => {
    setEditing(null);
    setForm({ number: '', rpm: '', status: 'ativa', article_id: '', observations: '' });
    setShowModal(true);
  };

  const openEdit = (m: Machine) => {
    setEditing(m);
    setForm({ number: String(m.number), rpm: String(m.rpm), status: m.status, article_id: m.article_id || '', observations: m.observations || '' });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.number || !form.rpm) { toast.error('Preencha os campos obrigatórios'); return; }
    const all = getMachines();

    if (editing) {
      const oldMachine = all.find(m => m.id === editing.id);
      const idx = all.findIndex(m => m.id === editing.id);
      all[idx] = { ...all[idx], number: Number(form.number), name: `TEAR ${form.number}`, rpm: Number(form.rpm), status: form.status, article_id: form.article_id || undefined, observations: form.observations || undefined };

      if (oldMachine && oldMachine.status !== form.status) {
        const allLogs = getMachineLogs();
        const openLog = allLogs.find(l => l.machine_id === editing.id && !l.ended_at);
        if (openLog) openLog.ended_at = new Date().toISOString();
        allLogs.push({ id: crypto.randomUUID(), machine_id: editing.id, status: form.status, started_at: new Date().toISOString() });
        saveMachineLogs(allLogs);
      }

      saveMachines(all);
      toast.success('Máquina atualizada');
    } else {
      const newMachine: Machine = {
        id: crypto.randomUUID(), company_id: '', number: Number(form.number), name: `TEAR ${form.number}`,
        rpm: Number(form.rpm), status: form.status, article_id: form.article_id || undefined,
        observations: form.observations || undefined, created_at: new Date().toISOString(),
      };
      all.push(newMachine);
      saveMachines(all);

      const allLogs = getMachineLogs();
      allLogs.push({ id: crypto.randomUUID(), machine_id: newMachine.id, status: form.status, started_at: new Date().toISOString() });
      saveMachineLogs(allLogs);
      toast.success('Máquina cadastrada');
    }
    setShowModal(false);
    refresh();
  };

  const handleDelete = () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    const all = getMachines().filter(m => m.id !== showDelete?.id);
    saveMachines(all);
    setShowDelete(null);
    setDeleteWord('');
    toast.success('Máquina excluída');
    refresh();
  };

  const filtered = statusFilter === 'all' ? machines : machines.filter(m => m.status === statusFilter);
  const statusCounts = ALL_STATUSES.reduce((acc, s) => ({ ...acc, [s]: machines.filter(m => m.status === s).length }), {} as Record<string, number>);

  const machineReportLogs = showReport ? logs.filter(l => l.machine_id === showReport.id).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Máquinas</h1>
          <p className="text-muted-foreground text-sm">{machines.length} máquinas cadastradas</p>
        </div>
        <Button onClick={openNew} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Nova Máquina</Button>
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-2">
        <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>
          Todas ({machines.length})
        </Button>
        {ALL_STATUSES.map(s => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
            {MACHINE_STATUS_LABELS[s]} ({statusCounts[s] || 0})
          </Button>
        ))}
      </div>

      {/* Machine list */}
      <div className="grid gap-3">
        {filtered.map(m => (
          <div key={m.id} className="card-glass p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="font-display font-semibold text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">RPM: {m.rpm} · Cadastro: {format(new Date(m.created_at), 'dd/MM/yyyy')}</p>
              </div>
              <Badge className={cn("text-xs", MACHINE_STATUS_COLORS[m.status])}>
                {MACHINE_STATUS_LABELS[m.status]}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(m)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="outline" size="sm" onClick={() => setShowReport(m)}><FileBarChart className="h-3 w-3" /></Button>
              <Button variant="outline" size="sm" onClick={() => { setShowDelete(m); setDeleteWord(''); }}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma máquina encontrada</p>}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar Máquina' : 'Nova Máquina'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número da Máquina</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">TEAR</span>
                <Input type="number" value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>RPM Padrão</Label>
              <Input type="number" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as MachineStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{MACHINE_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Artigo</Label>
              <Select value={form.article_id} onValueChange={v => setForm(p => ({ ...p, article_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione um artigo" /></SelectTrigger>
                <SelectContent>
                  {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.observations} onChange={e => setForm(p => ({ ...p, observations: e.target.value }))} />
            </div>
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
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar a exclusão.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal */}
      <Dialog open={!!showReport} onOpenChange={() => setShowReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Relatório - {showReport?.name}</DialogTitle></DialogHeader>
          <div className="max-h-80 overflow-auto space-y-2">
            {machineReportLogs.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">Nenhum registro encontrado</p>}
            {machineReportLogs.map(l => (
              <div key={l.id} className="flex justify-between items-center text-sm p-2 rounded bg-muted/50">
                <Badge className={cn("text-xs", MACHINE_STATUS_COLORS[l.status])}>{MACHINE_STATUS_LABELS[l.status]}</Badge>
                <div className="text-right text-muted-foreground text-xs">
                  <p>Início: {format(new Date(l.started_at), 'dd/MM/yyyy HH:mm')}</p>
                  {l.ended_at && <p>Fim: {format(new Date(l.ended_at), 'dd/MM/yyyy HH:mm')}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
