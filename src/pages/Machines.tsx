import { useState } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, FileBarChart, Loader2, Monitor, CheckCircle2, XCircle, Wrench, Settings, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Machine, MachineStatus, MachineLog } from '@/types';
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS } from '@/types';
import { cn } from '@/lib/utils';

const ALL_STATUSES: MachineStatus[] = ['ativa', 'manutencao_preventiva', 'manutencao_corretiva', 'troca_artigo', 'inativa'];

const STATUS_ICONS: Record<MachineStatus | 'total', React.ReactNode> = {
  total: <Monitor className="h-6 w-6 text-muted-foreground" />,
  ativa: <CheckCircle2 className="h-6 w-6 text-emerald-500" />,
  inativa: <AlertCircle className="h-6 w-6 text-destructive" />,
  manutencao_preventiva: <Wrench className="h-6 w-6 text-orange-400" />,
  manutencao_corretiva: <Wrench className="h-6 w-6 text-rose-400" />,
  troca_artigo: <Settings className="h-6 w-6 text-blue-400" />,
};

const STATUS_CARD_LABELS: Record<string, string> = {
  total: 'Total',
  ativa: 'Ativas',
  inativa: 'Inativas',
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  troca_artigo: 'Troca de Artigo',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'ativa', label: 'Ativas' },
  { value: 'inativa', label: 'Inativas' },
  { value: 'manutencao_preventiva', label: 'Manutenção Preventiva' },
  { value: 'manutencao_corretiva', label: 'Manutenção Corretiva' },
  { value: 'troca_artigo', label: 'Troca de Artigo' },
];

