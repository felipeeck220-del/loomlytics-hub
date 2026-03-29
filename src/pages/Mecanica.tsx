import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Wrench, ChevronLeft, ChevronRight, Search, History, Plus, Loader2 } from 'lucide-react';
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
import { usePermissions } from '@/hooks/usePermissions';

const MAINTENANCE_STATUSES: MachineStatus[] = [
  'manutencao_preventiva',
  'manutencao_corretiva',
  'troca_artigo',
  'troca_agulhas',
];

export default function MecanicaPage() {
  const { getMachines, getMachineLogs, getProductions, saveMachineLogs, loading } = useSharedCompanyData();
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
                  <span className="text-xs text-muted-foreground font-medium">Última Troca de Agulhas</span>
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
        </TabsList>

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
                          Desde última Troca de Agulhas
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
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro de manutenção preventiva ou troca de agulhas.</p>
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
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatCurrency(revenue)}</p>
                      <p className="text-[10px] text-muted-foreground">Faturamento</p>
                    </div>
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
        <DialogContent className="max-w-md">
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
                <Input type="date" value={addStartDate} onChange={e => setAddStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Hora Início</Label>
                <Input type="time" value={addStartTime} onChange={e => setAddStartTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Fim</Label>
                <Input type="date" value={addEndDate} onChange={e => setAddEndDate(e.target.value)} />
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
    </div>
  );
}
