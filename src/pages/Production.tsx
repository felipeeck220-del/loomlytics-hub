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
import { Plus, CalendarIcon, Pencil, Loader2, ChevronRight, ChevronDown, ChevronUp, Filter, X, Trash2, Clock, FileText, TrendingUp, Target, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, SHIFT_MINUTES, type ShiftType, type Production, getCompanyShiftMinutes, getCompanyShiftLabels } from '@/types';
import { formatNumber, formatCurrency } from '@/lib/formatters';

const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];

export default function ProductionPage() {
  const { getProductions, saveProductions, getMachines, getWeavers, getArticles, getArticleMachineTurns, shiftSettings, loading } = useSharedCompanyData();
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

  const [form, setForm] = useState({
    date: new Date(), shift: '' as ShiftType | '', machine_id: '', weaver_id: '', article_id: '', rpm: '', rolls: '',
  });

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
    const rolls = Number(form.rolls);
    const turnsPerRoll = getTurnsForMachine(selectedArticle.id, form.machine_id);
    const maxTurns = rpm * shiftMinutes;
    const producedTurns = rolls * turnsPerRoll;
    const efficiency = maxTurns > 0 ? (producedTurns / maxTurns) * 100 : 0;
    const weightKg = rolls * selectedArticle.weight_per_roll;
    const revenue = weightKg * selectedArticle.value_per_kg;
    return { efficiency: Math.min(efficiency, 100), weightKg, revenue, rolls };
  }, [form.shift, form.rpm, form.rolls, selectedArticle, form.machine_id, articleMachineTurns]);

  const advanceToNext = useCallback(() => {
    if (sortedMachines.length === 0) return;
    const nextMachineIdx = currentMachineIndex + 1;
    if (nextMachineIdx < sortedMachines.length) {
      const nextMachine = sortedMachines[nextMachineIdx];
      setForm(p => ({ ...p, machine_id: nextMachine.id, rpm: String(nextMachine.rpm), rolls: '', weaver_id: '', article_id: '' }));
      setArticleSearch(''); setWeaverSearch('');
    } else {
      const nextShiftIdx = currentShiftIndex + 1;
      if (nextShiftIdx < SHIFTS.length) {
        const firstMachine = sortedMachines[0];
        setForm(p => ({ ...p, shift: SHIFTS[nextShiftIdx], machine_id: firstMachine.id, rpm: String(firstMachine.rpm), rolls: '', weaver_id: '', article_id: '' }));
        setArticleSearch(''); setWeaverSearch('');
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
    setForm({ date: new Date(), shift: SHIFTS[0], machine_id: firstMachine?.id || '', weaver_id: '', article_id: '', rpm: firstMachine ? String(firstMachine.rpm) : '', rolls: '' });
    setArticleSearch(''); setWeaverSearch('');
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
      id: editing?.id || crypto.randomUUID(), company_id: '',
      date: format(form.date, 'yyyy-MM-dd'), shift: form.shift as ShiftType,
      machine_id: form.machine_id, machine_name: machineName,
      weaver_id: form.weaver_id, weaver_name: weaverName,
      article_id: form.article_id, article_name: articleName,
      rpm: Number(form.rpm), rolls_produced: Number(form.rolls),
      weight_kg: preview.weightKg, revenue: preview.revenue,
      efficiency: preview.efficiency, created_at: editing?.created_at || new Date().toISOString(),
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
    if (editing) setShowModal(false);
    else advanceToNext();
  }, [form, preview, saving, productions, selectedMachine, selectedArticle, weavers, editing, saveProductions, advanceToNext]);

  const handleDelete = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    const all = productions.filter(p => p.id !== showDelete?.id);
    await saveProductions(all);
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

  // Group by shift
  const shiftProductions = useMemo(() => {
    return filteredProductions
      .filter(p => p.shift === activeShift)
      .sort((a, b) => {
        const mA = machines.find(m => m.id === a.machine_id);
        const mB = machines.find(m => m.id === b.machine_id);
        return (mA?.number || 0) - (mB?.number || 0);
      });
  }, [filteredProductions, activeShift, machines]);

  // KPIs for active shift
  const shiftKPIs = useMemo(() => {
    const prods = shiftProductions;
    const totalRolls = prods.reduce((s, p) => s + p.rolls_produced, 0);
    const totalWeight = prods.reduce((s, p) => s + Number(p.weight_kg), 0);
    const totalRevenue = prods.reduce((s, p) => s + Number(p.revenue), 0);
    const avgEfficiency = prods.length > 0 ? prods.reduce((s, p) => s + p.efficiency, 0) / prods.length : 0;
    return { totalRolls, totalWeight, totalRevenue, avgEfficiency, count: prods.length };
  }, [shiftProductions]);

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
              {shiftProductions.map(p => {
                const isExpanded = expandedId === p.id;
                const meta = calcMeta(p);
                const article = articles.find(a => a.id === p.article_id);
                const meta80Reached = p.rolls_produced >= meta.meta80;
                const meta100Reached = p.rolls_produced >= meta.meta100;

                return (
                  <div key={p.id} className="card-glass overflow-hidden">
                    {/* Row Header */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-foreground text-lg">{p.machine_name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {p.weaver_name || 'Sem tecelão definido'} -- Artigo: {p.article_name}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Rolos</p>
                          <p className="font-bold text-foreground">{p.rolls_produced}</p>
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
                          <Badge className={cn("text-xs font-bold", effBg(p.efficiency), effColor(p.efficiency))}>
                            {formatNumber(p.efficiency, 2)}%
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDelete(p); setDeleteWord(''); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-border p-5 space-y-4 bg-muted/20">
                        {/* Article */}
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-1">Artigo:</p>
                          <p className="text-sm text-muted-foreground">{p.article_name} {article?.client_name ? `(${article.client_name})` : ''}</p>
                        </div>

                        {/* Main metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Rolos</p>
                            <p className="text-xl font-display font-bold text-blue-800">{p.rolls_produced}</p>
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Peso</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatNumber(Number(p.weight_kg), 2)} kg</p>
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                            <p className="text-xs text-blue-600 font-medium">Valor</p>
                            <p className="text-xl font-display font-bold text-blue-800">{formatCurrency(Number(p.revenue))}</p>
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
                          <div className={cn("rounded-lg border p-3", meta100Reached ? 'border-emerald-200 bg-emerald-50' : 'border-yellow-200 bg-yellow-50')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", meta100Reached ? 'text-emerald-600' : 'text-yellow-700')}>Meta 100%</p>
                              <Target className={cn("h-4 w-4", meta100Reached ? 'text-emerald-500' : 'text-yellow-500')} />
                            </div>
                            <p className={cn("text-lg font-bold", meta100Reached ? 'text-emerald-700' : 'text-yellow-800')}>{formatNumber(meta.meta100, 2)} rolos</p>
                            <p className={cn("text-xs", meta100Reached ? 'text-emerald-600' : 'text-yellow-600')}>
                              {meta100Reached ? '✓ Atingida' : '✗ Não atingida'}
                            </p>
                          </div>
                          <div className={cn("rounded-lg border p-3", effBg(p.efficiency), p.efficiency >= 80 ? 'border-emerald-200' : p.efficiency >= 75 ? 'border-yellow-200' : 'border-red-200')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", effColor(p.efficiency))}>% Produção</p>
                              <TrendingUp className={cn("h-4 w-4", effColor(p.efficiency))} />
                            </div>
                            <p className={cn("text-lg font-bold", effColor(p.efficiency))}>{formatNumber(p.efficiency, 2)}%</p>
                            <p className={cn("text-xs flex items-center gap-1", effColor(p.efficiency))}>
                              {p.efficiency >= 80 ? '✓ Dentro da meta' : (
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
                            <p className="text-sm font-semibold text-foreground mt-1">{format(new Date(p.date), 'dd/MM/yyyy')}</p>
                          </div>
                          <div className={cn("rounded-lg border p-3", p.efficiency < 80 ? 'border-red-200 bg-red-50' : 'border-border bg-background')}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-medium", p.efficiency < 80 ? 'text-red-600' : 'text-muted-foreground')}>Tempo Parada</p>
                              <Clock className={cn("h-4 w-4", p.efficiency < 80 ? 'text-red-500' : 'text-muted-foreground')} />
                            </div>
                            {(() => {
                              const shiftMin = companyShiftMinutes[p.shift] || 510;
                              const usedMin = shiftMin * (p.efficiency / 100);
                              const downMin = shiftMin - usedMin;
                              const hours = Math.floor(downMin / 60);
                              const mins = Math.round(downMin % 60);
                              return (
                                <>
                                  <p className={cn("text-lg font-bold mt-1", p.efficiency < 80 ? 'text-red-700' : 'text-foreground')}>
                                    {hours}h{mins > 0 ? `${mins}min` : ''}
                                  </p>
                                  <p className={cn("text-xs", p.efficiency < 80 ? 'text-red-600' : 'text-muted-foreground')}>Tempo inativo</p>
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

              {shiftProductions.length === 0 && (
                <div className="text-center text-muted-foreground py-12">Nenhum registro de produção para este turno</div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Register/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) return; setShowModal(open); }}>
        <DialogContent className="sm:max-w-3xl flex flex-col" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
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
                <Input type="number" className="h-9" value={form.rpm} onChange={e => setForm(p => ({ ...p, rpm: e.target.value }))} />
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
