import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Wrench, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS, type MachineStatus } from '@/types';
import { cn } from '@/lib/utils';

const MAINTENANCE_STATUSES: MachineStatus[] = [
  'manutencao_preventiva',
  'manutencao_corretiva',
  'troca_artigo',
  'troca_agulhas',
];

export default function MecanicaPage() {
  const { machines, machineLogs } = useSharedCompanyData();
  const [selectedMachineId, setSelectedMachineId] = useState<string>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const activeMachines = useMemo(() => machines.filter(m => m.status !== 'inativa'), [machines]);

  // Filter logs for maintenance-related statuses
  const maintenanceLogs = useMemo(() => {
    return machineLogs.filter(log => {
      const status = log.status as MachineStatus;
      const matchStatus = MAINTENANCE_STATUSES.includes(status);
      const matchMachine = selectedMachineId === 'all' || log.machine_id === selectedMachineId;
      return matchStatus && matchMachine;
    });
  }, [machineLogs, selectedMachineId]);

  // Last preventive maintenance and last needle change for selected machine
  const lastPreventive = useMemo(() => {
    if (selectedMachineId === 'all') return null;
    const logs = maintenanceLogs
      .filter(l => l.machine_id === selectedMachineId && l.status === 'manutencao_preventiva')
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    return logs[0] || null;
  }, [maintenanceLogs, selectedMachineId]);

  const lastNeedleChange = useMemo(() => {
    if (selectedMachineId === 'all') return null;
    const logs = maintenanceLogs
      .filter(l => l.machine_id === selectedMachineId && l.status === 'troca_agulhas')
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    return logs[0] || null;
  }, [maintenanceLogs, selectedMachineId]);

  // Calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart); // 0=Sunday

  // Map days with events
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

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-purple-600" />
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

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Calendário de Manutenções</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {MAINTENANCE_STATUSES.map(status => (
              <div key={status} className="flex items-center gap-1.5">
                <div className={cn('h-3 w-3 rounded-full', MACHINE_STATUS_COLORS[status].split(' ')[0])} />
                <span className="text-xs text-muted-foreground">{MACHINE_STATUS_LABELS[status]}</span>
              </div>
            ))}
          </div>

          {/* Week headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for offset */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {daysInMonth.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const events = dayEventsMap.get(key) || [];
              const hasEvents = events.length > 0;
              const isToday = isSameDay(day, new Date());

              // Get unique statuses for this day
              const dayStatuses = [...new Set(events.map(e => e.status as MachineStatus))];

              return (
                <button
                  key={key}
                  onClick={() => hasEvents && setSelectedDay(day)}
                  className={cn(
                    'aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all text-sm relative',
                    isToday && 'border-primary',
                    hasEvents
                      ? 'border-warning/50 bg-warning/5 hover:bg-warning/10 cursor-pointer'
                      : 'border-border hover:bg-accent/50 cursor-default',
                  )}
                >
                  <span className={cn(
                    'font-medium',
                    isToday ? 'text-primary' : 'text-foreground',
                  )}>
                    {format(day, 'd')}
                  </span>
                  {hasEvents && (
                    <div className="flex gap-0.5">
                      {dayStatuses.map(status => (
                        <div
                          key={status}
                          className={cn('h-1.5 w-1.5 rounded-full', MACHINE_STATUS_COLORS[status].split(' ')[0])}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
                      {log.ended_at && ` — Fim: ${format(new Date(log.ended_at), "HH:mm", { locale: ptBR })}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
