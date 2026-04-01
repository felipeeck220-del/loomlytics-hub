import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Monitor, Plus, Loader2, Trash2, Unplug, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface TvPanel {
  id: string;
  company_id: string;
  code: string;
  name: string;
  panel_type: string;
  enabled_machines: string[];
  is_connected: boolean;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  number: number;
}

export default function SettingsTelasTab() {
  const { user } = useAuth();
  const [panels, setPanels] = useState<TvPanel[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [panelsRes, machinesRes] = await Promise.all([
      (supabase.from as any)('tv_panels')
        .select('*')
        .order('created_at'),
      (supabase.from as any)('machines')
        .select('id, name, number')
        .order('number'),
    ]);
    if (panelsRes.data) setPanels(panelsRes.data);
    if (machinesRes.data) setMachines(machinesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Realtime subscription for panels
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('settings-tv-panels')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tv_panels',
      }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const generateCode = (): string => {
    return Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  };

  const handleGeneratePanel = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const nextNumber = panels.length + 1;
      let code = generateCode();
      
      // Check uniqueness (try up to 5 times)
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await (supabase.from as any)('tv_panels')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!existing) break;
        code = generateCode();
      }

      // All machines enabled by default
      const allMachineIds = machines.map(m => m.id);

      const { error } = await (supabase.from as any)('tv_panels').insert({
        company_id: user.company_id,
        code,
        name: `Painel ${nextNumber}`,
        panel_type: 'machine_grid',
        enabled_machines: allMachineIds,
        is_connected: false,
      });

      if (error) throw error;
      toast.success(`Código gerado: ${code}`);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar código');
    }
    setGenerating(false);
  };

  const handleDisconnect = async (panelId: string) => {
    setDisconnecting(panelId);
    try {
      const { error } = await (supabase.from as any)('tv_panels')
        .update({ is_connected: false })
        .eq('id', panelId);
      if (error) throw error;
      toast.success('TV desconectada');
      await fetchData();
    } catch (err: any) {
      toast.error('Erro ao desconectar');
    }
    setDisconnecting(null);
  };

  const handleDelete = async (panelId: string) => {
    setDeleting(panelId);
    try {
      const { error } = await (supabase.from as any)('tv_panels')
        .delete()
        .eq('id', panelId);
      if (error) throw error;
      toast.success('Painel removido');
      setShowDeleteConfirm(null);
      await fetchData();
    } catch (err: any) {
      toast.error('Erro ao excluir');
    }
    setDeleting(null);
  };

  const handleToggleMachine = async (panelId: string, machineId: string, currentEnabled: string[]) => {
    const newEnabled = currentEnabled.includes(machineId)
      ? currentEnabled.filter(id => id !== machineId)
      : [...currentEnabled, machineId];

    try {
      const { error } = await (supabase.from as any)('tv_panels')
        .update({ enabled_machines: newEnabled })
        .eq('id', panelId);
      if (error) throw error;
      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, enabled_machines: newEnabled } : p));
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const handleToggleAll = async (panelId: string, currentEnabled: string[]) => {
    const allIds = machines.map(m => m.id);
    const allEnabled = allIds.every(id => currentEnabled.includes(id));
    const newEnabled = allEnabled ? [] : allIds;

    try {
      const { error } = await (supabase.from as any)('tv_panels')
        .update({ enabled_machines: newEnabled })
        .eq('id', panelId);
      if (error) throw error;
      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, enabled_machines: newEnabled } : p));
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Código copiado!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-foreground text-lg">Telas Conectadas</h2>
            <p className="text-sm text-muted-foreground">Conecte TVs ao painel de produção</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-sm text-foreground font-medium">Como conectar uma TV:</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Gere um código abaixo clicando em "Gerar Código"</li>
            <li>Na TV, acesse <strong className="text-foreground">malhagest.site/tela</strong></li>
            <li>Digite o código de 8 dígitos gerado</li>
            <li>O painel de produção será exibido automaticamente</li>
          </ol>
        </div>

        <Button onClick={handleGeneratePanel} disabled={generating} className="btn-gradient">
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Gerar Código para Nova Tela
        </Button>
      </div>

      {/* Panels list */}
      {panels.length === 0 ? (
        <div className="card-glass p-8 text-center">
          <Monitor className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma tela cadastrada</p>
          <p className="text-sm text-muted-foreground/60">Gere um código para conectar sua primeira TV</p>
        </div>
      ) : (
        <div className="space-y-4">
          {panels.map(panel => {
            const allIds = machines.map(m => m.id);
            const allEnabled = allIds.length > 0 && allIds.every(id => panel.enabled_machines.includes(id));

            return (
              <div key={panel.id} className="card-glass p-5 space-y-4">
                {/* Panel header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Monitor className="h-5 w-5 text-primary" />
                    <span className="font-display font-bold text-foreground text-lg">{panel.name}</span>
                    <Badge variant={panel.is_connected ? 'default' : 'secondary'} className="text-xs">
                      {panel.is_connected ? '🟢 Conectado' : '⚪ Aguardando'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {panel.is_connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(panel.id)}
                        disabled={disconnecting === panel.id}
                        className="text-warning border-warning/30 hover:bg-warning/10"
                      >
                        {disconnecting === panel.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unplug className="h-4 w-4 mr-1" />}
                        Desconectar TV
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setShowDeleteConfirm(panel.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>

                {/* Code display */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Código:</span>
                  <div className="flex items-center gap-1.5 font-mono text-lg tracking-widest text-foreground bg-muted/30 rounded-lg px-3 py-1.5 border border-border">
                    {panel.code.split('').map((d, i) => (
                      <span key={i} className="font-bold">{d}</span>
                    ))}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyCode(panel.code)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                {/* Content type */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tipo:</span>
                  <Badge variant="outline">Grid de Máquinas</Badge>
                </div>

                {/* Machine selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Máquinas visíveis neste painel:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAll(panel.id, panel.enabled_machines)}
                      className="text-xs"
                    >
                      {allEnabled ? 'Desmarcar todas' : 'Selecionar todas'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {machines.map(machine => {
                      const isEnabled = panel.enabled_machines.includes(machine.id);
                      return (
                        <label
                          key={machine.id}
                          className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-all text-sm
                            ${isEnabled
                              ? 'border-primary/30 bg-primary/5 text-foreground'
                              : 'border-border bg-muted/10 text-muted-foreground'
                            }`}
                        >
                          <Checkbox
                            checked={isEnabled}
                            onCheckedChange={() => handleToggleMachine(panel.id, machine.id, panel.enabled_machines)}
                          />
                          <span className="font-medium">{machine.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir painel?</AlertDialogTitle>
            <AlertDialogDescription>
              O código será invalidado e qualquer TV usando-o será desconectada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
              disabled={!!deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
