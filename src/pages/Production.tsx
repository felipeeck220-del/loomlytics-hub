import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarIcon, Pencil, Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, type Production } from '@/types';

const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];

export default function ProductionPage() {
  const { getProductions, saveProductions, getMachines, getWeavers, getArticles, loading } = useCompanyData();
  const productions = getProductions();
  const machines = getMachines();
  const weavers = getWeavers();
  const articles = getArticles();

  const sortedMachines = useMemo(() => [...machines].sort((a, b) => a.number - b.number), [machines]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Production | null>(null);
  const [articleSearch, setArticleSearch] = useState('');
  const [weaverSearch, setWeaverSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    date: new Date(), shift: '' as ShiftType | '', machine_id: '', weaver_id: '', article_id: '', rpm: '', rolls: '',
  });

  const rollsRef = useRef<HTMLInputElement>(null);

  const selectedMachine = machines.find(m => m.id === form.machine_id);
  const selectedArticle = articles.find(a => a.id === form.article_id);

  // Get current machine index and shift index for auto-advance
  const currentMachineIndex = sortedMachines.findIndex(m => m.id === form.machine_id);
  const currentShiftIndex = SHIFTS.indexOf(form.shift as ShiftType);

  const handleMachineChange = (id: string) => {
    const m = machines.find(x => x.id === id);
    setForm(p => ({ ...p, machine_id: id, rpm: m ? String(m.rpm) : '' }));
  };

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

  const advanceToNext = useCallback(() => {
    if (sortedMachines.length === 0) return;
    const nextMachineIdx = currentMachineIndex + 1;
    if (nextMachineIdx < sortedMachines.length) {
      // Next machine, same shift
      const nextMachine = sortedMachines[nextMachineIdx];
      setForm(p => ({
        ...p,
        machine_id: nextMachine.id,
        rpm: String(nextMachine.rpm),
        rolls: '',
        weaver_id: '',
        article_id: '',
      }));
      setArticleSearch('');
    } else {
      // Wrap to first machine, next shift
      const nextShiftIdx = currentShiftIndex + 1;
      if (nextShiftIdx < SHIFTS.length) {
        const firstMachine = sortedMachines[0];
        setForm(p => ({
          ...p,
          shift: SHIFTS[nextShiftIdx],
          machine_id: firstMachine.id,
          rpm: String(firstMachine.rpm),
          rolls: '',
          weaver_id: '',
          article_id: '',
        }));
        setArticleSearch('');
        toast.info(`Avançou para ${SHIFT_LABELS[SHIFTS[nextShiftIdx]].split(' (')[0]}`);
      } else {
        // All shifts done
        toast.success('Todos os turnos registrados!');
        setShowModal(false);
      }
    }
  }, [sortedMachines, currentMachineIndex, currentShiftIndex]);

  const openNew = () => {
    setEditing(null);
    const firstMachine = sortedMachines[0];
    setForm({
      date: new Date(),
      shift: SHIFTS[0],
      machine_id: firstMachine?.id || '',
      weaver_id: '',
      article_id: '',
      rpm: firstMachine ? String(firstMachine.rpm) : '',
      rolls: '',
    });
    setArticleSearch('');
    setShowModal(true);
  };

  const openEdit = (p: Production) => {
    setEditing(p);
    setForm({ date: new Date(p.date), shift: p.shift, machine_id: p.machine_id, weaver_id: p.weaver_id, article_id: p.article_id, rpm: String(p.rpm), rolls: String(p.rolls_produced) });
    setShowModal(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.shift || !form.machine_id || !form.article_id || !form.rolls) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    if (!preview || saving) return;

    setSaving(true);
    const all = [...productions];
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
      toast.success(`Produção registrada — ${machineName}`);
    }
    await saveProductions(all);
    setSaving(false);

    if (editing) {
      setShowModal(false);
    } else {
      advanceToNext();
    }
  }, [form, preview, saving, productions, selectedMachine, selectedArticle, weavers, editing, saveProductions, advanceToNext]);

  // Enter key handler
  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Don't trigger if inside a select/popover
        const target = e.target as HTMLElement;
        if (target.closest('[role="listbox"]') || target.closest('[role="option"]') || target.closest('[data-radix-collection-item]')) return;
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal, handleSave]);

  // Focus rolls input when machine changes
  useEffect(() => {
    if (showModal && rollsRef.current) {
      setTimeout(() => rollsRef.current?.focus(), 100);
    }
  }, [form.machine_id, showModal]);

  const filteredArticles = articles.filter(a => a.name.toLowerCase().includes(articleSearch.toLowerCase()));
  const effColor = (eff: number) => eff >= 80 ? 'text-success' : eff >= 75 ? 'text-warning' : 'text-destructive';
  const effBg = (eff: number) => eff >= 80 ? 'bg-success/10' : eff >= 75 ? 'bg-warning/10' : 'bg-destructive/10';

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Carregando...</span></div>;
  }

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
        {productions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 100).map(p => (
          <div key={p.id} className="card-glass p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-display font-semibold text-foreground">{p.machine_name}</p>
                <Badge className={cn("text-xs", effBg(p.efficiency), effColor(p.efficiency))}>
                  {p.efficiency.toFixed(1)}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(p.date), 'dd/MM/yyyy')} · {SHIFT_LABELS[p.shift]?.split(' (')[0] || p.shift} · {p.weaver_name} · {p.article_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {p.rolls_produced} rolos · {Number(p.weight_kg).toFixed(1)}kg · R${Number(p.revenue).toFixed(2)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
          </div>
        ))}
        {productions.length > 100 && <p className="text-center text-muted-foreground text-sm">Mostrando os 100 mais recentes de {productions.length} registros</p>}
        {productions.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum registro de produção</p>}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[85vw] max-w-[85vw] h-[85vh] max-h-[85vh] flex flex-col p-5">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              {editing ? 'Editar Produção' : 'Registrar Produção'}
              {!editing && form.shift && selectedMachine && (
                <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {SHIFT_LABELS[form.shift as ShiftType]?.split(' (')[0]} · {selectedMachine.name}
                  {currentMachineIndex >= 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {currentMachineIndex + 1}/{sortedMachines.length}
                    </Badge>
                  )}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left h-9 text-sm">
                      <CalendarIcon className="mr-2 h-3 w-3" />{format(form.date, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.date} onSelect={d => d && setForm(p => ({ ...p, date: d }))} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Turno</Label>
                <Select value={form.shift} onValueChange={v => setForm(p => ({ ...p, shift: v as ShiftType }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Turno" /></SelectTrigger>
                  <SelectContent>{Object.entries(SHIFT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Máquina</Label>
                <Select value={form.machine_id} onValueChange={handleMachineChange}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Máquina" /></SelectTrigger>
                  <SelectContent>{sortedMachines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">RPM</Label>
                <Input type="number" className="h-9" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} placeholder={selectedMachine ? String(selectedMachine.rpm) : ''} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tecelão</Label>
                <Select value={form.weaver_id} onValueChange={v => { setForm(p => ({ ...p, weaver_id: v })); setWeaverSearch(''); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Tecelão" /></SelectTrigger>
                  <SelectContent>
                    <div className="p-1"><Input placeholder="Buscar tecelão..." value={weaverSearch} onChange={e => { e.stopPropagation(); setWeaverSearch(e.target.value); }} className="h-7 text-xs" onKeyDown={e => e.stopPropagation()} /></div>
                    {weavers.filter(w => `${w.code} ${w.name}`.toLowerCase().includes(weaverSearch.toLowerCase())).map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Artigo</Label>
                <Select value={form.article_id} onValueChange={v => { setForm(p => ({ ...p, article_id: v })); setArticleSearch(''); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Artigo" /></SelectTrigger>
                  <SelectContent>
                    <div className="p-1"><Input placeholder="Buscar artigo..." value={articleSearch} onChange={e => { e.stopPropagation(); setArticleSearch(e.target.value); }} className="h-7 text-xs" onKeyDown={e => e.stopPropagation()} /></div>
                    {filteredArticles.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.client_name})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Rolos Produzidos</Label>
                <Input ref={rollsRef} type="number" className="h-9" value={form.rolls} onChange={e => setForm(p => ({ ...p, rolls: e.target.value }))} placeholder="Qtd rolos" />
              </div>
            </div>

            {/* Preview - always visible */}
            <div className={cn("p-3 rounded-lg border", preview ? effBg(preview.efficiency) : 'bg-muted/30')}>
              {preview ? (
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div className="text-center"><p className="text-xs text-muted-foreground">Rolos</p><p className="font-bold text-foreground">{preview.rolls}</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Peso (kg)</p><p className="font-bold text-foreground">{preview.weightKg.toFixed(1)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Valor</p><p className="font-bold text-foreground">R$ {preview.revenue.toFixed(2)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Eficiência</p><p className={cn("font-bold", effColor(preview.efficiency))}>{preview.efficiency.toFixed(1)}%</p></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-1">Preencha os campos para ver o preview</p>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">Pressione <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono border">Enter</kbd> para salvar</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Fechar</Button>
              <Button onClick={handleSave} className="btn-gradient" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? 'Salvar' : 'Registrar e Próximo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
