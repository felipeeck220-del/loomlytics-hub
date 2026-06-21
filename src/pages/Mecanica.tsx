import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
  import { Wrench, ChevronLeft, ChevronRight, Search, History, Plus, Loader2, Filter, Pencil, Trash2, Package, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS, type MachineStatus, type MachineLog } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getDateLimits, isDateValid } from '@/lib/formatters';
import { usePermissions } from '@/hooks/usePermissions';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

const MAINTENANCE_STATUSES: MachineStatus[] = [
  'manutencao_preventiva',
  'manutencao_corretiva',
  'troca_artigo',
  'troca_agulhas',
];

export default function MecanicaPage() {
   const { 
     getMachines, getMachineLogs, getProductions, saveMachineLogs, 
     getNeedles, saveNeedles, getNeedleTransactions, addNeedleTransaction,
     updateNeedleTransaction, deleteNeedleTransaction,
     getSinkers, saveSinkers, getSinkerTransactions, addSinkerTransaction,
     updateSinkerTransaction, deleteSinkerTransaction,
     getCylinders, saveCylinders, assignCylinderToMachine,
     getMachineNeedleRefs, getMachineSinkerRefs,
     loading 
   } = useSharedCompanyData();
   const needles = getNeedles();
   const needleTransactions = getNeedleTransactions();
   const sinkers = getSinkers();
   const sinkerTransactions = getSinkerTransactions();
   const cylinders = getCylinders();
   const machineNeedleRefs = getMachineNeedleRefs();
   const machineSinkerRefs = getMachineSinkerRefs();
   // Needle Management State
   const [needleSearch, setNeedleSearch] = useState('');
   const [showNeedleModal, setShowNeedleModal] = useState(false);
   const [showEntryModal, setShowEntryModal] = useState(false);
   const [showExitModal, setShowExitModal] = useState(false);
   const [needleForm, setNeedleForm] = useState({ provider: '', brand: '', reference_code: '' });
   const [entryForm, setEntryForm] = useState({ needle_id: '', quantity: '', date: format(new Date(), 'yyyy-MM-dd') });
   const [exitForm, setExitForm] = useState({ needle_id: '', quantity: '', machine_id: '', mode: 'reposicao' as 'reposicao' | 'troca_agulheiro', date: format(new Date(), 'yyyy-MM-dd') });
   const [needleEntrySearch, setNeedleEntrySearch] = useState('');
   const [needleExitSearch, setNeedleExitSearch] = useState('');
   const [editTxn, setEditTxn] = useState<any>(null);
   const [editForm, setEditForm] = useState({ quantity: '', date: '', machine_id: '', kind: 'entry' as 'entry' | 'reposicao' | 'troca_agulheiro' });
   const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null);
   const [needleHistoryPage, setNeedleHistoryPage] = useState(1);
   const [needleUsageView, setNeedleUsageView] = useState<{ id: string; brand: string; reference_code: string } | null>(null);
   const [sinkerUsageView, setSinkerUsageView] = useState<{ id: string; brand: string; reference_code: string } | null>(null);
   const NEEDLE_HISTORY_PER_PAGE = 15;

   // Sinker Management State (Platinas)
   const [sinkerSearch, setSinkerSearch] = useState('');
   const [showSinkerModal, setShowSinkerModal] = useState(false);
   const [showSinkerEntryModal, setShowSinkerEntryModal] = useState(false);
   const [showSinkerExitModal, setShowSinkerExitModal] = useState(false);
   const [sinkerForm, setSinkerForm] = useState({ provider: '', brand: '', reference_code: '' });
   const [sinkerEntryForm, setSinkerEntryForm] = useState({ sinker_id: '', quantity: '', date: format(new Date(), 'yyyy-MM-dd') });
   const [sinkerExitForm, setSinkerExitForm] = useState({ sinker_id: '', quantity: '', machine_id: '', mode: 'reposicao' as 'reposicao' | 'troca_platinas', date: format(new Date(), 'yyyy-MM-dd') });
   const [sinkerEditTxn, setSinkerEditTxn] = useState<any>(null);
   const [sinkerEditForm, setSinkerEditForm] = useState({ quantity: '', date: '', machine_id: '', kind: 'entry' as 'entry' | 'reposicao' | 'troca_platinas' });
   const [deleteSinkerTxnId, setDeleteSinkerTxnId] = useState<string | null>(null);
   const [sinkerHistoryPage, setSinkerHistoryPage] = useState(1);
   const SINKER_HISTORY_PER_PAGE = 15;

   // Cylinder Management State
   const [cylinderSearch, setCylinderSearch] = useState('');
   const [showCylinderModal, setShowCylinderModal] = useState(false);
   const [editingCylinder, setEditingCylinder] = useState<any>(null);
    const [cylinderForm, setCylinderForm] = useState({ 
      brand: '', model: '', diameter: '', fineness: '', 
      needle_quantity: '', feeder_quantity: '', sinker_quantity: '', observations: '' 
    });
   const [showAssignModal, setShowAssignModal] = useState(false);
   const [assignForm, setAssignForm] = useState({ machine_id: '', cylinder_id: '' });
  
 
  const { canSeeFinancial } = usePermissions();
  const machines = getMachines();
  const machineLogs = getMachineLogs();
  const productions = getProductions();
  const { logAction, userName, userCode } = useAuditLog();
  const [selectedMachineId, setSelectedMachineId] = useState<string>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [detailsSearch, setDetailsSearch] = useState('');
  const [historyMachineId, setHistoryMachineId] = useState<string | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [scheduleHistoryMachineId, setScheduleHistoryMachineId] = useState<string | null>(null);
  const [obsByLogId, setObsByLogId] = useState<Record<string, { observation: string; created_at: string }[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMachineId, setAddMachineId] = useState('');
  const [addStatus, setAddStatus] = useState<string>('manutencao_preventiva');
  const [addStartDate, setAddStartDate] = useState('');
  const [addStartTime, setAddStartTime] = useState('08:00');
  const [addEndDate, setAddEndDate] = useState('');
  const [addEndTime, setAddEndTime] = useState('');
  const [saving, setSaving] = useState(false);

  const activeMachines = useMemo(() => machines.filter(m => m.status !== 'inativa'), [machines]);

  const maintenanceLogs = useMemo(() => {
    return machineLogs.filter(log => {
      const status = log.status as MachineStatus;
      const matchStatus = MAINTENANCE_STATUSES.includes(status);
      const matchMachine = selectedMachineId === 'all' || log.machine_id === selectedMachineId;
      return matchStatus && matchMachine;
    });
  }, [machineLogs, selectedMachineId]);

  // Get all logs of a status for a machine, sorted newest first
  const getLogsByStatus = (machineId: string, status: MachineStatus) => {
    return machineLogs
      .filter(l => l.machine_id === machineId && l.status === status)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  };

  const getLastLogByStatus = (machineId: string, status: MachineStatus) => {
    return getLogsByStatus(machineId, status)[0] || null;
  };

  // Calculate revenue/weight between two dates for a machine
  const calcPeriod = (machineId: string, fromDate: string, toDate: string) => {
    const prods = productions.filter(p => p.machine_id === machineId && p.date >= fromDate && p.date <= toDate);
    return {
      revenue: prods.reduce((s, p) => s + p.revenue, 0),
      weight: prods.reduce((s, p) => s + p.weight_kg, 0),
    };
  };

  const lastPreventive = useMemo(() => {
    if (selectedMachineId === 'all') return null;
    return getLastLogByStatus(selectedMachineId, 'manutencao_preventiva');
  }, [machineLogs, selectedMachineId]);

  const lastNeedleChange = useMemo(() => {
    if (selectedMachineId === 'all') return null;
    return getLastLogByStatus(selectedMachineId, 'troca_agulhas');
  }, [machineLogs, selectedMachineId]);

  const lastSinkerChange = useMemo(() => {
    if (selectedMachineId === 'all') return null;
    const m = machines.find(m => m.id === selectedMachineId);
    if (m?.last_sinker_change_at) return { started_at: m.last_sinker_change_at };
    return null;
  }, [machines, selectedMachineId]);

  // Calendar
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const dayEventsMap = useMemo(() => {
    const map = new Map<string, typeof maintenanceLogs>();
    maintenanceLogs.forEach(log => {
      const dateKey = format(new Date(log.started_at), 'yyyy-MM-dd');
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(log);
    });
    return map;
  }, [maintenanceLogs]);

  const selectedDayLogs = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return dayEventsMap.get(key) || [];
  }, [selectedDay, dayEventsMap]);

  const getMachineName = (machineId: string) => {
    return machines.find(m => m.id === machineId)?.name || 'Máquina desconhecida';
  };

  // Detalhes tab: revenue/kg from end of last maintenance to today
  const detailsData = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return activeMachines.map(machine => {
      const lastPrev = getLastLogByStatus(machine.id, 'manutencao_preventiva');
      const lastNeedle = getLastLogByStatus(machine.id, 'troca_agulhas');

      // From end of last preventive (or its start if no end) to today
      const prevFromDate = lastPrev
        ? format(new Date(lastPrev.ended_at || lastPrev.started_at), 'yyyy-MM-dd')
        : '2000-01-01';
      const prevPeriod = calcPeriod(machine.id, prevFromDate, today);

      // From last needle change (date from machine field or last log) to today
      const machineLastNeedle = machine.last_needle_change_at 
        ? format(new Date(machine.last_needle_change_at), 'yyyy-MM-dd')
        : lastNeedle 
          ? format(new Date(lastNeedle.ended_at || lastNeedle.started_at), 'yyyy-MM-dd')
          : '2000-01-01';
          
      const needleFromDate = machineLastNeedle;
      const needlePeriod = calcPeriod(machine.id, needleFromDate, today);

      return {
        machine, lastPrev, lastNeedle,
        revenueSincePreventive: prevPeriod.revenue,
        revenueSinceNeedle: needlePeriod.revenue,
        weightSincePreventive: prevPeriod.weight,
        weightSinceNeedle: needlePeriod.weight,
      };
    });
  }, [activeMachines, productions, machineLogs]);

  // History: all logs of a machine, period = end of previous same-type log → start of current log
  const historyData = useMemo(() => {
    if (!historyMachineId) return [];

    const relevantLogs = machineLogs
      .filter(l => l.machine_id === historyMachineId && (l.status === 'manutencao_preventiva' || l.status === 'troca_agulhas'))
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    return relevantLogs.map(log => {
      const logStartDate = format(new Date(log.started_at), 'yyyy-MM-dd');

      // Find previous log of same type (older)
      const sameTypeLogs = relevantLogs.filter(l => l.status === log.status);
      const currentIdx = sameTypeLogs.indexOf(log);
      const prevLog = currentIdx < sameTypeLogs.length - 1 ? sameTypeLogs[currentIdx + 1] : null;

      // Period: from end of previous same-type log to start of this log
      const fromDate = prevLog
        ? format(new Date(prevLog.ended_at || prevLog.started_at), 'yyyy-MM-dd')
        : '2000-01-01';

      const period = calcPeriod(historyMachineId, fromDate, logStartDate);

      return { log, revenue: period.revenue, weight: period.weight, fromDate };
    });
  }, [historyMachineId, machineLogs, productions]);

  const historyMachineName = historyMachineId ? getMachineName(historyMachineId) : '';

  // ============ Programação de Manutenções (Calendário em tabela) ============
  const MAINTENANCE_INTERVAL_DAYS = 30;

  const scheduleRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return activeMachines.map(m => {
      const allPrev = getLogsByStatus(m.id, 'manutencao_preventiva');
      const last = allPrev[0] || null;
      const lastDate = last ? new Date(last.ended_at || last.started_at) : null;
      const nextDate = lastDate ? new Date(lastDate.getTime() + MAINTENANCE_INTERVAL_DAYS * 86400000) : null;
      const daysLeft = nextDate ? Math.ceil((nextDate.getTime() - today.getTime()) / 86400000) : null;
      let durationMin: number | null = null;
      if (last?.started_at && last?.ended_at) {
        durationMin = Math.max(0, (new Date(last.ended_at).getTime() - new Date(last.started_at).getTime()) / 60000);
      }
      return { machine: m, last, lastDate, nextDate, daysLeft, durationMin, historyCount: allPrev.length };
    });
  }, [activeMachines, machineLogs]);

  const filteredScheduleRows = useMemo(() => {
    const q = scheduleSearch.trim().toLowerCase();
    if (!q) return scheduleRows;
    return scheduleRows.filter(r =>
      r.machine.name.toLowerCase().includes(q) ||
      (r.machine.model || '').toLowerCase().includes(q) ||
      (r.machine.diameter || '').toLowerCase().includes(q) ||
      (r.machine.fineness || '').toLowerCase().includes(q)
    );
  }, [scheduleRows, scheduleSearch]);

  const scheduleHistoryRows = useMemo(() => {
    if (!scheduleHistoryMachineId) return [];
    return getLogsByStatus(scheduleHistoryMachineId, 'manutencao_preventiva');
  }, [scheduleHistoryMachineId, machineLogs]);

  // Carrega observações dos logs de manutenção preventiva visíveis (linha principal + histórico aberto)
  useEffect(() => {
    const logIds = new Set<string>();
    scheduleRows.forEach(r => { if (r.last?.id) logIds.add(r.last.id); });
    scheduleHistoryRows.forEach(l => logIds.add(l.id));
    const missing = Array.from(logIds).filter(id => !(id in obsByLogId));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from as any)('machine_maintenance_observations')
        .select('machine_log_id, observation, created_at')
        .in('machine_log_id', missing)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      setObsByLogId(prev => {
        const next = { ...prev };
        missing.forEach(id => { if (!(id in next)) next[id] = []; });
        (data || []).forEach((row: any) => {
          if (!next[row.machine_log_id]) next[row.machine_log_id] = [];
          next[row.machine_log_id].push({ observation: row.observation, created_at: row.created_at });
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [scheduleRows, scheduleHistoryRows]);

  const formatDuration = (mins: number | null) => {
    if (mins == null) return '—';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  };

  const daysLeftCellClass = (d: number | null) => {
    if (d == null) return 'bg-muted/30 text-muted-foreground';
    if (d < 0) return 'bg-destructive/25 text-destructive font-bold';
    if (d === 0) return 'bg-destructive/20 text-destructive font-bold';
    if (d <= 7) return 'bg-warning/25 text-warning-foreground font-semibold';
    return 'bg-success/20 text-success-foreground font-semibold';
  };

  const daysLeftLabel = (d: number | null) => {
    if (d == null) return 'Sem registro';
    if (d < 0) return `${Math.abs(d)} ${Math.abs(d) === 1 ? 'dia' : 'dias'} de atraso`;
    if (d === 0) return 'Hoje';
    return `${d} ${d === 1 ? 'dia' : 'dias'}`;
  };
  // ===========================================================================

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatWeight = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;

  const handleAddLog = async () => {
    if (!addMachineId || !addStartDate || !addStartTime || !addEndDate || !addEndTime) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!isDateValid(addStartDate) || !isDateValid(addEndDate)) {
      toast.error('Data inválida. O ano deve estar entre os últimos 5 e próximos 5 anos.');
      return;
    }
    setSaving(true);
    try {
      const newLog: MachineLog = {
        id: crypto.randomUUID(),
        machine_id: addMachineId,
        status: addStatus as MachineStatus,
        started_at: new Date(`${addStartDate}T${addStartTime}:00`).toISOString(),
        ended_at: new Date(`${addEndDate}T${addEndTime}:00`).toISOString(),
        started_by_name: userName || undefined,
        started_by_code: userCode || undefined,
        ended_by_name: userName || undefined,
        ended_by_code: userCode || undefined,
      };
      const updatedLogs = [...machineLogs, newLog];
      await saveMachineLogs(updatedLogs);
      const machineName = machines.find(m => m.id === addMachineId)?.name;
       logAction('maintenance_manual_add', { machine: machineName, status: addStatus, start: addStartDate, end: addEndDate });
       toast.success('Registro adicionado com sucesso!');
       setShowAddModal(false);
       setAddMachineId('');
       setAddStatus('manutencao_preventiva');
       setAddStartDate('');
       setAddStartTime('08:00');
       setAddEndDate('');
       setAddEndTime('');
     } catch (e) {
       toast.error('Erro ao salvar registro.');
     } finally {
       setSaving(false);
     }
   };
 
   const handleSaveNeedle = async () => {
     if (!needleForm.provider || !needleForm.brand || !needleForm.reference_code) {
       toast.error('Preencha todos os campos.');
       return;
     }
     try {
       const newNeedle = {
         id: crypto.randomUUID(),
         company_id: '',
         ...needleForm,
         current_quantity: 0,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString()
       };
        await saveNeedles([...needles, { ...newNeedle, company_id: '' }]);
        logAction('needle_create', { brand: newNeedle.brand, code: newNeedle.reference_code });
       toast.success('Agulha cadastrada!');
       setShowNeedleModal(false);
       setNeedleForm({ provider: '', brand: '', reference_code: '' });
     } catch (e) { toast.error('Erro ao cadastrar.'); }
   };
 
   const handleEntry = async () => {
     if (!entryForm.needle_id || !entryForm.quantity || !entryForm.date) {
       toast.error('Preencha todos os campos.');
       return;
     }
     try {
        const needle = needles.find(n => n.id === entryForm.needle_id);
        await addNeedleTransaction({
         id: crypto.randomUUID(),
         company_id: '',
         needle_id: entryForm.needle_id,
         type: 'entry',
         quantity: Number(entryForm.quantity),
         date: entryForm.date,
         created_at: new Date().toISOString(),
         created_by_name: userName || undefined
       });
        logAction('needle_entry', { brand: needle?.brand, code: needle?.reference_code, quantity: entryForm.quantity });
        toast.success('Entrada registrada!');
       setShowEntryModal(false);
       setEntryForm({ needle_id: '', quantity: '', date: format(new Date(), 'yyyy-MM-dd') });
     } catch (e) { toast.error('Erro ao registrar entrada.'); }
   };
 
   const handleExit = async () => {
     if (!exitForm.needle_id || !exitForm.quantity || !exitForm.machine_id || !exitForm.date) {
       toast.error('Preencha todos os campos.');
       return;
     }
      const targetNeedle = needles.find(n => n.id === exitForm.needle_id);
      if (targetNeedle && targetNeedle.current_quantity < Number(exitForm.quantity)) {
       toast.error('Saldo insuficiente em estoque.');
       return;
     }
      const machine = machines.find(m => m.id === exitForm.machine_id);
      try {
        await addNeedleTransaction({
         id: crypto.randomUUID(),
         company_id: '',
         needle_id: exitForm.needle_id,
         machine_id: exitForm.machine_id,
         type: 'exit',
         exit_mode: exitForm.mode,
         quantity: Number(exitForm.quantity),
         date: exitForm.date,
         created_at: new Date().toISOString(),
         created_by_name: userName || undefined
       });
        logAction('needle_exit', { 
          brand: targetNeedle?.brand, 
          code: targetNeedle?.reference_code, 
          quantity: exitForm.quantity, 
          machine: machine?.name,
          mode: exitForm.mode 
        });
        toast.success('Baixa registrada!');
       setShowExitModal(false);
       setExitForm({ needle_id: '', quantity: '', machine_id: '', mode: 'reposicao', date: format(new Date(), 'yyyy-MM-dd') });
      } catch (e) { toast.error('Erro ao registrar baixa.'); }
    };

    const handleSaveSinker = async () => {
      if (!sinkerForm.provider || !sinkerForm.brand || !sinkerForm.reference_code) {
        toast.error('Preencha todos os campos.');
        return;
      }
      try {
        const newSinker = {
          id: crypto.randomUUID(),
          company_id: '',
          ...sinkerForm,
          current_quantity: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
         await saveSinkers([...sinkers, { ...newSinker, company_id: '' }]);
         logAction('sinker_create', { brand: newSinker.brand, code: newSinker.reference_code });
        toast.success('Platina cadastrada!');
        setShowSinkerModal(false);
        setSinkerForm({ provider: '', brand: '', reference_code: '' });
      } catch (e) { toast.error('Erro ao cadastrar.'); }
    };
  
    const handleSinkerEntry = async () => {
      if (!sinkerEntryForm.sinker_id || !sinkerEntryForm.quantity || !sinkerEntryForm.date) {
        toast.error('Preencha todos os campos.');
        return;
      }
      try {
         const sinker = sinkers.find(s => s.id === sinkerEntryForm.sinker_id);
         await addSinkerTransaction({
          id: crypto.randomUUID(),
          company_id: '',
          sinker_id: sinkerEntryForm.sinker_id,
          type: 'entry',
          quantity: Number(sinkerEntryForm.quantity),
          date: sinkerEntryForm.date,
          created_at: new Date().toISOString(),
          created_by_name: userName || undefined
        });
         logAction('sinker_entry', { brand: sinker?.brand, code: sinker?.reference_code, quantity: sinkerEntryForm.quantity });
         toast.success('Entrada registrada!');
        setShowSinkerEntryModal(false);
        setSinkerEntryForm({ sinker_id: '', quantity: '', date: format(new Date(), 'yyyy-MM-dd') });
      } catch (e) { toast.error('Erro ao registrar entrada.'); }
    };
  
    const handleSinkerExit = async () => {
      if (!sinkerExitForm.sinker_id || !sinkerExitForm.quantity || !sinkerExitForm.machine_id || !sinkerExitForm.date) {
        toast.error('Preencha todos os campos.');
        return;
      }
       const targetSinker = sinkers.find(s => s.id === sinkerExitForm.sinker_id);
       if (targetSinker && targetSinker.current_quantity < Number(sinkerExitForm.quantity)) {
        toast.error('Saldo insuficiente em estoque.');
        return;
      }
       const machine = machines.find(m => m.id === sinkerExitForm.machine_id);
       try {
         await addSinkerTransaction({
          id: crypto.randomUUID(),
          company_id: '',
          sinker_id: sinkerExitForm.sinker_id,
          machine_id: sinkerExitForm.machine_id,
          type: 'exit',
          exit_mode: sinkerExitForm.mode,
          quantity: Number(sinkerExitForm.quantity),
          date: sinkerExitForm.date,
          created_at: new Date().toISOString(),
          created_by_name: userName || undefined
        });
         logAction('sinker_exit', { 
           brand: targetSinker?.brand, 
           code: targetSinker?.reference_code, 
           quantity: sinkerExitForm.quantity, 
           machine: machine?.name,
           mode: sinkerExitForm.mode 
         });
         toast.success('Baixa registrada!');
        setShowSinkerExitModal(false);
        setSinkerExitForm({ sinker_id: '', quantity: '', machine_id: '', mode: 'reposicao', date: format(new Date(), 'yyyy-MM-dd') });
      } catch (e) { toast.error('Erro ao registrar baixa.'); }
    };

    const handleSaveCylinder = async () => {
      if (!cylinderForm.brand) {
        toast.error('Informe ao menos a marca do cilindro.');
        return;
      }
      try {
        const newCyl: any = {
          id: editingCylinder ? editingCylinder.id : crypto.randomUUID(),
          company_id: editingCylinder ? editingCylinder.company_id : '',
          brand: cylinderForm.brand,
          model: cylinderForm.model,
          diameter: cylinderForm.diameter,
          fineness: cylinderForm.fineness,
          needle_quantity: cylinderForm.needle_quantity ? Number(cylinderForm.needle_quantity) : undefined,
          feeder_quantity: cylinderForm.feeder_quantity ? Number(cylinderForm.feeder_quantity) : undefined,
          sinker_quantity: cylinderForm.sinker_quantity ? Number(cylinderForm.sinker_quantity) : undefined,
          observations: cylinderForm.observations,
          created_at: editingCylinder ? editingCylinder.created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const updatedCylinders = editingCylinder 
          ? cylinders.map(c => c.id === editingCylinder.id ? newCyl : c)
          : [...cylinders, newCyl];

        await saveCylinders(updatedCylinders);
        logAction(editingCylinder ? 'cylinder_update' : 'cylinder_create', { brand: newCyl.brand });
        toast.success(editingCylinder ? 'Cilindro atualizado!' : 'Cilindro cadastrado!');
        setShowCylinderModal(false);
        setEditingCylinder(null);
        setCylinderForm({ brand: '', model: '', diameter: '', fineness: '', needle_quantity: '', feeder_quantity: '', sinker_quantity: '', observations: '' });
      } catch (e) { toast.error('Erro ao salvar cilindro.'); }
    };

    const handleAssignCylinder = async () => {
      if (!assignForm.machine_id) {
        toast.error('Selecione uma máquina.');
        return;
      }
      try {
        await assignCylinderToMachine(assignForm.cylinder_id || null, assignForm.machine_id);
        const m = machines.find(m => m.id === assignForm.machine_id);
        const c = cylinders.find(c => c.id === assignForm.cylinder_id);
        logAction('cylinder_assign', { machine: m?.name, cylinder: c?.brand });
        toast.success('Cilindro atribuído com sucesso!');
        setShowAssignModal(false);
      } catch (e) { toast.error('Erro ao atribuir cilindro.'); }
    };


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mecânica</h1>
          <p className="text-sm text-muted-foreground">Controle de manutenções preventivas e trocas de agulhas</p>
        </div>
      </div>

      {/* Machine selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="w-full sm:w-72">
              <label className="text-sm font-medium text-foreground mb-1 block">Selecionar Máquina</label>
              <Select value={selectedMachineId} onValueChange={setSelectedMachineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma máquina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Máquinas</SelectItem>
                  {activeMachines.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedMachineId !== 'all' && (
              <div className="flex gap-6 flex-wrap">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Última Manutenção Preventiva</span>
                  <p className="text-sm font-semibold text-foreground">
                    {lastPreventive
                      ? format(new Date(lastPreventive.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : 'Nenhum registro'}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Última Troca de Agulheiro</span>
                  <p className="text-sm font-semibold text-foreground">
                    {lastNeedleChange
                      ? format(new Date(lastNeedleChange.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : 'Nenhum registro'}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Última Troca de Platinas</span>
                  <p className="text-sm font-semibold text-foreground">
                    {lastSinkerChange
                      ? format(new Date(lastSinkerChange.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : 'Nenhum registro'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="calendario" className="w-full">
         <TabsList>
           <TabsTrigger value="calendario">Calendário</TabsTrigger>
           <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="agulhas">Agulhas</TabsTrigger>
            <TabsTrigger value="platinas">Platinas</TabsTrigger>
            <TabsTrigger value="cilindros">Cilindros</TabsTrigger>
          </TabsList>
         
         {/* Platinas Tab */}
         <TabsContent value="platinas">
           <Tabs defaultValue="estoque" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="estoque">
                  <Package className="h-4 w-4 mr-1.5" />
                  Estoque
                </TabsTrigger>
                <TabsTrigger value="movimentacoes">
                  <History className="h-4 w-4 mr-1.5" />
                  Movimentações
                </TabsTrigger>
              </TabsList>

              {/* Estoque Sub-Tab */}
              <TabsContent value="estoque">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Tipos de Platina</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{sinkers.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total em Estoque</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{sinkers.reduce((sum, s) => sum + s.current_quantity, 0)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total Movimentações</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{sinkerTransactions.length}</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Pesquisar platina..." 
                        value={sinkerSearch} 
                        onChange={e => setSinkerSearch(e.target.value)} 
                        className="pl-9" 
                      />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button onClick={() => setShowSinkerModal(true)} variant="outline" className="flex-1 sm:flex-none">
                        <Plus className="h-4 w-4 mr-2" /> Cadastrar
                      </Button>
                      <Button onClick={() => setShowSinkerEntryModal(true)} variant="outline" className="flex-1 sm:flex-none">
                        <Plus className="h-4 w-4 mr-2" /> Entrada
                      </Button>
                      <Button onClick={() => setShowSinkerExitModal(true)} variant="default" className="flex-1 sm:flex-none">
                        <Wrench className="h-4 w-4 mr-2" /> Baixa
                      </Button>
                    </div>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-4 font-medium">Fornecedor</th>
                              <th className="text-left p-4 font-medium">Marca</th>
                              <th className="text-left p-4 font-medium">Ref. Código</th>
                              <th className="text-right p-4 font-medium">Estoque</th>
                              <th className="text-center p-4 font-medium w-20">Em Uso</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...sinkers]
                              .sort((a, b) => a.brand.localeCompare(b.brand))
                              .filter(s => 
                                s.brand.toLowerCase().includes(sinkerSearch.toLowerCase()) || 
                                s.provider.toLowerCase().includes(sinkerSearch.toLowerCase()) || 
                                s.reference_code.toLowerCase().includes(sinkerSearch.toLowerCase())
                              )
                              .map(s => {
                                const usedBy = new Set(machineSinkerRefs.filter(r => r.sinker_id === s.id).map(r => r.machine_id)).size;
                                return (
                              <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-4">{s.provider}</td>
                                <td className="p-4">{s.brand}</td>
                                <td className="p-4"><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{s.reference_code}</code></td>
                                <td className="p-4 text-right font-bold">{s.current_quantity}</td>
                                <td className="p-4 text-center">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSinkerUsageView({ id: s.id, brand: s.brand, reference_code: s.reference_code })} title={`${usedBy} máquina(s) usando`}>
                                    <Eye className="h-4 w-4" />
                                    {usedBy > 0 && <span className="ml-1 text-xs font-semibold">{usedBy}</span>}
                                  </Button>
                                </td>
                              </tr>
                                );
                              })}
                            {sinkers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma platina cadastrada</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Movimentações Sub-Tab */}
              <TabsContent value="movimentacoes">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Histórico de Movimentações (Platinas)</h3>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {sinkerTransactions.length} registro{sinkerTransactions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-muted-foreground">
                              <th className="text-left p-4 font-medium">Data</th>
                              <th className="text-left p-4 font-medium">Tipo</th>
                              <th className="text-left p-4 font-medium">Platina</th>
                              <th className="text-left p-4 font-medium">Destino</th>
                              <th className="text-right p-4 font-medium">Quantidade</th>
                              <th className="text-right p-4 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const sorted = [...sinkerTransactions].sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
                              const totalPages = Math.max(1, Math.ceil(sorted.length / SINKER_HISTORY_PER_PAGE));
                              const start = (sinkerHistoryPage - 1) * SINKER_HISTORY_PER_PAGE;
                              const pageItems = sorted.slice(start, start + SINKER_HISTORY_PER_PAGE);
                              return (
                                <>
                                  {pageItems.map(t => {
                                    const sinker = sinkers.find(s => s.id === t.sinker_id);
                                    const machine = machines.find(m => m.id === t.machine_id);
                                    return (
                                      <tr key={t.id} className="border-b">
                                        <td className="p-4 align-top">
                                          <div className="flex flex-col">
                                            <span className="text-sm font-medium">{format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                                            {(t.created_by_name || t.created_at) && (
                                              <span className="text-[10px] text-muted-foreground leading-tight whitespace-pre-line">
                                                {t.created_by_name || '—'} - {'\n'}{t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm') : ''}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-4">
                                          <Badge variant={t.type === 'entry' ? 'default' : 'destructive'} className="text-[10px] uppercase">
                                            {t.type === 'entry' ? 'Entrada' : t.exit_mode === 'troca_platinas' ? 'Troca' : 'Reposição'}
                                          </Badge>
                                        </td>
                                        <td className="p-4">{sinker?.brand} ({sinker?.reference_code})</td>
                                        <td className="p-4">{machine?.name || '—'}</td>
                                        <td className="p-4 text-right font-medium">{t.quantity}</td>
                                        <td className="p-4 text-right">
                                          <div className="flex justify-end gap-1">
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                              setSinkerEditTxn(t);
                                              const kind: 'entry' | 'reposicao' | 'troca_platinas' =
                                                t.type === 'entry' ? 'entry' : (t.exit_mode === 'troca_platinas' ? 'troca_platinas' : 'reposicao');
                                              setSinkerEditForm({ quantity: String(t.quantity), date: t.date, machine_id: t.machine_id || '', kind });
                                            }}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteSinkerTxnId(t.id)}>
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {sinkerTransactions.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="p-8 text-center text-muted-foreground">Sem movimentações registradas</td>
                                    </tr>
                                  )}
                                </>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination */}
                      {(() => {
                        const sorted = [...sinkerTransactions].sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
                        const totalPages = Math.max(1, Math.ceil(sorted.length / SINKER_HISTORY_PER_PAGE));
                        if (totalPages <= 1) return null;
                        const windowSize = 3;
                        let startPage = Math.max(1, sinkerHistoryPage - Math.floor(windowSize / 2));
                        let endPage = Math.min(totalPages, startPage + windowSize - 1);
                        if (endPage - startPage + 1 < windowSize) {
                          startPage = Math.max(1, endPage - windowSize + 1);
                        }
                        const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
                        return (
                          <div className="flex items-center justify-center gap-1 py-3 border-t">
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setSinkerHistoryPage(p => Math.max(1, p - 1))} disabled={sinkerHistoryPage === 1}>
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {pages.map(p => (
                              <Button key={p} variant={sinkerHistoryPage === p ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => setSinkerHistoryPage(p)}>
                                {p}
                              </Button>
                            ))}
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setSinkerHistoryPage(p => Math.min(totalPages, p + 1))} disabled={sinkerHistoryPage === totalPages}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
         </TabsContent>

         {/* Cilindros Tab */}
         <TabsContent value="cilindros">
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Cilindros em Uso</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{cylinders.filter(c => !!c.machine_id).length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Cilindros em Estoque</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{cylinders.filter(c => !c.machine_id).length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total de Cilindros</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{cylinders.length}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Pesquisar cilindro..." 
                    value={cylinderSearch} 
                    onChange={e => setCylinderSearch(e.target.value)} 
                    className="pl-9" 
                  />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button onClick={() => setShowCylinderModal(true)} variant="outline" className="flex-1 sm:flex-none">
                    <Plus className="h-4 w-4 mr-2" /> Cadastrar Cilindro
                  </Button>
                  <Button onClick={() => setShowAssignModal(true)} variant="default" className="flex-1 sm:flex-none">
                    <Wrench className="h-4 w-4 mr-2" /> Atribuir à Máquina
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-4 font-medium">Marca / Modelo</th>
                          <th className="text-left p-4 font-medium">Dados Técnicos</th>
                          <th className="text-left p-4 font-medium">Status / Máquina</th>
                          <th className="text-right p-4 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...cylinders]
                          .filter(c => 
                            c.brand.toLowerCase().includes(cylinderSearch.toLowerCase()) || 
                            c.model?.toLowerCase().includes(cylinderSearch.toLowerCase())
                          )
                          .map(c => {
                            const machine = machines.find(m => m.id === c.machine_id);
                            return (
                              <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-4">
                                  <div className="font-medium">{c.brand}</div>
                                  <div className="text-xs text-muted-foreground">{c.model || '—'}</div>
                                </td>
                                <td className="p-4">
                                  <div className="text-xs space-y-0.5">
                                    <p>Ø: {c.diameter || '—'} | F: {c.fineness || '—'}</p>
                                    <p>Agulhas: {c.needle_quantity || '—'} | Alim: {c.feeder_quantity || '—'}</p>
                                  </div>
                                </td>
                                <td className="p-4">
                                  {machine ? (
                                    <Badge variant="default" className="bg-success/10 text-success hover:bg-success/20 border-none">
                                      Em Uso: {machine.name}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      Disponível em Estoque
                                    </Badge>
                                  )}
                                </td>
                                <td className="p-4 text-right">
                                  <Button size="icon" variant="ghost" onClick={() => {
                                    setEditingCylinder(c);
                                    setCylinderForm({
                                      brand: c.brand,
                                      model: c.model || '',
                                      diameter: c.diameter || '',
                                      fineness: c.fineness || '',
                                      needle_quantity: String(c.needle_quantity || ''),
                                      feeder_quantity: String(c.feeder_quantity || ''),
                                      sinker_quantity: String(c.sinker_quantity || ''),
                                      observations: c.observations || ''
                                    });
                                    setShowCylinderModal(true);
                                  }}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        {cylinders.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhum cilindro cadastrado</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
           </div>
         </TabsContent>

         <TabsContent value="agulhas">
            <Tabs defaultValue="estoque" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="estoque">
                  <Package className="h-4 w-4 mr-1.5" />
                  Estoque
                </TabsTrigger>
                <TabsTrigger value="movimentacoes">
                  <History className="h-4 w-4 mr-1.5" />
                  Movimentações
                </TabsTrigger>
              </TabsList>

              {/* Estoque Sub-Tab */}
              <TabsContent value="estoque">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Tipos de Agulha</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{needles.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total em Estoque</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{needles.reduce((sum, n) => sum + n.current_quantity, 0)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total Movimentações</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{needleTransactions.length}</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Pesquisar agulha..." 
                        value={needleSearch} 
                        onChange={e => setNeedleSearch(e.target.value)} 
                        className="pl-9" 
                      />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button onClick={() => setShowNeedleModal(true)} variant="outline" className="flex-1 sm:flex-none">
                        <Plus className="h-4 w-4 mr-2" /> Cadastrar
                      </Button>
                      <Button onClick={() => setShowEntryModal(true)} variant="outline" className="flex-1 sm:flex-none">
                        <Plus className="h-4 w-4 mr-2" /> Entrada
                      </Button>
                      <Button onClick={() => setShowExitModal(true)} variant="default" className="flex-1 sm:flex-none">
                        <Wrench className="h-4 w-4 mr-2" /> Baixa
                      </Button>
                    </div>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-4 font-medium">Fornecedor</th>
                              <th className="text-left p-4 font-medium">Marca</th>
                              <th className="text-left p-4 font-medium">Ref. Código</th>
                              <th className="text-right p-4 font-medium">Estoque</th>
                              <th className="text-center p-4 font-medium w-20">Em Uso</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...needles]
                              .sort((a, b) => a.brand.localeCompare(b.brand))
                              .filter(n => 
                                n.brand.toLowerCase().includes(needleSearch.toLowerCase()) || 
                                n.provider.toLowerCase().includes(needleSearch.toLowerCase()) || 
                                n.reference_code.toLowerCase().includes(needleSearch.toLowerCase())
                              )
                              .map(n => {
                                const usedBy = machines.filter(m => m.current_needle_id === n.id).length;
                                return (
                              <tr key={n.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-4">{n.provider}</td>
                                <td className="p-4">{n.brand}</td>
                                <td className="p-4"><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{n.reference_code}</code></td>
                                <td className="p-4 text-right font-bold">{n.current_quantity}</td>
                                <td className="p-4 text-center">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setNeedleUsageView({ id: n.id, brand: n.brand, reference_code: n.reference_code })} title={`${usedBy} máquina(s) usando`}>
                                    <Eye className="h-4 w-4" />
                                    {usedBy > 0 && <span className="ml-1 text-xs font-semibold">{usedBy}</span>}
                                  </Button>
                                </td>
                              </tr>
                                );
                              })}
                            {needles.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma agulha cadastrada</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Movimentações Sub-Tab */}
              <TabsContent value="movimentacoes">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Histórico de Movimentações</h3>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {needleTransactions.length} registro{needleTransactions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-muted-foreground">
                              <th className="text-left p-4 font-medium">Data</th>
                              <th className="text-left p-4 font-medium">Tipo</th>
                              <th className="text-left p-4 font-medium">Agulha</th>
                              <th className="text-left p-4 font-medium">Destino</th>
                              <th className="text-right p-4 font-medium">Quantidade</th>
                              <th className="text-right p-4 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const sorted = [...needleTransactions].sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
                              const totalPages = Math.max(1, Math.ceil(sorted.length / NEEDLE_HISTORY_PER_PAGE));
                              const start = (needleHistoryPage - 1) * NEEDLE_HISTORY_PER_PAGE;
                              const pageItems = sorted.slice(start, start + NEEDLE_HISTORY_PER_PAGE);
                              return (
                                <>
                                  {pageItems.map(t => {
                                    const needle = needles.find(n => n.id === t.needle_id);
                                    const machine = machines.find(m => m.id === t.machine_id);
                                    return (
                                      <tr key={t.id} className="border-b">
                                        <td className="p-4 align-top">
                                          <div className="flex flex-col">
                                            <span className="text-sm font-medium">{format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                                            {(t.created_by_name || t.created_at) && (
                                              <span className="text-[10px] text-muted-foreground leading-tight whitespace-pre-line">
                                                {t.created_by_name || '—'} - {'\n'}{t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm') : ''}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-4">
                                          <Badge variant={t.type === 'entry' ? 'default' : 'destructive'} className="text-[10px] uppercase">
                                            {t.type === 'entry' ? 'Entrada' : t.exit_mode === 'troca_agulheiro' ? 'Troca' : 'Reposição'}
                                          </Badge>
                                        </td>
                                        <td className="p-4">{needle?.brand} ({needle?.reference_code})</td>
                                        <td className="p-4">{machine?.name || '—'}</td>
                                        <td className="p-4 text-right font-medium">{t.quantity}</td>
                                        <td className="p-4 text-right">
                                          <div className="flex justify-end gap-1">
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                              setEditTxn(t);
                                              const kind: 'entry' | 'reposicao' | 'troca_agulheiro' =
                                                t.type === 'entry' ? 'entry' : (t.exit_mode === 'troca_agulheiro' ? 'troca_agulheiro' : 'reposicao');
                                              setEditForm({ quantity: String(t.quantity), date: t.date, machine_id: t.machine_id || '', kind });
                                            }}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTxnId(t.id)}>
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {needleTransactions.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="p-8 text-center text-muted-foreground">Sem movimentações registradas</td>
                                    </tr>
                                  )}
                                </>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination */}
                      {(() => {
                        const sorted = [...needleTransactions].sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
                        const totalPages = Math.max(1, Math.ceil(sorted.length / NEEDLE_HISTORY_PER_PAGE));
                        if (totalPages <= 1) return null;
                        const windowSize = 3;
                        let startPage = Math.max(1, needleHistoryPage - Math.floor(windowSize / 2));
                        let endPage = Math.min(totalPages, startPage + windowSize - 1);
                        if (endPage - startPage + 1 < windowSize) {
                          startPage = Math.max(1, endPage - windowSize + 1);
                        }
                        const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
                        return (
                          <div className="flex items-center justify-center gap-1 py-3 border-t">
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setNeedleHistoryPage(p => Math.max(1, p - 1))} disabled={needleHistoryPage === 1}>
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {pages.map(p => (
                              <Button key={p} variant={needleHistoryPage === p ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => setNeedleHistoryPage(p)}>
                                {p}
                              </Button>
                            ))}
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setNeedleHistoryPage(p => Math.min(totalPages, p + 1))} disabled={needleHistoryPage === totalPages}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
 

        {/* Calendário Tab */}
        <TabsContent value="calendario">
          <Card className="w-full">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg">Programação de Manutenções</CardTitle>
                  <Button size="sm" onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar máquina, modelo, diâmetro..."
                    value={scheduleSearch}
                    onChange={e => setScheduleSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Legenda:</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-success/40 border border-success/50" /> &gt; 7 dias</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-warning/40 border border-warning/50" /> 1-7 dias</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-destructive/40 border border-destructive/50" /> Hoje ou atrasado</span>
                <span className="ml-auto text-[10px]">Intervalo padrão: {MAINTENANCE_INTERVAL_DAYS} dias entre preventivas</span>
              </div>

              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-center font-bold">TEAR</TableHead>
                      <TableHead className="text-center font-bold">MODELO</TableHead>
                      <TableHead className="text-center font-bold">DIÂMETRO</TableHead>
                      <TableHead className="text-center font-bold">FINURA</TableHead>
                      <TableHead className="text-center font-bold">ÚLTIMA MANUTENÇÃO</TableHead>
                      <TableHead className="text-center font-bold">MANUTENÇÃO PREVISTA</TableHead>
                      <TableHead className="text-center font-bold">DIAS P/ PRÓXIMA</TableHead>
                      <TableHead className="text-center font-bold">HORA INÍCIO</TableHead>
                      <TableHead className="text-center font-bold">HORA FIM</TableHead>
                      <TableHead className="text-center font-bold">HORAS PARADAS</TableHead>
                      <TableHead className="font-bold min-w-[180px]">OBSERVAÇÃO</TableHead>
                      <TableHead className="text-center font-bold">HISTÓRICO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScheduleRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-8">
                          {loading ? 'Carregando máquinas...' : 'Nenhuma máquina encontrada.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredScheduleRows.map(row => {
                      const { machine, last, lastDate, nextDate, daysLeft, durationMin, historyCount } = row;
                      const obsList = last ? (obsByLogId[last.id] || []) : [];
                      const obsText = obsList.map(o => o.observation).join(' • ');
                      return (
                        <TableRow key={machine.id} className="text-xs">
                          <TableCell className="text-center font-semibold">{machine.name}</TableCell>
                          <TableCell className="text-center">{machine.model || '—'}</TableCell>
                          <TableCell className="text-center">{machine.diameter || '—'}</TableCell>
                          <TableCell className="text-center">{machine.fineness || '—'}</TableCell>
                          <TableCell className="text-center">
                            {lastDate ? format(lastDate, 'dd/MM/yyyy') : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {nextDate ? format(nextDate, 'dd/MM/yyyy') : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className={cn('text-center', daysLeftCellClass(daysLeft))}>
                            {daysLeftLabel(daysLeft)}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {last?.started_at ? format(new Date(last.started_at), 'HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {last?.ended_at ? format(new Date(last.ended_at), 'HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">{formatDuration(durationMin)}</TableCell>
                          <TableCell className="max-w-[260px]">
                            {obsText ? (
                              <span className="block truncate" title={obsText}>{obsText}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setScheduleHistoryMachineId(machine.id)}
                              disabled={historyCount === 0}
                            >
                              <History className="h-3 w-3 mr-1" />
                              {historyCount}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detalhes Tab */}
        <TabsContent value="detalhes">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar máquina..."
                value={detailsSearch}
                onChange={e => setDetailsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {detailsData
              .filter(d => d.machine.name.toLowerCase().includes(detailsSearch.toLowerCase()))
              .map(({ machine, lastPrev, lastNeedle, revenueSincePreventive, revenueSinceNeedle, weightSincePreventive, weightSinceNeedle }) => (
              <Card key={machine.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Badge className={cn(MACHINE_STATUS_COLORS[machine.status as MachineStatus])}>
                        {MACHINE_STATUS_LABELS[machine.status as MachineStatus]}
                      </Badge>
                      <span className="font-semibold text-foreground">{machine.name}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Since last preventive */}
                      <div className="rounded-lg border border-border p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Desde última Manutenção Preventiva
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {lastPrev
                            ? format(new Date(lastPrev.started_at), "dd/MM/yyyy", { locale: ptBR })
                            : 'Sem registro'}
                        </p>
                        <div className="flex items-center gap-4">
                          {canSeeFinancial && (
                          <div>
                            <p className="text-lg font-bold text-foreground">{formatCurrency(revenueSincePreventive)}</p>
                            <p className="text-[10px] text-muted-foreground">Faturamento</p>
                          </div>
                          )}
                          <div>
                            <p className="text-lg font-bold text-foreground">{formatWeight(weightSincePreventive)}</p>
                            <p className="text-[10px] text-muted-foreground">Peso produzido</p>
                          </div>
                        </div>
                      </div>

                      {/* Since last needle change */}
                      <div className="rounded-lg border border-border p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Desde última Troca de Agulheiro
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {machine.last_needle_change_at 
                            ? format(new Date(machine.last_needle_change_at), "dd/MM/yyyy", { locale: ptBR })
                            : lastNeedle
                              ? format(new Date(lastNeedle.started_at), "dd/MM/yyyy", { locale: ptBR })
                              : 'Sem registro'}
                        </p>
                        <div className="flex items-center gap-4">
                          {canSeeFinancial && (
                          <div>
                            <p className="text-lg font-bold text-foreground">{formatCurrency(revenueSinceNeedle)}</p>
                            <p className="text-[10px] text-muted-foreground">Faturamento</p>
                          </div>
                          )}
                          <div>
                            <p className="text-lg font-bold text-foreground">{formatWeight(weightSinceNeedle)}</p>
                            <p className="text-[10px] text-muted-foreground">Peso produzido</p>
                          </div>
                        </div>
                      </div>

                      {/* Since last sinker change */}
                      {(() => {
                        // Mostra "Desde última Troca de Platinas" apenas para máquinas Mono Frontura
                        // (Mono usa agulhas + platinas; Dupla Frontura usa agulhas disco + cilindro, sem platinas)
                        if (machine.machine_type !== 'mono') return null;
                        
                        const revenue = calcPeriod(machine.id, machine.last_sinker_change_at ? format(new Date(machine.last_sinker_change_at), 'yyyy-MM-dd') : '2000-01-01', format(new Date(), 'yyyy-MM-dd')).revenue;
                        const weight = calcPeriod(machine.id, machine.last_sinker_change_at ? format(new Date(machine.last_sinker_change_at), 'yyyy-MM-dd') : '2000-01-01', format(new Date(), 'yyyy-MM-dd')).weight;

                        return (
                          <div className="rounded-lg border border-border p-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Desde última Troca de Platinas
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {machine.last_sinker_change_at 
                                ? format(new Date(machine.last_sinker_change_at), "dd/MM/yyyy", { locale: ptBR })
                                : 'Sem registro'}
                            </p>
                            <div className="flex items-center gap-4">
                              {canSeeFinancial && (
                              <div>
                                <p className="text-lg font-bold text-foreground">
                                  {formatCurrency(revenue)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">Faturamento</p>
                              </div>
                              )}
                              <div>
                                <p className="text-lg font-bold text-foreground">
                                  {formatWeight(weight)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">Peso produzido</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      {machine.cylinder_id ? (
                        (() => {
                          const cyl = cylinders.find(c => c.id === machine.cylinder_id);
                          return (
                            <div className="col-span-full rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                                  <Package className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-primary">Cilindro em uso</p>
                                  <p className="text-sm font-semibold">{cyl?.brand} {cyl?.model} (Ø:{cyl?.diameter} F:{cyl?.fineness})</p>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => {
                                setEditingCylinder(cyl);
                                setCylinderForm({
                                  brand: cyl?.brand || '',
                                  model: cyl?.model || '',
                                  diameter: cyl?.diameter || '',
                                  fineness: cyl?.fineness || '',
                                  needle_quantity: String(cyl?.needle_quantity || ''),
                                  feeder_quantity: String(cyl?.feeder_quantity || ''),
                                  sinker_quantity: String(cyl?.sinker_quantity || ''),
                                  observations: cyl?.observations || ''
                                });
                                setShowCylinderModal(true);
                              }}>
                                Detalhes
                              </Button>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="col-span-full rounded-lg border border-dashed p-3 text-center">
                          <p className="text-xs text-muted-foreground">Nenhum cilindro atribuído</p>
                          <Button variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => {
                            setAssignForm({ ...assignForm, machine_id: machine.id });
                            setShowAssignModal(true);
                          }}>
                            Atribuir agora
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-1"
                      onClick={() => setHistoryMachineId(machine.id)}
                    >
                      <History className="h-4 w-4 mr-1" />
                      Ver Todos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {loading && detailsData.length === 0 && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-32" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Skeleton className="h-24 rounded-lg" />
                        <Skeleton className="h-24 rounded-lg" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Carregando máquinas...</span>
                </div>
              </div>
            )}

            {!loading && detailsData.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma máquina ativa encontrada.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Day detail modal */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && format(selectedDay, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {selectedDayLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
            ) : (
              selectedDayLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                  <Badge className={cn('shrink-0 mt-0.5', MACHINE_STATUS_COLORS[log.status as MachineStatus])}>
                    {MACHINE_STATUS_LABELS[log.status as MachineStatus]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{getMachineName(log.machine_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      Início: {format(new Date(log.started_at), "HH:mm", { locale: ptBR })}
                      {log.started_by_name && <span className="text-primary font-medium"> — {log.started_by_name}{log.started_by_code ? ` #${log.started_by_code}` : ''}</span>}
                      {log.ended_at && ` — Fim: ${format(new Date(log.ended_at), "HH:mm", { locale: ptBR })}`}
                      {log.ended_at && log.ended_by_name && <span className="text-primary font-medium"> — {log.ended_by_name}{log.ended_by_code ? ` #${log.ended_by_code}` : ''}</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* History modal */}
      <Dialog open={!!historyMachineId} onOpenChange={(open) => !open && setHistoryMachineId(null)}>
        <DialogContent className="w-[80vw] max-w-[80vw] h-[80vh] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico — {historyMachineName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3">
            {historyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro de manutenção preventiva ou troca de agulheiro.</p>
            ) : (
              historyData.map(({ log, revenue, weight, fromDate }) => (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 sm:w-48 shrink-0">
                    <Badge className={cn('shrink-0', MACHINE_STATUS_COLORS[log.status as MachineStatus])}>
                      {MACHINE_STATUS_LABELS[log.status as MachineStatus]}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(log.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {log.started_by_name && <span className="text-primary text-xs ml-1">— {log.started_by_name}{log.started_by_code ? ` #${log.started_by_code}` : ''}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Período: {fromDate !== '2000-01-01' ? format(new Date(fromDate), 'dd/MM/yyyy') : 'Início'} → {format(new Date(log.started_at), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    {canSeeFinancial && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatCurrency(revenue)}</p>
                      <p className="text-[10px] text-muted-foreground">Faturamento</p>
                    </div>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatWeight(weight)}</p>
                      <p className="text-[10px] text-muted-foreground">Peso</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add manual log modal */}
      {/* Histórico de manutenções preventivas por máquina (Programação) */}
      <Dialog open={!!scheduleHistoryMachineId} onOpenChange={(open) => !open && setScheduleHistoryMachineId(null)}>
        <DialogContent className="w-[80vw] max-w-[80vw] h-[80vh] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Histórico de Manutenções — {scheduleHistoryMachineId ? getMachineName(scheduleHistoryMachineId) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {scheduleHistoryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma manutenção preventiva registrada.</p>
            ) : (
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>DATA</TableHead>
                      <TableHead>HORA INÍCIO</TableHead>
                      <TableHead>HORA FIM</TableHead>
                      <TableHead>DURAÇÃO</TableHead>
                      <TableHead>RESPONSÁVEL</TableHead>
                      <TableHead className="min-w-[260px]">OBSERVAÇÃO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduleHistoryRows.map(log => {
                      const start = new Date(log.started_at);
                      const end = log.ended_at ? new Date(log.ended_at) : null;
                      const dur = end ? Math.max(0, (end.getTime() - start.getTime()) / 60000) : null;
                      const obs = (obsByLogId[log.id] || []).map(o => o.observation).join(' • ');
                      return (
                        <TableRow key={log.id} className="text-xs">
                          <TableCell>{format(start, 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="tabular-nums">{format(start, 'HH:mm')}</TableCell>
                          <TableCell className="tabular-nums">{end ? format(end, 'HH:mm') : '—'}</TableCell>
                          <TableCell className="tabular-nums">{formatDuration(dur)}</TableCell>
                          <TableCell>
                            {log.started_by_name
                              ? `${log.started_by_name}${log.started_by_code ? ` #${log.started_by_code}` : ''}`
                              : '—'}
                          </TableCell>
                          <TableCell className="max-w-[400px]">
                            {obs ? <span className="block whitespace-pre-wrap">{obs}</span> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* === Original Add Manual Log Modal (preserved) === */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Adicionar Registro Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Máquina</Label>
              <Select value={addMachineId} onValueChange={setAddMachineId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma máquina" /></SelectTrigger>
                <SelectContent>
                  {activeMachines.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={addStatus} onValueChange={setAddStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{MACHINE_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início</Label>
                <Input type="date" min={getDateLimits().minDate} max={getDateLimits().maxDate} value={addStartDate} onChange={e => setAddStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Hora Início</Label>
                <Input type="time" value={addStartTime} onChange={e => setAddStartTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Fim</Label>
                <Input type="date" min={getDateLimits().minDate} max={getDateLimits().maxDate} value={addEndDate} onChange={e => setAddEndDate(e.target.value)} />
              </div>
              <div>
                <Label>Hora Fim</Label>
                <Input type="time" value={addEndTime} onChange={e => setAddEndTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancelar</Button>
            <Button onClick={handleAddLog} disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
       </DialogContent>
     </Dialog>
 
     {/* Cadastro de Agulha */}
     <Dialog open={showNeedleModal} onOpenChange={setShowNeedleModal}>
       <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Cadastrar Tipo de Agulha</DialogTitle></DialogHeader>
         <div className="space-y-4 pt-2">
           <div className="space-y-1">
             <Label>Fornecedor</Label>
             <Input value={needleForm.provider} onChange={e => setNeedleForm({...needleForm, provider: e.target.value})} placeholder="Ex: Groz-Beckert" />
           </div>
           <div className="space-y-1">
             <Label>Marca</Label>
             <Input value={needleForm.brand} onChange={e => setNeedleForm({...needleForm, brand: e.target.value})} placeholder="Ex: Vo-Spec" />
           </div>
           <div className="space-y-1">
             <Label>Código de Referência</Label>
             <Input value={needleForm.reference_code} onChange={e => setNeedleForm({...needleForm, reference_code: e.target.value})} placeholder="Ex: VO 71.52 G003" />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setShowNeedleModal(false)}>Cancelar</Button>
           <Button onClick={handleSaveNeedle}>Cadastrar</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
 
     {/* Entrada de Agulha */}
     <Dialog open={showEntryModal} onOpenChange={setShowEntryModal}>
       <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Registrar Entrada</DialogTitle></DialogHeader>
         <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Selecionar Agulha</Label>
              <Select value={entryForm.needle_id} onValueChange={v => setEntryForm({...entryForm, needle_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a agulha" /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-2 border-b sticky top-0 bg-popover z-10">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        placeholder="Filtrar..." 
                        value={needleEntrySearch} 
                        onChange={e => setNeedleEntrySearch(e.target.value)} 
                        className="pl-8 h-8 text-xs"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {needles
                      .filter(n => 
                        n.brand.toLowerCase().includes(needleEntrySearch.toLowerCase()) || 
                        n.reference_code.toLowerCase().includes(needleEntrySearch.toLowerCase()) ||
                        n.provider.toLowerCase().includes(needleEntrySearch.toLowerCase())
                      )
                      .map(n => <SelectItem key={n.id} value={n.id}>{n.brand} ({n.reference_code})</SelectItem>)
                    }
                    {needles.filter(n => 
                      n.brand.toLowerCase().includes(needleEntrySearch.toLowerCase()) || 
                      n.reference_code.toLowerCase().includes(needleEntrySearch.toLowerCase()) ||
                      n.provider.toLowerCase().includes(needleEntrySearch.toLowerCase())
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma agulha encontrada</div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
           <div className="space-y-1">
             <Label>Quantidade</Label>
             <Input type="number" value={entryForm.quantity} onChange={e => setEntryForm({...entryForm, quantity: e.target.value})} placeholder="0" />
           </div>
           <div className="space-y-1">
             <Label>Data</Label>
             <Input type="date" value={entryForm.date} onChange={e => setEntryForm({...entryForm, date: e.target.value})} />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setShowEntryModal(false)}>Cancelar</Button>
           <Button onClick={handleEntry}>Registrar</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
 
     {/* Baixa de Agulha */}
     <Dialog open={showExitModal} onOpenChange={setShowExitModal}>
       <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Registrar Saída (Baixa)</DialogTitle></DialogHeader>
         <div className="space-y-4 pt-2">
           <div className="space-y-1">
             <Label>Modo de Saída</Label>
             <Select value={exitForm.mode} onValueChange={v => setExitForm({...exitForm, mode: v as any})}>
               <SelectTrigger><SelectValue /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="reposicao">Reposição (Quebra)</SelectItem>
                 <SelectItem value="troca_agulheiro">Troca de Agulheiro (Geral)</SelectItem>
               </SelectContent>
             </Select>
           </div>
           <div className="space-y-1">
             <Label>Máquina</Label>
             <Select value={exitForm.machine_id} onValueChange={v => setExitForm({...exitForm, machine_id: v})}>
               <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
               <SelectContent>
                 {activeMachines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
               </SelectContent>
             </Select>
           </div>
            <div className="space-y-2">
              <Label>Selecionar Agulha</Label>
              <Select value={exitForm.needle_id} onValueChange={v => setExitForm({...exitForm, needle_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a agulha" /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-2 border-b sticky top-0 bg-popover z-10">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        placeholder="Filtrar..." 
                        value={needleExitSearch} 
                        onChange={e => setNeedleExitSearch(e.target.value)} 
                        className="pl-8 h-8 text-xs"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {needles
                      .filter(n => 
                        n.brand.toLowerCase().includes(needleExitSearch.toLowerCase()) || 
                        n.reference_code.toLowerCase().includes(needleExitSearch.toLowerCase()) ||
                        n.provider.toLowerCase().includes(needleExitSearch.toLowerCase())
                      )
                      .map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.brand} ({n.reference_code}) - Saldo: {n.current_quantity}
                        </SelectItem>
                      ))
                    }
                    {needles.filter(n => 
                      n.brand.toLowerCase().includes(needleExitSearch.toLowerCase()) || 
                      n.reference_code.toLowerCase().includes(needleExitSearch.toLowerCase()) ||
                      n.provider.toLowerCase().includes(needleExitSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma agulha encontrada</div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
           <div className="space-y-1">
             <Label>Quantidade</Label>
             <Input type="number" value={exitForm.quantity} onChange={e => setExitForm({...exitForm, quantity: e.target.value})} placeholder="0" />
           </div>
           <div className="space-y-1">
             <Label>Data</Label>
             <Input type="date" value={exitForm.date} onChange={e => setExitForm({...exitForm, date: e.target.value})} />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setShowExitModal(false)}>Cancelar</Button>
           <Button onClick={handleExit}>Registrar Baixa</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>

    {/* Edit Needle Transaction Modal */}
    <Dialog open={!!editTxn} onOpenChange={(o) => !o && setEditTxn(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Movimentação</DialogTitle>
        </DialogHeader>
        {editTxn && (
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={editForm.kind} onValueChange={(v: any) => setEditForm({ ...editForm, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entrada</SelectItem>
                  <SelectItem value="reposicao">Reposição</SelectItem>
                  <SelectItem value="troca_agulheiro">Troca de Agulheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} {...getDateLimits()} />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
            </div>
            {editForm.kind !== 'entry' && (
              <div>
                <Label>Máquina</Label>
                <Select value={editForm.machine_id} onValueChange={(v) => setEditForm({ ...editForm, machine_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditTxn(null)}>Cancelar</Button>
          <Button onClick={async () => {
            if (!editTxn) return;
            const qty = parseInt(editForm.quantity);
            if (!qty || qty <= 0) { toast.error('Quantidade inválida'); return; }
            if (!isDateValid(editForm.date)) { toast.error('Data inválida'); return; }
            const isEntry = editForm.kind === 'entry';
            if (!isEntry && !editForm.machine_id) { toast.error('Selecione a máquina'); return; }
            try {
              await updateNeedleTransaction(editTxn.id, {
                quantity: qty,
                date: editForm.date,
                type: isEntry ? 'entry' : 'exit',
                exit_mode: isEntry ? undefined : (editForm.kind as 'reposicao' | 'troca_agulheiro'),
                machine_id: isEntry ? undefined : editForm.machine_id,
              });
              await logAction('needle_transaction_edit', { id: editTxn.id, quantity: qty, date: editForm.date, kind: editForm.kind });
              toast.success('Movimentação atualizada');
              setEditTxn(null);
            } catch (e: any) {
              toast.error('Erro ao atualizar: ' + (e?.message || ''));
            }
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DeleteConfirmDialog
      open={!!deleteTxnId}
      onOpenChange={(o) => !o && setDeleteTxnId(null)}
      title="Excluir movimentação"
      description="Esta ação irá reverter o saldo de estoque e não pode ser desfeita."
      onConfirm={async () => {
        if (!deleteTxnId) return;
        try {
          await deleteNeedleTransaction(deleteTxnId);
          await logAction('needle_transaction_delete', { id: deleteTxnId });
          toast.success('Movimentação excluída');
        } catch (e: any) {
          toast.error('Erro ao excluir: ' + (e?.message || ''));
        } finally {
          setDeleteTxnId(null);
        }
      }}
    />
     {/* --- Platinas Modals --- */}
     {/* Cadastrar Platina */}
     <Dialog open={showSinkerModal} onOpenChange={setShowSinkerModal}>
       <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Cadastrar Nova Platina</DialogTitle></DialogHeader>
         <div className="space-y-4 pt-2">
           <div className="space-y-1">
             <Label>Fornecedor</Label>
             <Input value={sinkerForm.provider} onChange={e => setSinkerForm({...sinkerForm, provider: e.target.value})} placeholder="Ex: Fornecedor X" />
           </div>
           <div className="space-y-1">
             <Label>Marca</Label>
             <Input value={sinkerForm.brand} onChange={e => setSinkerForm({...sinkerForm, brand: e.target.value})} placeholder="Ex: Groz-Beckert" />
           </div>
           <div className="space-y-1">
             <Label>Referência / Código</Label>
             <Input value={sinkerForm.reference_code} onChange={e => setSinkerForm({...sinkerForm, reference_code: e.target.value})} placeholder="Ex: SNK-123" />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setShowSinkerModal(false)}>Cancelar</Button>
           <Button onClick={handleSaveSinker}>Cadastrar</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>

     {/* Entrada de Platina */}
     <Dialog open={showSinkerEntryModal} onOpenChange={setShowSinkerEntryModal}>
       <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Registrar Entrada de Platina</DialogTitle></DialogHeader>
         <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Selecionar Platina</Label>
              <Select value={sinkerEntryForm.sinker_id} onValueChange={v => setSinkerEntryForm({...sinkerEntryForm, sinker_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a platina" /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-2 border-b sticky top-0 bg-popover z-10">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        placeholder="Filtrar..." 
                        className="pl-8 h-8 text-xs"
                        onKeyDown={(e) => e.stopPropagation()}
                        // Reusing needleEntrySearch for simplicity or create sinkerEntrySearch
                      />
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {sinkers
                      .filter(s => 
                        s.brand.toLowerCase().includes(needleEntrySearch.toLowerCase()) || 
                        s.reference_code.toLowerCase().includes(needleEntrySearch.toLowerCase()) ||
                        s.provider.toLowerCase().includes(needleEntrySearch.toLowerCase())
                      )
                      .map(s => <SelectItem key={s.id} value={s.id}>{s.brand} ({s.reference_code})</SelectItem>)
                    }
                    {sinkers.filter(s => 
                      s.brand.toLowerCase().includes(needleEntrySearch.toLowerCase()) || 
                      s.reference_code.toLowerCase().includes(needleEntrySearch.toLowerCase()) ||
                      s.provider.toLowerCase().includes(needleEntrySearch.toLowerCase())
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma platina encontrada</div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
           <div className="space-y-1">
             <Label>Quantidade</Label>
             <Input type="number" value={sinkerEntryForm.quantity} onChange={e => setSinkerEntryForm({...sinkerEntryForm, quantity: e.target.value})} placeholder="0" />
           </div>
           <div className="space-y-1">
             <Label>Data</Label>
             <Input type="date" value={sinkerEntryForm.date} onChange={e => setSinkerEntryForm({...sinkerEntryForm, date: e.target.value})} />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setShowSinkerEntryModal(false)}>Cancelar</Button>
           <Button onClick={handleSinkerEntry}>Registrar</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>

     {/* Baixa de Platina */}
     <Dialog open={showSinkerExitModal} onOpenChange={setShowSinkerExitModal}>
       <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Registrar Saída (Baixa) de Platinas</DialogTitle></DialogHeader>
         <div className="space-y-4 pt-2">
           <div className="space-y-1">
             <Label>Modo de Saída</Label>
             <Select value={sinkerExitForm.mode} onValueChange={v => setSinkerExitForm({...sinkerExitForm, mode: v as any})}>
               <SelectTrigger><SelectValue /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="reposicao">Reposição (Quebra)</SelectItem>
                 <SelectItem value="troca_platinas">Troca de Platinas (Geral)</SelectItem>
               </SelectContent>
             </Select>
           </div>
           <div className="space-y-1">
             <Label>Máquina</Label>
             <Select value={sinkerExitForm.machine_id} onValueChange={v => setSinkerExitForm({...sinkerExitForm, machine_id: v})}>
               <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
               <SelectContent>
                 {activeMachines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
               </SelectContent>
             </Select>
           </div>
            <div className="space-y-2">
              <Label>Selecionar Platina</Label>
              <Select value={sinkerExitForm.sinker_id} onValueChange={v => setSinkerExitForm({...sinkerExitForm, sinker_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a platina" /></SelectTrigger>
                <SelectContent>
                  <div className="max-h-[200px] overflow-y-auto">
                    {sinkers
                      .filter(s => 
                        s.brand.toLowerCase().includes(needleExitSearch.toLowerCase()) || 
                        s.reference_code.toLowerCase().includes(needleExitSearch.toLowerCase()) ||
                        s.provider.toLowerCase().includes(needleExitSearch.toLowerCase())
                      )
                      .map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.brand} ({s.reference_code}) - Saldo: {s.current_quantity}
                        </SelectItem>
                      ))
                    }
                    {sinkers.filter(s => 
                      s.brand.toLowerCase().includes(needleExitSearch.toLowerCase()) || 
                      s.reference_code.toLowerCase().includes(needleExitSearch.toLowerCase()) ||
                      s.provider.toLowerCase().includes(needleExitSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma platina encontrada</div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
           <div className="space-y-1">
             <Label>Quantidade</Label>
             <Input type="number" value={sinkerExitForm.quantity} onChange={e => setSinkerExitForm({...sinkerExitForm, quantity: e.target.value})} placeholder="0" />
           </div>
           <div className="space-y-1">
             <Label>Data</Label>
             <Input type="date" value={sinkerExitForm.date} onChange={e => setSinkerExitForm({...sinkerExitForm, date: e.target.value})} />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => setShowSinkerExitModal(false)}>Cancelar</Button>
           <Button onClick={handleSinkerExit}>Registrar Baixa</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>

     {/* Edit Sinker Transaction Modal */}
     <Dialog open={!!sinkerEditTxn} onOpenChange={(o) => !o && setSinkerEditTxn(null)}>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle>Editar Movimentação de Platina</DialogTitle>
         </DialogHeader>
         {sinkerEditTxn && (
           <div className="space-y-3">
             <div>
               <Label>Tipo</Label>
               <Select value={sinkerEditForm.kind} onValueChange={(v: any) => setSinkerEditForm({ ...sinkerEditForm, kind: v })}>
                 <SelectTrigger><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="entry">Entrada</SelectItem>
                   <SelectItem value="reposicao">Reposição</SelectItem>
                   <SelectItem value="troca_platinas">Troca de Platinas</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <div>
               <Label>Data</Label>
               <Input type="date" value={sinkerEditForm.date} onChange={(e) => setSinkerEditForm({ ...sinkerEditForm, date: e.target.value })} {...getDateLimits()} />
             </div>
             <div>
               <Label>Quantidade</Label>
               <Input type="number" min="1" value={sinkerEditForm.quantity} onChange={(e) => setSinkerEditForm({ ...sinkerEditForm, quantity: e.target.value })} />
             </div>
             {sinkerEditForm.kind !== 'entry' && (
               <div>
                 <Label>Máquina</Label>
                 <Select value={sinkerEditForm.machine_id} onValueChange={(v) => setSinkerEditForm({ ...sinkerEditForm, machine_id: v })}>
                   <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                   <SelectContent>
                     {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                   </SelectContent>
                 </Select>
               </div>
             )}
           </div>
         )}
         <DialogFooter>
           <Button variant="outline" onClick={() => setSinkerEditTxn(null)}>Cancelar</Button>
           <Button onClick={async () => {
             if (!sinkerEditTxn) return;
             const qty = parseInt(sinkerEditForm.quantity);
             if (!qty || qty <= 0) { toast.error('Quantidade inválida'); return; }
             if (!isDateValid(sinkerEditForm.date)) { toast.error('Data inválida'); return; }
             const isEntry = sinkerEditForm.kind === 'entry';
             if (!isEntry && !sinkerEditForm.machine_id) { toast.error('Selecione a máquina'); return; }
             try {
               await updateSinkerTransaction(sinkerEditTxn.id, {
                 quantity: qty,
                 date: sinkerEditForm.date,
                 type: isEntry ? 'entry' : 'exit',
                 exit_mode: isEntry ? undefined : (sinkerEditForm.kind as 'reposicao' | 'troca_platinas'),
                 machine_id: isEntry ? undefined : sinkerEditForm.machine_id,
               });
               await logAction('sinker_transaction_edit', { id: sinkerEditTxn.id, quantity: qty, date: sinkerEditForm.date, kind: sinkerEditForm.kind });
               toast.success('Movimentação atualizada');
               setSinkerEditTxn(null);
             } catch (e: any) {
               toast.error('Erro ao atualizar: ' + (e?.message || ''));
             }
           }}>Salvar</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>

      <DeleteConfirmDialog
        open={!!deleteSinkerTxnId}
        onOpenChange={(o) => !o && setDeleteSinkerTxnId(null)}
        title="Excluir movimentação de platina"
        description="Esta ação irá reverter o saldo de estoque e não pode ser desfeita."
        onConfirm={async () => {
          if (!deleteSinkerTxnId) return;
          try {
            await deleteSinkerTransaction(deleteSinkerTxnId);
            await logAction('sinker_transaction_delete', { id: deleteSinkerTxnId });
            toast.success('Movimentação excluída');
          } catch (e: any) {
            toast.error('Erro ao excluir: ' + (e?.message || ''));
          } finally {
            setDeleteSinkerTxnId(null);
          }
        }}
      />

      {/* Cadastrar/Editar Cilindro */}
      <Dialog open={showCylinderModal} onOpenChange={(open) => {
        setShowCylinderModal(open);
        if (!open) {
          setEditingCylinder(null);
          setCylinderForm({ brand: '', model: '', diameter: '', fineness: '', needle_quantity: '', feeder_quantity: '', sinker_quantity: '', observations: '' });
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCylinder ? 'Editar Cilindro' : 'Cadastrar Novo Cilindro'}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input value={cylinderForm.brand} onChange={e => setCylinderForm({...cylinderForm, brand: e.target.value})} placeholder="Ex: Mayer" />
              </div>
              <div className="space-y-1">
                <Label>Modelo</Label>
                <Input value={cylinderForm.model} onChange={e => setCylinderForm({...cylinderForm, model: e.target.value})} placeholder="Ex: Relanit" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Diâmetro (Ø)</Label>
                <Input value={cylinderForm.diameter} onChange={e => setCylinderForm({...cylinderForm, diameter: e.target.value})} placeholder="Ex: 30" />
              </div>
              <div className="space-y-1">
                <Label>Fineza (F)</Label>
                <Input value={cylinderForm.fineness} onChange={e => setCylinderForm({...cylinderForm, fineness: e.target.value})} placeholder="Ex: 24" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Qtd Agulhas</Label>
              <Input type="number" value={cylinderForm.needle_quantity} onChange={e => setCylinderForm({...cylinderForm, needle_quantity: e.target.value})} placeholder="Ex: 2280" />
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Input value={cylinderForm.observations} onChange={e => setCylinderForm({...cylinderForm, observations: e.target.value})} placeholder="Informações adicionais" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCylinderModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveCylinder}>{editingCylinder ? 'Salvar Alterações' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Atribuir Cilindro à Máquina */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Atribuir Cilindro à Máquina</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Máquina Destino</Label>
              <Select value={assignForm.machine_id} onValueChange={v => setAssignForm({...assignForm, machine_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                <SelectContent>
                  {activeMachines.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} {m.cylinder_id ? '(Já possui cilindro)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cilindro</Label>
              <Select value={assignForm.cylinder_id} onValueChange={v => setAssignForm({...assignForm, cylinder_id: v === 'none' ? '' : v})}>
                <SelectTrigger><SelectValue placeholder="Selecione o cilindro (vazio para desatribuir)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">NENHUM CILINDRO (Desatribuir)</SelectItem>
                  {cylinders.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.brand} {c.model} - Ø:{c.diameter} F:{c.fineness} {c.machine_id ? '(Em uso)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                * Atribuir um cilindro a uma máquina irá automaticamente remover o cilindro anterior da mesma.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>Cancelar</Button>
            <Button onClick={handleAssignCylinder}>Confirmar Atribuição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Máquinas usando esta agulha */}
      <Dialog open={!!needleUsageView} onOpenChange={() => setNeedleUsageView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Máquinas usando esta agulha</DialogTitle>
          </DialogHeader>
          {needleUsageView && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{needleUsageView.brand}</span> — <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{needleUsageView.reference_code}</code>
              </div>
              {(() => {
                const list = machines.filter(m => m.current_needle_id === needleUsageView.id).sort((a,b) => a.number - b.number);
                if (list.length === 0) return <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma máquina utilizando esta referência.</p>;
                return (
                  <div className="max-h-80 overflow-auto space-y-2">
                    {list.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded bg-muted/50">
                        <div>
                          <p className="font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.machine_type === 'mono' ? 'Mono Frontura' : m.machine_type === 'dupla' ? 'Dupla Frontura' : 'Tipo não definido'} {m.model ? `· ${m.model}` : ''} {m.diameter ? `· Ø ${m.diameter}` : ''} {m.fineness ? `· ${m.fineness}` : ''}</p>
                        </div>
                        <Badge variant="outline">{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNeedleUsageView(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Máquinas usando esta platina */}
      <Dialog open={!!sinkerUsageView} onOpenChange={() => setSinkerUsageView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Máquinas usando esta platina</DialogTitle>
          </DialogHeader>
          {sinkerUsageView && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{sinkerUsageView.brand}</span> — <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{sinkerUsageView.reference_code}</code>
              </div>
              {(() => {
                const list = machines.filter(m => m.current_sinker_id === sinkerUsageView.id).sort((a,b) => a.number - b.number);
                if (list.length === 0) return <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma máquina utilizando esta referência.</p>;
                return (
                  <div className="max-h-80 overflow-auto space-y-2">
                    {list.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded bg-muted/50">
                        <div>
                          <p className="font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">Mono Frontura {m.model ? `· ${m.model}` : ''} {m.diameter ? `· Ø ${m.diameter}` : ''} {m.fineness ? `· ${m.fineness}` : ''}</p>
                        </div>
                        <Badge variant="outline">{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSinkerUsageView(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
