import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Machine, ProductionMode } from '@/types';
import { PRODUCTION_MODE_LABELS } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  onSave: (machines: Machine[]) => Promise<void>;
}

export default function ProductionModeModal({ open, onOpenChange, machines, onSave }: Props) {
  const sorted = [...machines].sort((a, b) => a.number - b.number);
  const [modes, setModes] = useState<Record<string, ProductionMode>>({});
  const [saving, setSaving] = useState(false);

  // Initialize modes from machines when modal opens
  const getMachineMode = (m: Machine): ProductionMode => modes[m.id] ?? m.production_mode ?? 'rolos';

  const handleSave = async () => {
    const changed = Object.keys(modes);
    if (changed.length === 0) { onOpenChange(false); return; }
    setSaving(true);
    try {
      const updated = machines.map(m => changed.includes(m.id) ? { ...m, production_mode: modes[m.id] } : m);
      await onSave(updated);
      toast.success('Modos de registro atualizados');
      setModes({});
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar');
    }
    setSaving(false);
  };

  const setAllMode = (mode: ProductionMode) => {
    const newModes: Record<string, ProductionMode> = {};
    machines.forEach(m => { newModes[m.id] = mode; });
    setModes(newModes);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Modo de Registro de Produção</DialogTitle>
          <p className="text-sm text-muted-foreground">Configure como cada máquina registra a produção: por rolos ou por voltas.</p>
        </DialogHeader>

        <div className="flex gap-2 mb-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setAllMode('rolos')}>Todas por Rolos</Button>
          <Button variant="outline" size="sm" onClick={() => setAllMode('voltas')}>Todas por Voltas</Button>
          <Button variant="outline" size="sm" onClick={() => setAllMode('iot')}>Todas por IoT</Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {sorted.map(m => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
              <span className="font-medium text-foreground text-sm">{m.name}</span>
              <Select value={getMachineMode(m)} onValueChange={(v: ProductionMode) => setModes(prev => ({ ...prev, [m.id]: v }))}>
                <SelectTrigger className="w-[130px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCTION_MODE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setModes({}); onOpenChange(false); }}>Cancelar</Button>
          <Button className="btn-gradient" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
