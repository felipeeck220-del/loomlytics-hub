import { useState, useMemo } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarIcon, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, type Production } from '@/types';

export default function ProductionPage() {
  const { getProductions, saveProductions, getMachines, getWeavers, getArticles } = useCompanyData();
  const [productions, setProductions] = useState<Production[]>(getProductions());
  const machines = getMachines();
  const weavers = getWeavers();
  const articles = getArticles();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Production | null>(null);
  const [articleSearch, setArticleSearch] = useState('');

  const [form, setForm] = useState({
    date: new Date(), shift: '' as ShiftType | '', machine_id: '', weaver_id: '', article_id: '', rpm: '', rolls: '',
  });

  const selectedMachine = machines.find(m => m.id === form.machine_id);
  const selectedArticle = articles.find(a => a.id === form.article_id);

  // When machine is selected, auto-fill RPM
  const handleMachineChange = (id: string) => {
    const m = machines.find(x => x.id === id);
    setForm(p => ({ ...p, machine_id: id, rpm: m ? String(m.rpm) : '' }));
  };

  // Efficiency calculation
  const preview = useMemo(() => {
    if (!form.shift || !form.rpm || !form.rolls || !selectedArticle) return null;
    const shiftMinutes = SHIFT_MINUTES[form.shift as ShiftType];
    const rpm = Number(form.rpm);
    const rolls = Number(form.rolls);
    const maxTurns = rpm * shiftMinutes;
    const producedTurns = rolls * selectedArticle.turns_per_roll;
    const efficiency = maxTurns > 0 ? (producedTurns / maxTurns) * 100 : 0;
    const weightKg = rolls * selectedArticle.weight_per_roll;
    const revenue = weightKg * selectedArticle.value_per_kg;
    return { efficiency: Math.min(efficiency, 100), weightKg, revenue, rolls };
  }, [form.shift, form.rpm, form.rolls, selectedArticle]);

  const openNew = () => {
    setEditing(null);
    setForm({ date: new Date(), shift: '', machine_id: '', weaver_id: '', article_id: '', rpm: '', rolls: '' });
    setArticleSearch('');
    setShowModal(true);
  };

  const openEdit = (p: Production) => {
    setEditing(p);
    setForm({ date: new Date(p.date), shift: p.shift, machine_id: p.machine_id, weaver_id: p.weaver_id, article_id: p.article_id, rpm: String(p.rpm), rolls: String(p.rolls_produced) });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.shift || !form.machine_id || !form.article_id || !form.rolls) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    if (!preview) return;

    const all = getProductions();
    const machineName = selectedMachine?.name || '';
    const weaverName = weavers.find(w => w.id === form.weaver_id)?.name || '';
    const articleName = selectedArticle?.name || '';

    const record: Production = {
      id: editing?.id || crypto.randomUUID(),
      company_id: '',
      date: format(form.date, 'yyyy-MM-dd'),
      shift: form.shift as ShiftType,
      machine_id: form.machine_id,
      machine_name: machineName,
      weaver_id: form.weaver_id,
      weaver_name: weaverName,
      article_id: form.article_id,
      article_name: articleName,
      rpm: Number(form.rpm),
      rolls_produced: Number(form.rolls),
      weight_kg: preview.weightKg,
      revenue: preview.revenue,
      efficiency: preview.efficiency,
      created_at: editing?.created_at || new Date().toISOString(),
    };

    if (editing) {
      const idx = all.findIndex(p => p.id === editing.id);
      all[idx] = record;
      toast.success('Produção atualizada');
    } else {
      all.push(record);
      toast.success('Produção registrada');
    }
    saveProductions(all);
    setProductions(getProductions());
    setShowModal(false);
  };

  const filteredArticles = articles.filter(a => a.name.toLowerCase().includes(articleSearch.toLowerCase()));

  const effColor = (eff: number) => eff >= 80 ? 'text-success' : eff >= 75 ? 'text-warning' : 'text-destructive';
  const effBg = (eff: number) => eff >= 80 ? 'bg-success/10' : eff >= 75 ? 'bg-warning/10' : 'bg-destructive/10';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Produção</h1>
          <p className="text-muted-foreground text-sm">{productions.length} registros</p>
        </div>
        <Button onClick={openNew} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Registrar Produção</Button>
      </div>

      <div className="grid gap-3">
        {productions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
          <div key={p.id} className="card-glass p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-display font-semibold text-foreground">{p.machine_name}</p>
                <Badge className={cn("text-xs", effBg(p.efficiency), effColor(p.efficiency))}>
                  {p.efficiency.toFixed(1)}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(p.date), 'dd/MM/yyyy')} · {SHIFT_LABELS[p.shift].split(' (')[0]} · {p.weaver_name} · {p.article_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {p.rolls_produced} rolos · {p.weight_kg.toFixed(1)}kg · R${p.revenue.toFixed(2)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
          </div>
        ))}
        {productions.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum registro de produção</p>}
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Produção' : 'Registrar Produção'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Date */}
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(form.date, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.date} onSelect={d => d && setForm(p => ({ ...p, date: d }))} className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Shift */}
            <div className="space-y-2">
              <Label>Turno</Label>
              <Select value={form.shift} onValueChange={v => setForm(p => ({ ...p, shift: v as ShiftType }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SHIFT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Machine */}
            <div className="space-y-2">
              <Label>Máquina</Label>
              <Select value={form.machine_id} onValueChange={handleMachineChange}>
                <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                <SelectContent>{machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* RPM */}
            {form.machine_id && (
              <div className="space-y-2">
                <Label>RPM</Label>
                <Input type="number" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} />
                <p className="text-xs text-muted-foreground">RPM padrão da máquina: {selectedMachine?.rpm}</p>
              </div>
            )}

            {/* Weaver */}
            <div className="space-y-2">
              <Label>Tecelão</Label>
              <Select value={form.weaver_id} onValueChange={v => setForm(p => ({ ...p, weaver_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o tecelão" /></SelectTrigger>
                <SelectContent>{weavers.map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Article with search */}
            <div className="space-y-2">
              <Label>Artigo</Label>
              <Input placeholder="Buscar artigo..." value={articleSearch} onChange={e => setArticleSearch(e.target.value)} className="mb-2" />
              <Select value={form.article_id} onValueChange={v => setForm(p => ({ ...p, article_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o artigo" /></SelectTrigger>
                <SelectContent>
                  {filteredArticles.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.client_name})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Rolls */}
            <div className="space-y-2">
              <Label>Rolos Produzidos</Label>
              <Input type="number" value={form.rolls} onChange={e => setForm(p => ({ ...p, rolls: e.target.value }))} />
            </div>

            {/* Preview */}
            {preview && (
              <div className={cn("p-4 rounded-lg border", effBg(preview.efficiency))}>
                <p className="text-sm font-medium text-foreground mb-2">Preview da Produção</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Rolos:</span> <strong>{preview.rolls}</strong></div>
                  <div><span className="text-muted-foreground">Kg:</span> <strong>{preview.weightKg.toFixed(1)}</strong></div>
                  <div><span className="text-muted-foreground">Valor:</span> <strong>R$ {preview.revenue.toFixed(2)}</strong></div>
                  <div><span className="text-muted-foreground">Eficiência:</span> <strong className={effColor(preview.efficiency)}>{preview.efficiency.toFixed(1)}%</strong></div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="btn-gradient">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
