import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
 import { Wrench, ChevronLeft, ChevronRight, Search, History, Plus, Loader2, Filter } from 'lucide-react';
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
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS, type MachineStatus, type MachineLog } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getDateLimits, isDateValid } from '@/lib/formatters';
import { usePermissions } from '@/hooks/usePermissions';

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
     loading 
   } = useSharedCompanyData();
   const needles = getNeedles();
   const needleTransactions = getNeedleTransactions();
   // Needle Management State
   const [needleSearch, setNeedleSearch] = useState('');
   const [showNeedleModal, setShowNeedleModal] = useState(false);
   const [showEntryModal, setShowEntryModal] = useState(false);
   const [showExitModal, setShowExitModal] = useState(false);
   const [needleForm, setNeedleForm] = useState({ provider: '', brand: '', reference_code: '' });
   const [entryForm, setEntryForm] = useState({ needle_id: '', quantity: '', date: format(new Date(), 'yyyy-MM-dd') });
   const [exitForm, setExitForm] = useState({ needle_id: '', quantity: '', machine_id: '', mode: 'reposicao' as 'reposicao' | 'troca_agulheiro', date: format(new Date(), 'yyyy-MM-dd') });
 
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

      // From end of last needle change to today
      const needleFromDate = lastNeedle
        ? format(new Date(lastNeedle.ended_at || lastNeedle.started_at), 'yyyy-MM-dd')
        : '2000-01-01';
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
       await saveNeedles([...needles, newNeedle]);
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
     const needle = needles.find(n => n.id === exitForm.needle_id);
     if (needle && needle.current_quantity < Number(exitForm.quantity)) {
       toast.error('Saldo insuficiente em estoque.');
       return;
     }
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
       toast.success('Baixa registrada!');
       setShowExitModal(false);
       setExitForm({ needle_id: '', quantity: '', machine_id: '', mode: 'reposicao', date: format(new Date(), 'yyyy-MM-dd') });
     } catch (e) { toast.error('Erro ao registrar baixa.'); }
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
         </TabsList>
         {/* Agulhas Tab */}
         <TabsContent value="agulhas">
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
                   <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Movimentações (Mês)</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{needleTransactions.filter(t => t.date.startsWith(format(new Date(), 'yyyy-MM'))).length}</div>
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
                       </tr>
                     </thead>
                     <tbody>
                       {needles
                         .filter(n => 
                           n.brand.toLowerCase().includes(needleSearch.toLowerCase()) || 
                           n.provider.toLowerCase().includes(needleSearch.toLowerCase()) || 
                           n.reference_code.toLowerCase().includes(needleSearch.toLowerCase())
                         )
                         .map(n => (
                         <tr key={n.id} className="border-b hover:bg-muted/30 transition-colors">
                           <td className="p-4">{n.provider}</td>
                           <td className="p-4">{n.brand}</td>
                           <td className="p-4"><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{n.reference_code}</code></td>
                           <td className="p-4 text-right font-bold">{n.current_quantity}</td>
                         </tr>
                       ))}
                       {needles.length === 0 && (
                         <tr>
                           <td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhuma agulha cadastrada</td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>
               </CardContent>
             </Card>
 
             <div className="space-y-4">
               <div className="flex items-center gap-2">
                 <History className="h-5 w-5 text-primary" />
                 <h3 className="font-semibold">Histórico de Movimentações</h3>
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
                         </tr>
                       </thead>
                       <tbody>
                         {needleTransactions.map(t => {
                           const needle = needles.find(n => n.id === t.needle_id);
                           const machine = machines.find(m => m.id === t.machine_id);
                           return (
                             <tr key={t.id} className="border-b">
                               <td className="p-4">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                               <td className="p-4">
                                 <Badge variant={t.type === 'entry' ? 'default' : 'destructive'} className="text-[10px] uppercase">
                                   {t.type === 'entry' ? 'Entrada' : t.exit_mode === 'troca_agulheiro' ? 'Troca' : 'Reposição'}
                                 </Badge>
                               </td>
                               <td className="p-4">{needle?.brand} ({needle?.reference_code})</td>
                               <td className="p-4">{machine?.name || '—'}</td>
                               <td className="p-4 text-right font-medium">{t.quantity}</td>
                             </tr>
                           );
                         })}
                         {needleTransactions.length === 0 && (
                           <tr>
                             <td colSpan={5} className="p-8 text-center text-muted-foreground">Sem movimentações registradas</td>
                           </tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                 </CardContent>
               </Card>
             </div>
           </div>
         </TabsContent>
 

        {/* Calendário Tab */}
        <TabsContent value="calendario">
          <Card className="w-full">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg">Calendário de Manutenções</CardTitle>
                  <Button size="sm" onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs sm:text-sm font-medium min-w-[110px] sm:min-w-[140px] text-center capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="flex flex-wrap gap-2 sm:gap-3 mb-3">
                {MAINTENANCE_STATUSES.map(status => (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className={cn('h-3 w-3 rounded-full', MACHINE_STATUS_COLORS[status].split(' ')[0])} />
                    <span className="text-xs text-muted-foreground">{MACHINE_STATUS_LABELS[status]}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {weekDays.map(d => (
                  <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {daysInMonth.map(day => {
                  const key = format(day, 'yyyy-MM-dd');
                  const events = dayEventsMap.get(key) || [];
                  const hasEvents = events.length > 0;
                  const isToday = isSameDay(day, new Date());
                  const dayStatuses = [...new Set(events.map(e => e.status as MachineStatus))];

                  return (
                    <button
                      key={key}
                      onClick={() => hasEvents && setSelectedDay(day)}
                      className={cn(
                        'rounded-md border flex flex-col items-center justify-center gap-0.5 transition-all text-xs relative p-1.5',
                        isToday && 'border-primary',
                        hasEvents
                          ? 'border-warning/50 bg-warning/5 hover:bg-warning/10 cursor-pointer'
                          : 'border-border hover:bg-accent/50 cursor-default',
                      )}
                    >
                      <span className={cn('font-medium', isToday ? 'text-primary' : 'text-foreground')}>
                        {format(day, 'd')}
                      </span>
                      {hasEvents && (
                        <div className="flex gap-0.5">
                          {dayStatuses.map((status, idx) => (
                            <div key={idx} className={cn('h-1.5 w-1.5 rounded-full', MACHINE_STATUS_COLORS[status].split(' ')[0])} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
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
                          {lastNeedle
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
           <div className="space-y-1">
             <Label>Agulha</Label>
             <Select value={entryForm.needle_id} onValueChange={v => setEntryForm({...entryForm, needle_id: v})}>
               <SelectTrigger><SelectValue placeholder="Selecione a agulha" /></SelectTrigger>
               <SelectContent>
                 {needles.map(n => <SelectItem key={n.id} value={n.id}>{n.brand} ({n.reference_code})</SelectItem>)}
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
           <div className="space-y-1">
             <Label>Agulha</Label>
             <Select value={exitForm.needle_id} onValueChange={v => setExitForm({...exitForm, needle_id: v})}>
               <SelectTrigger><SelectValue placeholder="Selecione a agulha" /></SelectTrigger>
               <SelectContent>
                 {needles.map(n => <SelectItem key={n.id} value={n.id}>{n.brand} ({n.reference_code}) - Saldo: {n.current_quantity}</SelectItem>)}
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
   </div>
 );
}
