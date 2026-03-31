import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, CalendarIcon, Pencil, Loader2, ChevronRight, ChevronDown, ChevronUp, Filter, X, Trash2, Clock, FileText, TrendingUp, Target, AlertTriangle, CheckCircle2, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, type Production, getCompanyShiftMinutes, getCompanyShiftLabels } from '@/types';
import { formatNumber, formatCurrency } from '@/lib/formatters';
import { usePermissions } from '@/hooks/usePermissions';
import { calculateShiftDowntime, formatDowntimeMinutes, type ShiftDowntimeInfo } from '@/lib/downtimeUtils';

type SaveQueueItem = {
  id: string;
  machineName: string;
  status: 'saving' | 'done' | 'error';
};

const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];

export default function ProductionPage() {
  const { getProductions, addProductions, updateProductions, deleteProductions, getMachines, getWeavers, getArticles, getArticleMachineTurns, getMachineLogs, shiftSettings, loading } = useSharedCompanyData();
  const companyShiftMinutes = useMemo(() => getCompanyShiftMinutes(shiftSettings), [shiftSettings]);
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const { canSeeFinancial } = usePermissions();
  const productions = getProductions();
  const machines = getMachines();
  const weavers = getWeavers();
  const articles = getArticles();
  const articleMachineTurns = getArticleMachineTurns();
  const machineLogs = getMachineLogs();
  const { logAction, userName, userCode } = useAuditLog();

  const sortedMachines = useMemo(() => [...machines].sort((a, b) => a.number - b.number), [machines]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterDate, setFilterDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [filterMachine, setFilterMachine] = useState('');
  const [filterArticle, setFilterArticle] = useState('');

  // Active shift tab
  const [activeShift, setActiveShift] = useState<ShiftType>('manha');

  // Expanded production row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Delete confirmation
  const [showDelete, setShowDelete] = useState<Production | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Production | null>(null);
  const [articleSearch, setArticleSearch] = useState('');
  const [weaverSearch, setWeaverSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingGroupItems, setEditingGroupItems] = useState<Production[]>([]);
  const [saveQueue, setSaveQueue] = useState<SaveQueueItem[]>([]);
  const hasPendingSaves = saveQueue.some(q => q.status === 'saving');

  const [form, setForm] = useState({
    date: new Date(), shift: '' as ShiftType | '', machine_id: '', weaver_id: '', article_id: '', rpm: '', rolls: '',
    voltas_inicio: '', voltas_fim: '',
  });

  // Extra articles (for split-shift production)
  const [extraArticles, setExtraArticles] = useState<{ article_id: string; rolls: string; search: string }[]>([]);

  const rollsRef = useRef<HTMLInputElement>(null);

  const selectedMachine = machines.find(m => m.id === form.machine_id);
  const selectedArticle = articles.find(a => a.id === form.article_id);
  const machineMode = selectedMachine?.production_mode || 'rolos';

  // Calculate downtime for selected machine/date/shift
  const downtimeInfo = useMemo((): ShiftDowntimeInfo | null => {
    if (!form.machine_id || !form.shift || !form.date) return null;
    const dateStr = format(form.date, 'yyyy-MM-dd');
    const shiftMinutes = companyShiftMinutes[form.shift as ShiftType];
    if (!shiftMinutes) return null;
    return calculateShiftDowntime(machineLogs, form.machine_id, dateStr, form.shift as ShiftType, shiftSettings, shiftMinutes);
  }, [form.machine_id, form.shift, form.date, machineLogs, shiftSettings, companyShiftMinutes]);

  // Effective shift minutes (discounting downtime)
  const effectiveShiftMinutes = downtimeInfo ? downtimeInfo.effectiveShiftMinutes : (form.shift ? companyShiftMinutes[form.shift as ShiftType] : 510);

  const currentMachineIndex = sortedMachines.findIndex(m => m.id === form.machine_id);
  const currentShiftIndex = SHIFTS.indexOf(form.shift as ShiftType);

  const handleMachineChange = (id: string) => {
    const m = machines.find(x => x.id === id);
    setForm(p => ({ ...p, machine_id: id, rpm: m ? String(m.rpm) : '', voltas_inicio: '', voltas_fim: '', rolls: '' }));
  };

  // Auto-calculate rolls from voltas
  useEffect(() => {
    if (machineMode !== 'voltas') return;
    const inicio = Number(form.voltas_inicio);
    const fim = Number(form.voltas_fim);
    if (!inicio || !fim || !form.article_id || !form.machine_id) { setForm(p => ({ ...p, rolls: '' })); return; }
    const totalVoltas = fim - inicio;
    if (totalVoltas <= 0) { setForm(p => ({ ...p, rolls: '' })); return; }
    const turnsPerRoll = getTurnsForMachine(form.article_id, form.machine_id);
    if (turnsPerRoll <= 0) { setForm(p => ({ ...p, rolls: '' })); return; }
    const calculatedRolls = totalVoltas / turnsPerRoll;
    setForm(p => ({ ...p, rolls: String(Math.round(calculatedRolls * 100) / 100) }));
  }, [form.voltas_inicio, form.voltas_fim, form.article_id, form.machine_id, machineMode]);

  // Get turns for a specific article+machine combo
  const getTurnsForMachine = (articleId: string, machineId: string): number => {
    const specific = articleMachineTurns.find(t => t.article_id === articleId && t.machine_id === machineId);
    if (specific) return specific.turns_per_roll;
    const article = articles.find(a => a.id === articleId);
    return article?.turns_per_roll || 0;
  };

  const preview = useMemo(() => {
    if (!form.shift || !form.rpm || !selectedArticle) return null;
    const shiftMinutes = effectiveShiftMinutes;
    const rpm = Number(form.rpm);
    const maxTurns = rpm * shiftMinutes;

    // In voltas mode, use actual voltas for efficiency
    if (machineMode === 'voltas') {
      const inicio = Number(form.voltas_inicio);
      const fim = Number(form.voltas_fim);
      if (!inicio || !fim || fim <= inicio) return null;
      const totalVoltas = fim - inicio;
      const turnsPerRoll = getTurnsForMachine(selectedArticle.id, form.machine_id);
      const rolls = turnsPerRoll > 0 ? totalVoltas / turnsPerRoll : 0;
      const weightKg = rolls * selectedArticle.weight_per_roll;
      const revenue = weightKg * selectedArticle.value_per_kg;
      const efficiency = maxTurns > 0 ? (totalVoltas / maxTurns) * 100 : 0;
      return { efficiency: Math.min(efficiency, 100), weightKg, revenue, rolls, extraPreviews: [], totalVoltas };
    }

    if (!form.rolls) return null;

    // Main article
    const mainRolls = Number(form.rolls);
    const mainTurnsPerRoll = getTurnsForMachine(selectedArticle.id, form.machine_id);
    const mainProducedTurns = mainRolls * mainTurnsPerRoll;
    const mainWeightKg = mainRolls * selectedArticle.weight_per_roll;
    const mainRevenue = mainWeightKg * selectedArticle.value_per_kg;

    // Extra articles
    let totalProducedTurns = mainProducedTurns;
    let totalWeightKg = mainWeightKg;
    let totalRevenue = mainRevenue;
    let totalRolls = mainRolls;

    const extraPreviews = extraArticles.map(ea => {
      const art = articles.find(a => a.id === ea.article_id);
      const rolls = Number(ea.rolls) || 0;
      if (!art || !rolls) return null;
      const turnsPerRoll = getTurnsForMachine(art.id, form.machine_id);
      const producedTurns = rolls * turnsPerRoll;
      const weightKg = rolls * art.weight_per_roll;
      const revenue = weightKg * art.value_per_kg;
      totalProducedTurns += producedTurns;
      totalWeightKg += weightKg;
      totalRevenue += revenue;
      totalRolls += rolls;
      return { rolls, weightKg, revenue, producedTurns };
    });

    const efficiency = maxTurns > 0 ? (totalProducedTurns / maxTurns) * 100 : 0;
    return { efficiency: Math.min(efficiency, 100), weightKg: totalWeightKg, revenue: totalRevenue, rolls: totalRolls, extraPreviews };
  }, [form.shift, form.rpm, form.rolls, form.voltas_inicio, form.voltas_fim, machineMode, selectedArticle, form.machine_id, articleMachineTurns, extraArticles, articles, effectiveShiftMinutes]);

  const advanceToNext = useCallback(() => {
    if (sortedMachines.length === 0) return;
    const nextMachineIdx = currentMachineIndex + 1;
    if (nextMachineIdx < sortedMachines.length) {
      const nextMachine = sortedMachines[nextMachineIdx];
      setForm(p => ({ ...p, machine_id: nextMachine.id, rpm: String(nextMachine.rpm), rolls: '', weaver_id: 'sem_tecelao', article_id: '', voltas_inicio: '', voltas_fim: '' }));
      setArticleSearch(''); setWeaverSearch(''); setExtraArticles([]);
    } else {
      const nextShiftIdx = currentShiftIndex + 1;
      if (nextShiftIdx < SHIFTS.length) {
        const firstMachine = sortedMachines[0];
        setForm(p => ({ ...p, shift: SHIFTS[nextShiftIdx], machine_id: firstMachine.id, rpm: String(firstMachine.rpm), rolls: '', weaver_id: 'sem_tecelao', article_id: '', voltas_inicio: '', voltas_fim: '' }));
        setArticleSearch(''); setWeaverSearch(''); setExtraArticles([]);
        toast.info(`Avançou para ${companyShiftLabels[SHIFTS[nextShiftIdx]].split(' (')[0]}`);
      } else {
        toast.success('Todos os turnos registrados!');
        setShowModal(false);
      }
    }
  }, [sortedMachines, currentMachineIndex, currentShiftIndex]);

  const openNew = () => {
    setEditing(null);
    const firstMachine = sortedMachines[0];
    setForm({ date: new Date(), shift: SHIFTS[0], machine_id: firstMachine?.id || '', weaver_id: 'sem_tecelao', article_id: '', rpm: firstMachine ? String(firstMachine.rpm) : '', rolls: '', voltas_inicio: '', voltas_fim: '' });
    setArticleSearch(''); setWeaverSearch(''); setExtraArticles([]); setEditingGroupItems([]); setSaveQueue([]);
    setShowModal(true);
  };

  const openEditGroup = (group: ProductionGroup) => {
    const first = group.items[0];
    setEditing(first);
    setForm({ date: new Date(first.date + 'T12:00:00'), shift: first.shift, machine_id: first.machine_id, weaver_id: first.weaver_id || 'sem_tecelao', article_id: first.article_id, rpm: String(first.rpm), rolls: String(first.rolls_produced), voltas_inicio: '', voltas_fim: '' });
    // Load additional articles from the group
    const extras = group.items.slice(1).map(p => ({ article_id: p.article_id, rolls: String(p.rolls_produced), search: '' }));
    setExtraArticles(extras);
    setEditingGroupItems(group.items);
    setShowModal(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.shift || !form.machine_id || !form.article_id) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    if (machineMode === 'voltas') {
      if (!form.voltas_inicio || !form.voltas_fim || Number(form.voltas_fim) <= Number(form.voltas_inicio)) {
        toast.error('Preencha as voltas de início e fim corretamente'); return;
      }
    } else if (!form.rolls) {
      toast.error('Preencha a quantidade de rolos'); return;
    }
    if (!preview || saving) return;

    const isEditing = !!editing;
    const machineName = selectedMachine?.name || '';
    const actualWeaverId = form.weaver_id === 'sem_tecelao' ? '' : form.weaver_id;
    const weaverName = weavers.find(w => w.id === actualWeaverId)?.name || 'Sem Tecelão';
    const dateStr = format(form.date, 'yyyy-MM-dd');
    const shiftVal = form.shift as ShiftType;
    const rpmVal = Number(form.rpm);
    const combinedEfficiency = preview.efficiency;
    const now = new Date().toISOString();

    // Check for duplicate: same machine + date + shift (only for new records)
    if (!isEditing) {
      const existingForMachineShift = productions.find(
        p => p.machine_id === form.machine_id && p.date === dateStr && p.shift === shiftVal
      );
      if (existingForMachineShift) {
        toast.error(`Já existe produção cadastrada para ${machineName} no turno ${companyShiftLabels[shiftVal]?.split(' (')[0]} em ${format(form.date, 'dd/MM/yyyy')}`, {
          duration: 5000,
        });
        return;
      }
    }

    // Build records
    const mainArticleName = selectedArticle?.name || '';
    const mainRolls = Number(form.rolls);
    const mainWeightKg = selectedArticle ? mainRolls * selectedArticle.weight_per_roll : 0;
    const mainRevenue = selectedArticle ? mainWeightKg * selectedArticle.value_per_kg : 0;

    const newRecords: Production[] = [];
    newRecords.push({
      id: editing?.id || crypto.randomUUID(), company_id: '',
      date: dateStr, shift: shiftVal,
      machine_id: form.machine_id, machine_name: machineName,
      weaver_id: actualWeaverId, weaver_name: weaverName,
      article_id: form.article_id, article_name: mainArticleName,
      rpm: rpmVal, rolls_produced: mainRolls,
      weight_kg: mainWeightKg, revenue: mainRevenue,
      efficiency: combinedEfficiency, created_at: editing?.created_at || now,
      created_by_name: userName || undefined, created_by_code: userCode || undefined,
    });

    for (const ea of extraArticles) {
      const art = articles.find(a => a.id === ea.article_id);
      const rolls = Number(ea.rolls) || 0;
      if (!art || !rolls) continue;
      const weightKg = rolls * art.weight_per_roll;
      const revenue = weightKg * art.value_per_kg;
      newRecords.push({
        id: crypto.randomUUID(), company_id: '',
        date: dateStr, shift: shiftVal,
        machine_id: form.machine_id, machine_name: machineName,
        weaver_id: actualWeaverId, weaver_name: weaverName,
        article_id: ea.article_id, article_name: art.name,
        rpm: rpmVal, rolls_produced: rolls,
        weight_kg: weightKg, revenue,
        efficiency: combinedEfficiency, created_at: editing?.created_at || now,
        created_by_name: userName || undefined, created_by_code: userCode || undefined,
      });
    }

    // For editing: update synchronously
    if (isEditing) {
      setSaving(true);
      try {
        const oldIds = editingGroupItems.map(i => i.id);
        await updateProductions(oldIds, newRecords);
        logAction('production_update', { machine: machineName, date: form.date, shift: form.shift });
        toast.success('Produção atualizada');
      } catch {
        toast.error('Erro ao atualizar produção');
      }
      setSaving(false);
      setExtraArticles([]);
      setShowModal(false);
      return;
    }

    // For new records: save in background, advance immediately
    const queueId = crypto.randomUUID();
    setSaveQueue(prev => [...prev, { id: queueId, machineName, status: 'saving' }]);
    setExtraArticles([]);
    advanceToNext();

    logAction('production_create', { machine: machineName, date: form.date, shift: form.shift });
    addProductions(newRecords).then(() => {
      setSaveQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      setTimeout(() => {
        setSaveQueue(prev => prev.filter(q => q.id !== queueId));
      }, 3000);
    }).catch(() => {
      setSaveQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error' } : q));
      toast.error(`Erro ao salvar produção — ${machineName}`);
    });
  }, [form, preview, saving, productions, selectedMachine, selectedArticle, weavers, editing, editingGroupItems, addProductions, updateProductions, advanceToNext, extraArticles, articles, companyShiftLabels, machineMode]);

  const handleDelete = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    if (!showDelete) return;
    const group = shiftProductionGroups.find(g => g.items.some(i => i.id === showDelete.id));
    const idsToDelete = group ? group.items.map(i => i.id) : [showDelete.id];
    await deleteProductions(idsToDelete);
    logAction('production_delete', { machine: showDelete.machine_name, date: showDelete.date, shift: showDelete.shift });
    setShowDelete(null); setDeleteWord('');
    toast.success('Produção excluída');
  };

  // Enter key handler
  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.closest('[role="listbox"]') || target.closest('[role="option"]') || target.closest('[data-radix-collection-item]')) return;
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal, handleSave]);

  useEffect(() => {
    if (showModal && rollsRef.current) {
      setTimeout(() => rollsRef.current?.focus(), 100);
    }
  }, [form.machine_id, showModal]);

  const filteredArticles = articles.filter(a => a.name.toLowerCase().includes(articleSearch.toLowerCase()));
  const effColor = (eff: number, target = 80) => eff >= target ? 'text-emerald-600' : eff >= target * 0.9 ? 'text-warning' : 'text-destructive';
  const effBg = (eff: number, target = 80) => eff >= target ? 'bg-emerald-50' : eff >= target * 0.9 ? 'bg-yellow-50' : 'bg-red-50';

  // Filter productions
  const hasActiveFilters = filterDate || filterMachine || filterArticle;

  const filteredProductions = useMemo(() => {
    let result = [...productions];
    if (filterDate) result = result.filter(p => p.date === filterDate);
    if (filterMachine) result = result.filter(p => p.machine_id === filterMachine);
    if (filterArticle) result = result.filter(p => p.article_id === filterArticle);
    return result;
  }, [productions, filterDate, filterMachine, filterArticle]);

  // Group by shift, then group multi-article productions into single entries
  type ProductionGroup = {
    key: string;
    items: typeof filteredProductions;
    machine_id: string;
    machine_name: string;
    weaver_name: string;
    date: string;
    shift: string;
    created_at: string;
    rpm: number;
    totalRolls: number;
    totalWeightKg: number;
    totalRevenue: number;
    efficiency: number;
  };

  const shiftProductionGroups = useMemo(() => {
    const shiftItems = filteredProductions
      .filter(p => p.shift === activeShift)
      .sort((a, b) => {
        const mA = machines.find(m => m.id === a.machine_id);
        const mB = machines.find(m => m.id === b.machine_id);
        return (mA?.number || 0) - (mB?.number || 0);
      });

    // Group by machine_id + date + created_at (multi-article saves share exact created_at)
    const groupMap = new Map<string, typeof shiftItems>();
    for (const p of shiftItems) {
      const key = `${p.machine_id}|${p.date}|${p.created_at}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(p);
    }

    const groups: ProductionGroup[] = [];
    for (const [key, items] of groupMap) {
      const first = items[0];
      groups.push({
        key,
        items,
        machine_id: first.machine_id,
        machine_name: first.machine_name || '',
        weaver_name: first.weaver_name || 'Sem Tecelão',
        date: first.date,
        shift: first.shift,
        created_at: first.created_at,
        rpm: first.rpm,
        totalRolls: items.reduce((s, p) => s + p.rolls_produced, 0),
        totalWeightKg: items.reduce((s, p) => s + Number(p.weight_kg), 0),
        totalRevenue: items.reduce((s, p) => s + Number(p.revenue), 0),
        efficiency: first.efficiency, // all share the same combined efficiency
      });
    }

    return groups;
  }, [filteredProductions, activeShift, machines]);

  // KPIs for active shift
  const shiftKPIs = useMemo(() => {
    const allProds = shiftProductionGroups.flatMap(g => g.items);
    const totalRolls = allProds.reduce((s, p) => s + p.rolls_produced, 0);
    const totalWeight = allProds.reduce((s, p) => s + Number(p.weight_kg), 0);
    const totalRevenue = allProds.reduce((s, p) => s + Number(p.revenue), 0);
    const avgEfficiency = shiftProductionGroups.length > 0 ? shiftProductionGroups.reduce((s, g) => s + g.efficiency, 0) / shiftProductionGroups.length : 0;
    return { totalRolls, totalWeight, totalRevenue, avgEfficiency, count: shiftProductionGroups.length };
  }, [shiftProductionGroups]);

  // Calculate meta for a production record using article's target_efficiency
  const calcMeta = (p: Production) => {
    const article = articles.find(a => a.id === p.article_id);
    if (!article) return { metaTarget: 0, meta100: 0, metaRolls: 0, targetEfficiency: 80 };
    const turnsPerRoll = getTurnsForMachine(p.article_id, p.machine_id);
    const shiftMinutes = companyShiftMinutes[p.shift] || 510;
    const maxTurns = p.rpm * shiftMinutes;
    let metaRolls = turnsPerRoll > 0 ? maxTurns / turnsPerRoll : 0;
    // Fallback: back-calculate from stored efficiency if turnsPerRoll is 0
    if (metaRolls === 0 && p.efficiency > 0 && p.rolls_produced > 0) {
      metaRolls = p.rolls_produced / (p.efficiency / 100);
    }
    const targetEff = article.target_efficiency || 80;
    return { metaTarget: metaRolls * (targetEff / 100), meta100: metaRolls, metaRolls, targetEfficiency: targetEff };
  };

  const clearFilters = () => {
    setFilterDate(''); setFilterMachine(''); setFilterArticle('');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Carregando...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Produção</h1>
          <p className="text-muted-foreground text-sm">Registre e acompanhe a produção por turno - {format(new Date(), 'dd/MM/yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-1" /> Filtros
          </Button>
          <Button onClick={openNew} className="btn-gradient">
            <Plus className="h-4 w-4 mr-1" /> Registrar Produção
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card-glass p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Filtros de Produção</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowFilters(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-sm">Data</Label>
              <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Máquina</Label>
              <Select value={filterMachine} onValueChange={setFilterMachine}>
                <SelectTrigger><SelectValue placeholder="Todas as máquinas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as máquinas</SelectItem>
                  {sortedMachines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Artigo</Label>
              <Select value={filterArticle} onValueChange={setFilterArticle}>
                <SelectTrigger><SelectValue placeholder="Todos os artigos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os artigos</SelectItem>
                  {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> Limpar Filtros
            </Button>
          </div>

          {hasActiveFilters && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-700">Filtros Ativos:</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {filterDate && <span className="text-sm text-blue-600">Data: {format(new Date(filterDate + 'T12:00:00'), 'dd/MM/yyyy')}</span>}
                {filterMachine && filterMachine !== 'all' && <span className="text-sm text-blue-600">Máquina: {machines.find(m => m.id === filterMachine)?.name}</span>}
                {filterArticle && filterArticle !== 'all' && <span className="text-sm text-blue-600">Artigo: {articles.find(a => a.id === filterArticle)?.name}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shift Tabs */}
      <Tabs value={activeShift} onValueChange={v => setActiveShift(v as ShiftType)}>
        <TabsList className="w-full grid grid-cols-3">
          {SHIFTS.map(s => (
            <TabsTrigger key={s} value={s} className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> {companyShiftLabels[s].split(' (')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        {SHIFTS.map(shift => (
          <TabsContent key={shift} value={shift} className="mt-4 space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card-glass p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Rolos</span>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-display font-bold text-foreground mt-1">{formatNumber(shiftKPIs.totalRolls)}</p>
              </div>
              <div className="card-glass p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Peso (kg)</span>
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-display font-bold text-foreground mt-1">{formatNumber(shiftKPIs.totalWeight, 2)}</p>
              </div>
              <div className="card-glass p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Faturamento</span>
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-2xl font-display font-bold text-emerald-600 mt-1">{formatCurrency(shiftKPIs.totalRevenue)}</p>
              </div>
              <div className="card-glass p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Meta Média</span>
                  <Target className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className={cn("text-2xl font-display font-bold mt-1", effColor(shiftKPIs.avgEfficiency))}>
                  {formatNumber(shiftKPIs.avgEfficiency, 2)}%
                </p>
              </div>
            </div>

            {/* Shift Info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="font-semibold text-foreground">Produção do Turno {companyShiftLabels[shift].split(' (')[0]}</span>
              <span>{companyShiftLabels[shift].match(/\((.+)\)/)?.[1] || ''} - {shiftKPIs.count} registros</span>
            </div>

            {/* Production Rows */}
            <div className="space-y-2">
              {shiftProductionGroups.map(group => {
                const isExpanded = expandedId === group.key;
                const isMultiArticle = group.items.length > 1;
                const firstItem = group.items[0];
                
                // For meta calculation, use article target_efficiency
                const calcGroupMeta = () => {
                  const shiftMinutes = companyShiftMinutes[group.shift as ShiftType] || 510;
                  const maxTurns = group.rpm * shiftMinutes;
                  
                  // Weighted average target efficiency based on each article
                  const articleTargets = group.items.map(p => {
                    const art = articles.find(a => a.id === p.article_id);
                    return art?.target_efficiency || 80;
                  });
                  const avgTargetEff = articleTargets.reduce((s, t) => s + t, 0) / articleTargets.length;
                  
                  // Calculate meta rolls for each item and sum
                  let totalMetaRolls = 0;
                  for (const item of group.items) {
                    const turnsPerRoll = getTurnsForMachine(item.article_id, item.machine_id);
                    if (turnsPerRoll > 0) {
                      totalMetaRolls += maxTurns / turnsPerRoll;
                    } else if (item.efficiency > 0 && item.rolls_produced > 0) {
                      // Back-calculate from stored efficiency: rolls / (eff/100) = meta100
                      totalMetaRolls += item.rolls_produced / (item.efficiency / 100);
                    }
                  }
                  
                  return { metaTarget: totalMetaRolls * (avgTargetEff / 100), meta100: totalMetaRolls, metaRolls: totalMetaRolls, targetEfficiency: avgTargetEff };
                };
                const meta = calcGroupMeta();
                const metaTargetReached = group.totalRolls >= meta.metaTarget;

                // Articles description
                const articlesDesc = group.items.map(p => p.article_name).join(' + ');
                const registrationTime = group.created_at ? format(new Date(group.created_at), 'dd/MM/yyyy HH:mm') : '';

                return (
                  <div key={group.key} className="card-glass overflow-hidden">
                    {/* Row Header */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-foreground text-lg">{group.machine_name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {group.weaver_name}{registrationTime ? ` — ${registrationTime}` : ''} -- {isMultiArticle ? 'Artigos' : 'Artigo'}: {articlesDesc}
                          {firstItem.created_by_name && (
                            <span className="text-primary font-medium"> — por {firstItem.created_by_name}{firstItem.created_by_code ? ` #${firstItem.created_by_code}` : ''}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Rolos</p>
                          <p className="font-bold text-foreground">{group.totalRolls}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Meta {formatNumber(meta.targetEfficiency, 0)}%</p>
                          <div className="flex items-center gap-1">
                            <span className={metaTargetReached ? 'text-emerald-500' : 'text-destructive'}>
                              {metaTargetReached ? '✓' : '✗'}
                            </span>
                            <span className="font-bold text-foreground">{formatNumber(meta.metaTarget, 2)}</span>
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">% Atingida</p>
                          <Badge className={cn("text-xs font-bold", effBg(group.efficiency, meta.targetEfficiency), effColor(group.efficiency, meta.targetEfficiency))}>
                            {formatNumber(group.efficiency, 2)}%
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditGroup(group)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDelete(firstItem); setDeleteWord(''); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setExpandedId(isExpanded ? null : group.key)}>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-border p-5 space-y-4 bg-muted/20">
                        {/* Articles List */}
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-2">{isMultiArticle ? 'Artigos:' : 'Artigo:'}</p>
                          {group.items.map((p, idx) => {
                            const article = articles.find(a => a.id === p.article_id);
                            return (
                              <div key={p.id} className={cn("text-sm text-muted-foreground", idx > 0 && "mt-1")}>
                                {p.article_name} {article?.client_name ? `(${article.client_name})` : ''} — {p.rolls_produced} rolos, {formatNumber(Number(p.weight_kg), 2)} kg{canSeeFinancial ? `, ${formatCurrency(Number(p.revenue))}` : ''}
                              </div>
                            );
                          })}
                        </div>

                        {/* Main metrics (combined) */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Rolos</p>
                            <p className="text-xl font-display font-bold text-blue-800">{group.totalRolls}</p>
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Peso</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatNumber(group.totalWeightKg, 2)} kg</p>
                          </div>
                          {canSeeFinancial && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Faturamento</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatCurrency(group.totalRevenue)}</p>
                          </div>}
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Meta</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatNumber(meta.metaRolls, 2)} rolos</p>
                          </div>
                        </div>

                        {/* Meta status + efficiency */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className={cn("rounded-lg border p-3", metaTargetReached ? 'border-emerald-200 bg-emerald-50' : 'border-yellow-200 bg-yellow-50')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", metaTargetReached ? 'text-emerald-600' : 'text-yellow-700')}>Meta {formatNumber(meta.targetEfficiency, 0)}%</p>
                              <Target className={cn("h-4 w-4", metaTargetReached ? 'text-emerald-500' : 'text-yellow-500')} />
                            </div>
                            <p className={cn("text-lg font-bold", metaTargetReached ? 'text-emerald-700' : 'text-yellow-800')}>{formatNumber(meta.metaTarget, 2)} rolos</p>
                            <p className={cn("text-xs", metaTargetReached ? 'text-emerald-600' : 'text-yellow-600')}>
                              {metaTargetReached ? '✓ Atingida' : '✗ Não atingida'}
                            </p>
                          </div>
                          <div className={cn("rounded-lg border p-3", group.totalRolls >= meta.meta100 ? 'border-emerald-200 bg-emerald-50' : 'border-yellow-200 bg-yellow-50')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", group.totalRolls >= meta.meta100 ? 'text-emerald-600' : 'text-yellow-700')}>Meta 100%</p>
                              <Target className={cn("h-4 w-4", group.totalRolls >= meta.meta100 ? 'text-emerald-500' : 'text-yellow-500')} />
                            </div>
                            <p className={cn("text-lg font-bold", group.totalRolls >= meta.meta100 ? 'text-emerald-700' : 'text-yellow-800')}>{formatNumber(meta.meta100, 2)} rolos</p>
                            <p className={cn("text-xs", group.totalRolls >= meta.meta100 ? 'text-emerald-600' : 'text-yellow-600')}>
                              {group.totalRolls >= meta.meta100 ? '✓ Atingida' : '✗ Não atingida'}
                            </p>
                          </div>
                          <div className={cn("rounded-lg border p-3", effBg(group.efficiency, meta.targetEfficiency), group.efficiency >= meta.targetEfficiency ? 'border-emerald-200' : group.efficiency >= meta.targetEfficiency * 0.9 ? 'border-yellow-200' : 'border-red-200')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", effColor(group.efficiency, meta.targetEfficiency))}>% Produção</p>
                              <TrendingUp className={cn("h-4 w-4", effColor(group.efficiency, meta.targetEfficiency))} />
                            </div>
                            <p className={cn("text-lg font-bold", effColor(group.efficiency, meta.targetEfficiency))}>{formatNumber(group.efficiency, 2)}%</p>
                            <p className={cn("text-xs flex items-center gap-1", effColor(group.efficiency, meta.targetEfficiency))}>
                              {group.efficiency >= meta.targetEfficiency ? '✓ Dentro da meta' : (
                                <><AlertTriangle className="h-3 w-3" /> Abaixo da meta</>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Registration info + downtime */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">Registro</p>
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                             <p className="text-sm font-semibold text-foreground mt-1">{format(new Date(group.date), 'dd/MM/yyyy')}</p>
                             <p className="text-xs text-muted-foreground mt-0.5">Cadastrado em: {registrationTime || '—'}</p>
                          </div>
                          <div className={cn("rounded-lg border p-3", group.efficiency < meta.targetEfficiency ? 'border-red-200 bg-red-50' : 'border-border bg-background')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", group.efficiency < meta.targetEfficiency ? 'text-red-600' : 'text-muted-foreground')}>Tempo Parada</p>
                              <Clock className={cn("h-4 w-4", group.efficiency < meta.targetEfficiency ? 'text-red-500' : 'text-muted-foreground')} />
                            </div>
                            {(() => {
                              const shiftMin = companyShiftMinutes[group.shift as ShiftType] || 510;
                              const usedMin = shiftMin * (group.efficiency / 100);
                              const downMin = shiftMin - usedMin;
                              const hours = Math.floor(downMin / 60);
                              const mins = Math.round(downMin % 60);
                              return (
                                <>
                                  <p className={cn("text-lg font-bold mt-1", group.efficiency < meta.targetEfficiency ? 'text-red-700' : 'text-foreground')}>
                                    {hours}h{mins > 0 ? `${mins}min` : ''}
                                  </p>
                                  <p className={cn("text-xs", group.efficiency < meta.targetEfficiency ? 'text-red-600' : 'text-muted-foreground')}>Tempo inativo</p>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {shiftProductionGroups.length === 0 && (
                <div className="text-center text-muted-foreground py-12">Nenhum registro de produção para este turno</div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Register/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open && hasPendingSaves) return; setShowModal(open); }}>
        <DialogContent
          className="flex h-[90vh] max-h-[90vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-4 sm:h-[80vh] sm:max-h-[80vh] sm:w-[80vw] sm:max-w-[80vw] sm:p-6"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex-shrink-0 pr-6">
            <DialogTitle className="flex flex-col gap-2 text-left sm:flex-row sm:items-center sm:gap-3">
              <span className="leading-none">{editing ? 'Editar Produção' : 'Registrar Produção'}</span>
              {!editing && form.shift && selectedMachine && (
                <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-normal text-muted-foreground sm:text-sm">
                  <ChevronRight className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {companyShiftLabels[form.shift as ShiftType]?.split(' (')[0]} · {selectedMachine.name}
                  </span>
                  {currentMachineIndex >= 0 && (
                    <Badge variant="outline" className="ml-0 text-xs sm:ml-2">
                      {currentMachineIndex + 1}/{sortedMachines.length}
                    </Badge>
                  )}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-full justify-start text-left text-sm">
                      <CalendarIcon className="mr-2 h-3 w-3 shrink-0" />
                      <span className="truncate">{format(form.date, 'dd/MM/yyyy')}</span>
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
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Turno" /></SelectTrigger>
                  <SelectContent>{Object.entries(companyShiftLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Máquina</Label>
                <Select value={form.machine_id} onValueChange={handleMachineChange}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Máquina" /></SelectTrigger>
                  <SelectContent>{sortedMachines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
                {selectedMachine && (
                  <Badge variant="outline" className="mt-0.5 w-fit max-w-full text-xs">
                    <span className="truncate">Modo: {machineMode === 'voltas' ? 'Voltas' : 'Rolos'}</span>
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">RPM</Label>
                <Input type="number" className="h-9 w-full" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} />
              </div>
            </div>

            {downtimeInfo && downtimeInfo.events.length > 0 && (
              <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PauseCircle className="h-4 w-4 shrink-0 text-warning" />
                  <span className="text-sm font-semibold text-warning">Máquina parada neste turno</span>
                  <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                    -{formatDowntimeMinutes(downtimeInfo.totalDowntimeMinutes)}
                  </Badge>
                </div>
                {downtimeInfo.events.map((evt, idx) => (
                  <p key={idx} className="break-words text-xs text-muted-foreground sm:ml-6">
                    {evt.label}: {formatDowntimeMinutes(evt.minutes)}
                    <span className="ml-1 opacity-70">
                      ({format(evt.startedAt, 'HH:mm')} — {format(evt.endedAt, 'HH:mm')})
                    </span>
                  </p>
                ))}
                <p className="break-words text-xs font-medium text-foreground sm:ml-6">
                  Tempo efetivo do turno: {formatDowntimeMinutes(downtimeInfo.effectiveShiftMinutes)}
                  <span className="ml-1 text-muted-foreground">
                    (de {formatDowntimeMinutes(companyShiftMinutes[form.shift as ShiftType])})
                  </span>
                </p>
              </div>
            )}

            <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", machineMode === 'voltas' ? 'md:grid-cols-5' : 'md:grid-cols-3')}>
              <div className="space-y-1">
                <Label className="text-xs">Tecelão</Label>
                <Select value={form.weaver_id} onValueChange={v => { setForm(p => ({ ...p, weaver_id: v })); setWeaverSearch(''); }}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Tecelão" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" className="max-h-[200px]">
                    <div className="p-1"><Input placeholder="Buscar tecelão..." value={weaverSearch} onChange={e => { e.stopPropagation(); setWeaverSearch(e.target.value); }} className="h-7 text-xs" onKeyDown={e => e.stopPropagation()} /></div>
                    <SelectItem value="sem_tecelao">Sem Tecelão</SelectItem>
                    {weavers.filter(w => `${w.code} ${w.name}`.toLowerCase().includes(weaverSearch.toLowerCase())).map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Artigo</Label>
                <Select value={form.article_id} onValueChange={v => { setForm(p => ({ ...p, article_id: v })); setArticleSearch(''); }}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Artigo" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" className="max-h-[200px]">
                    <div className="p-1"><Input placeholder="Buscar artigo..." value={articleSearch} onChange={e => { e.stopPropagation(); setArticleSearch(e.target.value); }} className="h-7 text-xs" onKeyDown={e => e.stopPropagation()} /></div>
                    {filteredArticles.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.client_name})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {machineMode === 'voltas' ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Voltas Início</Label>
                    <Input type="number" className="h-9 w-full" value={form.voltas_inicio} onChange={e => setForm(p => ({ ...p, voltas_inicio: e.target.value }))} placeholder="Ex: 10000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Voltas Fim</Label>
                    <Input ref={rollsRef} type="number" className="h-9 w-full" value={form.voltas_fim} onChange={e => setForm(p => ({ ...p, voltas_fim: e.target.value }))} placeholder="Ex: 22000" />
                  </div>
                  {form.voltas_inicio && form.voltas_fim && Number(form.voltas_fim) > Number(form.voltas_inicio) && (
                    <div className="space-y-1 sm:col-span-2 md:col-span-1">
                      <Label className="text-xs">Peças (calculado)</Label>
                      <div className="flex min-h-9 items-center overflow-hidden rounded-md border border-border bg-muted/50 px-3 text-sm font-bold text-foreground">
                        <span className="truncate">{form.rolls ? (Math.round(Number(form.rolls) * 100) / 100).toFixed(2) : '—'}</span>
                        <span className="ml-1 truncate text-xs font-normal text-muted-foreground">
                          ({Number(form.voltas_fim) - Number(form.voltas_inicio)} voltas)
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Rolos Produzidos</Label>
                  <Input ref={rollsRef} type="number" className="h-9 w-full" value={form.rolls} onChange={e => setForm(p => ({ ...p, rolls: e.target.value }))} placeholder="Qtd rolos" />
                </div>
              )}
            </div>

            {extraArticles.map((ea, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-3 border-t border-dashed border-border/50 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Artigo Adicional {idx + 2}</Label>
                  <Select value={ea.article_id} onValueChange={v => setExtraArticles(prev => prev.map((e, i) => i === idx ? { ...e, article_id: v, search: '' } : e))}>
                    <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Artigo" /></SelectTrigger>
                    <SelectContent position="popper" side="bottom" className="max-h-[200px]">
                      <div className="p-1"><Input placeholder="Buscar artigo..." value={ea.search} onChange={e => { e.stopPropagation(); setExtraArticles(prev => prev.map((ex, i) => i === idx ? { ...ex, search: e.target.value } : ex)); }} className="h-7 text-xs" onKeyDown={e => e.stopPropagation()} /></div>
                      {articles.filter(a => a.name.toLowerCase().includes(ea.search.toLowerCase())).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.client_name})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rolos</Label>
                  <Input type="number" className="h-9 w-full" value={ea.rolls} onChange={e => setExtraArticles(prev => prev.map((ex, i) => i === idx ? { ...ex, rolls: e.target.value } : ex))} placeholder="Qtd" />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 justify-self-start text-destructive hover:text-destructive sm:justify-self-auto" onClick={() => setExtraArticles(prev => prev.filter((_, i) => i !== idx))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {!editing && (
              <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={() => setExtraArticles(prev => [...prev, { article_id: '', rolls: '', search: '' }])}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar Artigo
              </Button>
            )}
          </div>

          {/* Preview — fixed above footer, outside scroll */}
          {(() => {
            const previewTargetEff = (() => {
              if (!selectedArticle) return 80;
              const targets = [selectedArticle.target_efficiency || 80];
              for (const ea of extraArticles) {
                const art = articles.find(a => a.id === ea.article_id);
                if (art) targets.push(art.target_efficiency || 80);
              }
              return targets.reduce((s, t) => s + t, 0) / targets.length;
            })();

            // Calculate meta rolls for target and 100% efficiency
            const previewMeta100 = (() => {
              if (!selectedArticle || !form.rpm || !effectiveShiftMinutes) return 0;
              const rpm = Number(form.rpm);
              const maxTurns = rpm * effectiveShiftMinutes;
              const mainTurnsPerRoll = getTurnsForMachine(selectedArticle.id, form.machine_id);
              if (mainTurnsPerRoll <= 0) return 0;
              // For simplicity with multiple articles, use combined turns approach
              return maxTurns / mainTurnsPerRoll;
            })();
            const previewMetaTarget = previewMeta100 * (previewTargetEff / 100);

            return (
              <div className={cn("flex-shrink-0 rounded-lg border p-2", preview ? effBg(preview.efficiency, previewTargetEff) : 'bg-muted/30')}>
                {preview ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                        <div><span className="text-muted-foreground">Rolos </span><span className="font-semibold text-foreground">{preview.rolls}</span></div>
                        <div><span className="text-muted-foreground">Peso </span><span className="font-semibold text-foreground">{preview.weightKg.toFixed(1)}kg</span></div>
                        <div><span className="text-muted-foreground">Faturamento </span><span className="font-semibold text-foreground">R${preview.revenue.toFixed(2)}</span></div>
                      </div>
                      <div className={cn("text-base sm:text-lg font-bold", effColor(preview.efficiency, previewTargetEff))}>
                        {preview.efficiency.toFixed(2)}%
                      </div>
                    </div>
                    {previewMeta100 > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px] text-muted-foreground border-t border-border/50 pt-1">
                        <span>Meta {previewTargetEff.toFixed(0)}%: <span className="font-semibold text-foreground">{previewMetaTarget.toFixed(1)} rolos</span></span>
                        <span className="text-border">|</span>
                        <span>Meta 100%: <span className="font-semibold text-foreground">{previewMeta100.toFixed(1)} rolos</span></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-0.5 text-center text-[11px] text-muted-foreground">Preencha os campos para ver o preview</p>
                )}
              </div>
            );
          })()}

          <div className="flex-shrink-0 space-y-3 border-t pt-3">
            {saveQueue.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {saveQueue.map(q => (
                  <div key={q.id} className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                    q.status === 'saving' && "bg-muted border-border text-muted-foreground",
                    q.status === 'done' && "bg-emerald-50 border-emerald-200 text-emerald-700",
                    q.status === 'error' && "bg-destructive/10 border-destructive/30 text-destructive",
                  )}>
                    {q.status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {q.status === 'done' && <CheckCircle2 className="h-3 w-3" />}
                    {q.status === 'error' && <AlertTriangle className="h-3 w-3" />}
                    {q.machineName}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="hidden text-xs text-muted-foreground sm:block">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">Enter</kbd> para salvar
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button onClick={handleSave} className="btn-gradient flex-1 sm:flex-none" disabled={saving}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  <span className="truncate">{editing ? 'Salvar' : 'Registrar e Próximo'}</span>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir produção de {showDelete?.machine_name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
