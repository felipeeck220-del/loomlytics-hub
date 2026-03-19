import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, CalendarIcon, Pencil, Loader2, ChevronRight, ChevronDown, ChevronUp, Filter, X, Trash2, Clock, FileText, TrendingUp, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, type Production, getCompanyShiftMinutes, getCompanyShiftLabels } from '@/types';
import { formatNumber, formatCurrency } from '@/lib/formatters';

type SaveQueueItem = {
  id: string;
  machineName: string;
  status: 'saving' | 'done' | 'error';
};

const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];

export default function ProductionPage() {
  const { getProductions, addProductions, updateProductions, deleteProductions, getMachines, getWeavers, getArticles, getArticleMachineTurns, shiftSettings, loading } = useSharedCompanyData();
  const companyShiftMinutes = useMemo(() => getCompanyShiftMinutes(shiftSettings), [shiftSettings]);
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const productions = getProductions();
  const machines = getMachines();
  const weavers = getWeavers();
  const articles = getArticles();
  const articleMachineTurns = getArticleMachineTurns();

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
  });

  // Extra articles (for split-shift production)
  const [extraArticles, setExtraArticles] = useState<{ article_id: string; rolls: string; search: string }[]>([]);

  const rollsRef = useRef<HTMLInputElement>(null);

  const selectedMachine = machines.find(m => m.id === form.machine_id);
  const selectedArticle = articles.find(a => a.id === form.article_id);

  const currentMachineIndex = sortedMachines.findIndex(m => m.id === form.machine_id);
  const currentShiftIndex = SHIFTS.indexOf(form.shift as ShiftType);

  const handleMachineChange = (id: string) => {
    const m = machines.find(x => x.id === id);
    setForm(p => ({ ...p, machine_id: id, rpm: m ? String(m.rpm) : '' }));
  };

  // Get turns for a specific article+machine combo
  const getTurnsForMachine = (articleId: string, machineId: string): number => {
    const specific = articleMachineTurns.find(t => t.article_id === articleId && t.machine_id === machineId);
    if (specific) return specific.turns_per_roll;
    const article = articles.find(a => a.id === articleId);
    return article?.turns_per_roll || 0;
  };

  const preview = useMemo(() => {
    if (!form.shift || !form.rpm || !form.rolls || !selectedArticle) return null;
    const shiftMinutes = companyShiftMinutes[form.shift as ShiftType];
    const rpm = Number(form.rpm);
    const maxTurns = rpm * shiftMinutes;

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
  }, [form.shift, form.rpm, form.rolls, selectedArticle, form.machine_id, articleMachineTurns, extraArticles, articles, companyShiftMinutes]);

  const advanceToNext = useCallback(() => {
    if (sortedMachines.length === 0) return;
    const nextMachineIdx = currentMachineIndex + 1;
    if (nextMachineIdx < sortedMachines.length) {
      const nextMachine = sortedMachines[nextMachineIdx];
      setForm(p => ({ ...p, machine_id: nextMachine.id, rpm: String(nextMachine.rpm), rolls: '', weaver_id: 'sem_tecelao', article_id: '' }));
      setArticleSearch(''); setWeaverSearch(''); setExtraArticles([]);
    } else {
      const nextShiftIdx = currentShiftIndex + 1;
      if (nextShiftIdx < SHIFTS.length) {
        const firstMachine = sortedMachines[0];
        setForm(p => ({ ...p, shift: SHIFTS[nextShiftIdx], machine_id: firstMachine.id, rpm: String(firstMachine.rpm), rolls: '', weaver_id: 'sem_tecelao', article_id: '' }));
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
    setForm({ date: new Date(), shift: SHIFTS[0], machine_id: firstMachine?.id || '', weaver_id: 'sem_tecelao', article_id: '', rpm: firstMachine ? String(firstMachine.rpm) : '', rolls: '' });
    setArticleSearch(''); setWeaverSearch(''); setExtraArticles([]); setEditingGroupItems([]); setSaveQueue([]);
    setShowModal(true);
  };

  const openEditGroup = (group: ProductionGroup) => {
    const first = group.items[0];
    setEditing(first);
    setForm({ date: new Date(first.date + 'T12:00:00'), shift: first.shift, machine_id: first.machine_id, weaver_id: first.weaver_id || 'sem_tecelao', article_id: first.article_id, rpm: String(first.rpm), rolls: String(first.rolls_produced) });
    // Load additional articles from the group
    const extras = group.items.slice(1).map(p => ({ article_id: p.article_id, rolls: String(p.rolls_produced), search: '' }));
    setExtraArticles(extras);
    setEditingGroupItems(group.items);
    setShowModal(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.shift || !form.machine_id || !form.article_id || !form.rolls) {
      toast.error('Preencha todos os campos obrigatórios'); return;
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
      });
    }

    // For editing: update synchronously
    if (isEditing) {
      setSaving(true);
      try {
        const oldIds = editingGroupItems.map(i => i.id);
        await updateProductions(oldIds, newRecords);
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

    addProductions(newRecords).then(() => {
      setSaveQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      setTimeout(() => {
        setSaveQueue(prev => prev.filter(q => q.id !== queueId));
      }, 3000);
    }).catch(() => {
      setSaveQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error' } : q));
      toast.error(`Erro ao salvar produção — ${machineName}`);
    });
  }, [form, preview, saving, productions, selectedMachine, selectedArticle, weavers, editing, editingGroupItems, addProductions, updateProductions, advanceToNext, extraArticles, articles, companyShiftLabels]);

  const handleDelete = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    if (!showDelete) return;
    const group = shiftProductionGroups.find(g => g.items.some(i => i.id === showDelete.id));
    const idsToDelete = group ? group.items.map(i => i.id) : [showDelete.id];
    await deleteProductions(idsToDelete);
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
  const effColor = (eff: number) => eff >= 80 ? 'text-emerald-600' : eff >= 75 ? 'text-warning' : 'text-destructive';
  const effBg = (eff: number) => eff >= 80 ? 'bg-emerald-50' : eff >= 75 ? 'bg-yellow-50' : 'bg-red-50';

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

  // Calculate meta for a production record
  const calcMeta = (p: Production) => {
    const article = articles.find(a => a.id === p.article_id);
    if (!article) return { meta80: 0, meta100: 0, metaRolls: 0 };
    const turnsPerRoll = getTurnsForMachine(p.article_id, p.machine_id);
    const shiftMinutes = companyShiftMinutes[p.shift] || 510;
    const maxTurns = p.rpm * shiftMinutes;
    const metaRolls = turnsPerRoll > 0 ? maxTurns / turnsPerRoll : 0;
    return { meta80: metaRolls * 0.8, meta100: metaRolls, metaRolls };
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
                  <span className="text-sm text-muted-foreground">Valor</span>
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
                
                // For meta calculation, use combined turns approach
                const calcGroupMeta = () => {
                  const shiftMinutes = companyShiftMinutes[group.shift as ShiftType] || 510;
                  const maxTurns = group.rpm * shiftMinutes;
                  const metaRolls80 = group.items.reduce((sum, p) => {
                    const turnsPerRoll = getTurnsForMachine(p.article_id, p.machine_id);
                    const articleMaxTurns = maxTurns; // shared RPM
                    const articleMetaRolls = turnsPerRoll > 0 ? articleMaxTurns / turnsPerRoll : 0;
                    return sum + articleMetaRolls * 0.8 * (p.rolls_produced / (group.totalRolls || 1));
                  }, 0);
                  // Use the first item's article for simple meta display
                  const mainArticle = articles.find(a => a.id === firstItem.article_id);
                  const mainTurnsPerRoll = getTurnsForMachine(firstItem.article_id, firstItem.machine_id);
                  const mainMetaRolls = mainTurnsPerRoll > 0 ? maxTurns / mainTurnsPerRoll : 0;
                  return { meta80: mainMetaRolls * 0.8, meta100: mainMetaRolls, metaRolls: mainMetaRolls };
                };
                const meta = calcGroupMeta();
                const meta80Reached = group.totalRolls >= meta.meta80;

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
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Rolos</p>
                          <p className="font-bold text-foreground">{group.totalRolls}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Meta 80%</p>
                          <div className="flex items-center gap-1">
                            <span className={meta80Reached ? 'text-emerald-500' : 'text-destructive'}>
                              {meta80Reached ? '✓' : '✗'}
                            </span>
                            <span className="font-bold text-foreground">{formatNumber(meta.meta80, 2)}</span>
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">% Atingida</p>
                          <Badge className={cn("text-xs font-bold", effBg(group.efficiency), effColor(group.efficiency))}>
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
                                {p.article_name} {article?.client_name ? `(${article.client_name})` : ''} — {p.rolls_produced} rolos, {formatNumber(Number(p.weight_kg), 2)} kg, {formatCurrency(Number(p.revenue))}
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
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Valor</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatCurrency(group.totalRevenue)}</p>
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Meta</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatNumber(meta.metaRolls, 2)} rolos</p>
                          </div>
                        </div>

                        {/* Meta status + efficiency */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className={cn("rounded-lg border p-3", meta80Reached ? 'border-emerald-200 bg-emerald-50' : 'border-yellow-200 bg-yellow-50')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", meta80Reached ? 'text-emerald-600' : 'text-yellow-700')}>Meta 80%</p>
                              <Target className={cn("h-4 w-4", meta80Reached ? 'text-emerald-500' : 'text-yellow-500')} />
                            </div>
                            <p className={cn("text-lg font-bold", meta80Reached ? 'text-emerald-700' : 'text-yellow-800')}>{formatNumber(meta.meta80, 2)} rolos</p>
                            <p className={cn("text-xs", meta80Reached ? 'text-emerald-600' : 'text-yellow-600')}>
                              {meta80Reached ? '✓ Atingida' : '✗ Não atingida'}
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
                          <div className={cn("rounded-lg border p-3", effBg(group.efficiency), group.efficiency >= 80 ? 'border-emerald-200' : group.efficiency >= 75 ? 'border-yellow-200' : 'border-red-200')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", effColor(group.efficiency))}>% Produção</p>
                              <TrendingUp className={cn("h-4 w-4", effColor(group.efficiency))} />
                            </div>
                            <p className={cn("text-lg font-bold", effColor(group.efficiency))}>{formatNumber(group.efficiency, 2)}%</p>
                            <p className={cn("text-xs flex items-center gap-1", effColor(group.efficiency))}>
                              {group.efficiency >= 80 ? '✓ Dentro da meta' : (
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
                          <div className={cn("rounded-lg border p-3", group.efficiency < 80 ? 'border-red-200 bg-red-50' : 'border-border bg-background')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", group.efficiency < 80 ? 'text-red-600' : 'text-muted-foreground')}>Tempo Parada</p>
                              <Clock className={cn("h-4 w-4", group.efficiency < 80 ? 'text-red-500' : 'text-muted-foreground')} />
                            </div>
                            {(() => {
                              const shiftMin = companyShiftMinutes[group.shift as ShiftType] || 510;
                              const usedMin = shiftMin * (group.efficiency / 100);
                              const downMin = shiftMin - usedMin;
                              const hours = Math.floor(downMin / 60);
                              const mins = Math.round(downMin % 60);
                              return (
                                <>
                                  <p className={cn("text-lg font-bold mt-1", group.efficiency < 80 ? 'text-red-700' : 'text-foreground')}>
                                    {hours}h{mins > 0 ? `${mins}min` : ''}
                                  </p>
                                  <p className={cn("text-xs", group.efficiency < 80 ? 'text-red-600' : 'text-muted-foreground')}>Tempo inativo</p>
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
      <Dialog open={showModal} onOpenChange={(open) => { if (!open && hasPendingSaves) return; if (!open) return; setShowModal(open); }}>
        <DialogContent className="w-[80vw] max-w-[80vw] h-[80vh] max-h-[80vh] flex flex-col" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              {editing ? 'Editar Produção' : 'Registrar Produção'}
              {!editing && form.shift && selectedMachine && (
                <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {companyShiftLabels[form.shift as ShiftType]?.split(' (')[0]} · {selectedMachine.name}
                  {currentMachineIndex >= 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">{currentMachineIndex + 1}/{sortedMachines.length}</Badge>
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
                  <SelectContent>{Object.entries(companyShiftLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
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
                <Input type="number" className="h-9" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tecelão</Label>
                <Select value={form.weaver_id} onValueChange={v => { setForm(p => ({ ...p, weaver_id: v })); setWeaverSearch(''); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Tecelão" /></SelectTrigger>
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
                  <SelectTrigger className="h-9"><SelectValue placeholder="Artigo" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" className="max-h-[200px]">
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

            {/* Extra Articles */}
            {extraArticles.map((ea, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end border-t border-dashed border-border/50 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Artigo Adicional {idx + 2}</Label>
                  <Select value={ea.article_id} onValueChange={v => setExtraArticles(prev => prev.map((e, i) => i === idx ? { ...e, article_id: v, search: '' } : e))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Artigo" /></SelectTrigger>
                    <SelectContent position="popper" side="bottom" className="max-h-[200px]">
                      <div className="p-1"><Input placeholder="Buscar artigo..." value={ea.search} onChange={e => { e.stopPropagation(); setExtraArticles(prev => prev.map((ex, i) => i === idx ? { ...ex, search: e.target.value } : ex)); }} className="h-7 text-xs" onKeyDown={e => e.stopPropagation()} /></div>
                      {articles.filter(a => a.name.toLowerCase().includes(ea.search.toLowerCase())).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.client_name})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rolos</Label>
                  <Input type="number" className="h-9" value={ea.rolls} onChange={e => setExtraArticles(prev => prev.map((ex, i) => i === idx ? { ...ex, rolls: e.target.value } : ex))} placeholder="Qtd" />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setExtraArticles(prev => prev.filter((_, i) => i !== idx))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {!editing && (
              <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={() => setExtraArticles(prev => [...prev, { article_id: '', rolls: '', search: '' }])}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Artigo
              </Button>
            )}

            {/* Preview */}
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

          <div className="flex-shrink-0 border-t pt-4 space-y-3">
            {/* Save Queue Status */}
            {saveQueue.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {saveQueue.map(q => (
                  <div key={q.id} className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
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

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Pressione <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono border">Enter</kbd> para salvar</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={hasPendingSaves}>
                  {hasPendingSaves ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando...</> : 'Fechar'}
                </Button>
                <Button onClick={handleSave} className="btn-gradient" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editing ? 'Salvar' : 'Registrar e Próximo'}
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
