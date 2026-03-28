import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Clock, Wrench, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS } from '@/types';
import type { Machine, MachineLog } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface MaintenanceObservation {
  id: string;
  observation: string;
  created_at: string;
}

interface MaintenanceViewModalProps {
  machine: Machine;
  currentLog: MachineLog | null;
  open: boolean;
  onClose: () => void;
}

export default function MaintenanceViewModal({ machine, currentLog, open, onClose }: MaintenanceViewModalProps) {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const [observations, setObservations] = useState<MaintenanceObservation[]>([]);
  const [newObs, setNewObs] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState('');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Load observations from DB
  useEffect(() => {
    if (!open || !currentLog) return;
    loadObservations();
  }, [open, currentLog?.id]);

  const loadObservations = async () => {
    if (!currentLog) return;
    const { data } = await (supabase.from as any)('machine_maintenance_observations')
      .select('*')
      .eq('machine_log_id', currentLog.id)
      .order('created_at', { ascending: true });
    if (data) setObservations(data);
  };

  // Timer
  useEffect(() => {
    if (!open || !currentLog) return;
    const update = () => {
      const start = new Date(currentLog.started_at).getTime();
      const now = Date.now();
      const diff = now - start;
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [open, currentLog]);

  const handleAddObservation = async () => {
    if (!newObs.trim() || !currentLog) return;
    setSaving(true);
    const { error } = await (supabase.from as any)('machine_maintenance_observations').insert({
      machine_log_id: currentLog.id,
      machine_id: machine.id,
      company_id: companyId,
      observation: newObs.trim(),
    });
    if (error) {
      toast.error('Erro ao salvar observação');
    } else {
      setNewObs('');
      setShowInput(false);
      await loadObservations();
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden" style={{ width: '100vw', height: '100vh', touchAction: 'none' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-bold text-foreground">{machine.name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Status & Timer */}
        <div className="space-y-4">
          <div className="card-glass p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">Motivo da Parada</span>
              <Badge className={cn("text-xs", MACHINE_STATUS_COLORS[machine.status])}>
                {MACHINE_STATUS_LABELS[machine.status]}
              </Badge>
            </div>
            {currentLog && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">Início</span>
                <span className="text-sm font-semibold text-foreground">
                  {format(new Date(currentLog.started_at), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>
            )}
          </div>

          <div className="card-glass p-6 flex flex-col items-center gap-2">
            <Clock className="h-8 w-8 text-primary" />
            <span className="text-sm text-muted-foreground">Tempo Parada</span>
            <span className="text-4xl font-display font-bold text-foreground tabular-nums">{elapsed}</span>
          </div>
        </div>

        {/* Observations */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Observações</h3>
            {!showInput && (
              <Button variant="outline" size="sm" onClick={() => setShowInput(true)}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            )}
          </div>

          {showInput && (
            <div className="card-glass p-3 space-y-2">
              <Textarea
                value={newObs}
                onChange={e => setNewObs(e.target.value)}
                placeholder="Escreva uma observação..."
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddObservation} disabled={saving || !newObs.trim()} className="btn-gradient">
                  <Send className="h-3 w-3 mr-1" /> Salvar
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setShowInput(false); setNewObs(''); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {observations.length === 0 && !showInput && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma observação registrada</p>
          )}

          <div className="space-y-2">
            {observations.map(obs => (
              <div key={obs.id} className="card-glass p-3 space-y-1">
                <p className="text-sm text-foreground">{obs.observation}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(obs.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