export default function Machines() {
  const { getMachines, saveMachines, getMachineLogs, saveMachineLogs, getArticles, loading } = useCompanyData();
  const machines = getMachines();
  const logs = getMachineLogs();
  const articles = getArticles();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [showDelete, setShowDelete] = useState<Machine | null>(null);
  const [deleteWord, setDeleteWord] = useState('');
  const [showReport, setShowReport] = useState<Machine | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ number: '', rpm: '', status: 'ativa' as MachineStatus, article_id: '', observations: '' });

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

  const handleSave = async () => {
    if (!form.number || !form.rpm) { toast.error('Preencha os campos obrigatórios'); return; }
    const all = [...machines];

    if (editing) {
      const idx = all.findIndex(m => m.id === editing.id);
      const oldStatus = all[idx].status;
      all[idx] = { ...all[idx], number: Number(form.number), name: `TEAR ${form.number}`, rpm: Number(form.rpm), status: form.status, article_id: form.article_id || undefined, observations: form.observations || undefined };

      if (oldStatus !== form.status) {
        const allLogs = [...logs];
        const openLog = allLogs.find(l => l.machine_id === editing.id && !l.ended_at);
        if (openLog) openLog.ended_at = new Date().toISOString();
        allLogs.push({ id: crypto.randomUUID(), machine_id: editing.id, status: form.status, started_at: new Date().toISOString() });
        await saveMachineLogs(allLogs);
      }

      await saveMachines(all);
      toast.success('Máquina atualizada');
    } else {
      const newMachine: Machine = {
        id: crypto.randomUUID(), company_id: '', number: Number(form.number), name: `TEAR ${form.number}`,
        rpm: Number(form.rpm), status: form.status, article_id: form.article_id || undefined,
        observations: form.observations || undefined, created_at: new Date().toISOString(),
      };
      all.push(newMachine);
      await saveMachines(all);

      const allLogs = [...logs];
      allLogs.push({ id: crypto.randomUUID(), machine_id: newMachine.id, status: form.status, started_at: new Date().toISOString() });
      await saveMachineLogs(allLogs);
      toast.success('Máquina cadastrada');
    }
    setShowModal(false);
  };

  const handleDelete = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    const all = machines.filter(m => m.id !== showDelete?.id);
    await saveMachines(all);
    setShowDelete(null);
    setDeleteWord('');
    toast.success('Máquina excluída');
  };

  const statusCounts = ALL_STATUSES.reduce((acc, s) => ({ ...acc, [s]: machines.filter(m => m.status === s).length }), {} as Record<string, number>);

  const filtered = machines
    .filter(m => statusFilter === 'all' || m.status === statusFilter)
    .filter(m => !searchTerm || m.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(m.number).includes(searchTerm));

  const machineReportLogs = showReport ? logs.filter(l => l.machine_id === showReport.id).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) : [];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Carregando...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Máquinas</h1>
          <p className="text-muted-foreground text-sm">Gerencie as máquinas da sua malharia</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar máquina..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 w-52"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {FILTER_OPTIONS.map(f => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
                className="text-xs"
              >
                {f.label}
              </Button>
            ))}
          </div>

          <Button onClick={openNew} className="btn-gradient">
            <Plus className="h-4 w-4 mr-1" /> Nova Máquina
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total */}
        <div className="card-glass p-4 flex flex-col justify-between min-h-[100px]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">Total</span>
            {STATUS_ICONS.total}
          </div>
          <span className="text-3xl font-display font-bold text-foreground">{machines.length}</span>
        </div>

        {ALL_STATUSES.map(s => (
          <div
            key={s}
            className={cn(
              "card-glass p-4 flex flex-col justify-between min-h-[100px] cursor-pointer transition-all hover:shadow-md",
              statusFilter === s && "ring-2 ring-primary"
            )}
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium leading-tight">{STATUS_CARD_LABELS[s]}</span>
              {STATUS_ICONS[s]}
            </div>
            <span className={cn(
              "text-3xl font-display font-bold",
              s === 'ativa' ? 'text-emerald-500' : s === 'inativa' ? 'text-destructive' : 'text-orange-500'
            )}>
              {statusCounts[s] || 0}
            </span>
          </div>
        ))}
      </div>

      {/* Machine Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(m => (
          <div key={m.id} className="card-glass p-5 flex flex-col gap-4">
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {STATUS_ICONS[m.status]}
                <span className="font-display font-bold text-foreground text-lg">{m.name}</span>
              </div>
              <Badge className={cn("text-xs", MACHINE_STATUS_COLORS[m.status])}>{MACHINE_STATUS_LABELS[m.status]}</Badge>
            </div>

            {/* Card Info */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">RPM:</span>
                <span className="font-semibold text-foreground">{m.rpm}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cadastrada:</span>
                <span className="font-semibold text-foreground">{format(new Date(m.created_at), 'dd/MM/yyyy')}</span>
              </div>
            </div>

            {/* Card Actions */}
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => openEdit(m)}>
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowReport(m)}>
                <FileBarChart className="h-3 w-3 mr-1" /> Relatórios
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDelete(m); setDeleteWord(''); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">Nenhuma máquina encontrada</div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-display">Informações Básicas</DialogTitle>
            <p className="text-sm text-muted-foreground">Dados principais da máquina</p>
          </DialogHeader>

          <div className="space-y-5">
            {/* Row: Número + RPM */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Número da Máquina <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-0">
                  <span className="inline-flex items-center justify-center h-10 px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm font-semibold text-foreground">TEAR</span>
                  <Input
                    type="number"
                    value={form.number}
                    onChange={e => setForm(p => ({ ...p, number: e.target.value }))}
                    className="rounded-l-none"
                    placeholder="01"
                  />
                </div>
                {form.number && (
                  <p className="text-xs text-muted-foreground">Nome completo: TEAR {form.number.padStart(2, '0')}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">RPM Padrão <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} placeholder="27" />
              </div>
            </div>

            {/* Row: Status + Artigo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as MachineStatus }))}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "h-2 w-2 rounded-full",
                        form.status === 'ativa' ? 'bg-emerald-500' :
                        form.status === 'inativa' ? 'bg-destructive' : 'bg-orange-400'
                      )} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{MACHINE_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Artigo Atual</Label>
                <Select value={form.article_id} onValueChange={v => setForm(p => ({ ...p, article_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um artigo" /></SelectTrigger>
                  <SelectContent>{articles.map(a => {
                    const client = a.client_name ? ` (${a.client_name})` : '';
                    return <SelectItem key={a.id} value={a.id}>{a.name}{client}</SelectItem>;
                  })}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Selected Article Details */}
            {(() => {
              const selectedArticle = articles.find(a => a.id === form.article_id);
              if (!selectedArticle) return null;
              return (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Artigo Selecionado:</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Cliente:</p>
                      <p className="font-medium text-foreground">{selectedArticle.client_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Peso por rolo:</p>
                      <p className="font-medium text-foreground">{selectedArticle.weight_per_roll} kg</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Valor por kg:</p>
                      <p className="font-medium text-foreground">R$ {selectedArticle.value_per_kg}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Observações */}
            <div className="space-y-2">
              <Label className="font-semibold">Observações</Label>
              <Textarea
                value={form.observations}
                onChange={e => setForm(p => ({ ...p, observations: e.target.value }))}
                placeholder="Observações sobre a máquina..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button onClick={handleSave} className="btn-gradient w-full sm:w-auto">
              {editing ? 'Atualizar Máquina' : 'Cadastrar Máquina'}
            </Button>
            <Button variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto">Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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
