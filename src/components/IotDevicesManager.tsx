import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Loader2, Wifi, WifiOff, Copy, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const sb = (table: string) => (supabase.from as any)(table);

interface IotDevice {
  id: string;
  machine_id: string;
  company_id: string;
  token: string;
  name: string | null;
  active: boolean;
  firmware_version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export default function IotDevicesManager() {
  const { user } = useAuth();
  const { getMachines } = useSharedCompanyData();
  const machines = getMachines();
  const companyId = user?.company_id || '';

  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDelete, setShowDelete] = useState<IotDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', machine_id: '', token: '' });

  const fetchDevices = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await sb('iot_devices').select('*').eq('company_id', companyId).order('created_at');
    setDevices(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
  };

  const openNew = () => {
    setForm({ name: '', machine_id: '', token: generateToken() });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.machine_id) { toast.error('Selecione uma máquina'); return; }
    if (!form.token.trim()) { toast.error('Token é obrigatório'); return; }

    const existing = devices.find(d => d.machine_id === form.machine_id);
    if (existing) { toast.error('Esta máquina já possui um dispositivo IoT cadastrado'); return; }

    setSaving(true);
    try {
      const { error } = await sb('iot_devices').insert({
        company_id: companyId,
        machine_id: form.machine_id,
        token: form.token.trim(),
        name: form.name.trim() || null,
      });
      if (error) throw error;
      toast.success('Dispositivo cadastrado');
      setShowModal(false);
      fetchDevices();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    try {
      await sb('iot_devices').delete().eq('id', showDelete.id);
      toast.success('Dispositivo removido');
      setShowDelete(null);
      fetchDevices();
    } catch {
      toast.error('Erro ao remover');
    }
  };

  const handleToggleActive = async (d: IotDevice) => {
    try {
      await sb('iot_devices').update({ active: !d.active }).eq('id', d.id);
      toast.success(d.active ? 'Dispositivo desativado' : 'Dispositivo ativado');
      fetchDevices();
    } catch {
      toast.error('Erro ao alterar status');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const getMachineName = (machineId: string) => {
    const m = machines.find(m => m.id === machineId);
    return m ? `TEAR ${String(m.number).padStart(2, '0')} - ${m.name}` : 'Máquina não encontrada';
  };

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  };

  const maskToken = (token: string) => token.slice(0, 6) + '••••••••' + token.slice(-4);

  const availableMachines = machines.filter(m => !devices.some(d => d.machine_id === m.id));

  if (loading) {
    return (
      <div className="card-glass p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando dispositivos IoT...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Dispositivos IoT</h3>
            <Badge variant="outline" className="text-xs">{devices.length}</Badge>
          </div>
          <Button size="sm" className="btn-gradient" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Dispositivo
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Cadastre e gerencie os sensores ESP32. Após criado, o dispositivo não pode ser editado — exclua e crie outro se necessário.
        </p>

        {devices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Cpu className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum dispositivo IoT cadastrado</p>
            <p className="text-xs mt-1">Clique em "Novo Dispositivo" para cadastrar seu primeiro sensor</p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map(d => (
              <div key={d.id} className="rounded-lg border p-4 flex items-center justify-between hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    isOnline(d.last_seen_at) ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-muted border border-border'
                  }`}>
                    {isOnline(d.last_seen_at) ? (
                      <Wifi className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm">{d.name || 'Sensor sem nome'}</p>
                      <Badge variant={d.active ? 'default' : 'secondary'} className="text-xs">
                        {d.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      {isOnline(d.last_seen_at) ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs">Online</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Offline</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{getMachineName(d.machine_id)}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{maskToken(d.token)}</span>
                      {d.firmware_version && <span>FW: {d.firmware_version}</span>}
                      {d.last_seen_at && (
                        <span>Visto: {formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true, locale: ptBR })}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(d)} title={d.active ? 'Desativar' : 'Ativar'}>
                    {d.active ? <WifiOff className="h-3.5 w-3.5 text-warning" /> : <Wifi className="h-3.5 w-3.5 text-emerald-500" />}
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setShowDelete(d)} title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal — no editing allowed */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Dispositivo IoT</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome (opcional)</Label>
              <Input placeholder="Ex: Sensor TEAR 01" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Máquina *</Label>
              <Select value={form.machine_id} onValueChange={v => setForm(f => ({ ...f, machine_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                <SelectContent>
                  {availableMachines.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      TEAR {String(m.number).padStart(2, '0')} - {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Token de Autenticação *</Label>
              <div className="flex gap-2">
                <Input value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} className="font-mono text-xs" />
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => setForm(f => ({ ...f, token: generateToken() }))} title="Gerar novo token">
                  <Cpu className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(form.token, 'Token')} title="Copiar">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">⚠️ Copie e salve este token agora. Após cadastrar, ele não poderá ser visualizado novamente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="btn-gradient" disabled={saving} onClick={handleSave}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover dispositivo?</AlertDialogTitle>
            <AlertDialogDescription>
              O dispositivo "{showDelete?.name || 'Sensor'}" será removido permanentemente. O ESP32 parará de enviar dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
