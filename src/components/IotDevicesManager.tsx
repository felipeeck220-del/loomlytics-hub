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
import { Plus, Trash2, Loader2, Wifi, WifiOff, Copy, Cpu, Eye, RefreshCw } from 'lucide-react';
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
  const [logsDevice, setLogsDevice] = useState<IotDevice | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = useCallback(async (deviceId: string) => {
    setLogsLoading(true);
    const { data } = await sb('iot_device_logs')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(100);
    setLogs(data || []);
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    if (!logsDevice) { setLogs([]); return; }
    const devId = logsDevice.id;
    fetchLogs(devId);
    const channel = (supabase as any)
      .channel(`iot-logs-${devId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'iot_device_logs', filter: `device_id=eq.${devId}` },
        (payload: any) => {
          setLogs(prev => [payload.new, ...prev].slice(0, 100));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [logsDevice, fetchLogs]);

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Dispositivos IoT</h3>
            <Badge variant="outline" className="text-xs">{devices.length}</Badge>
          </div>
          <Button size="sm" className="btn-gradient shrink-0" onClick={openNew}>
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
              <div key={d.id} className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
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
                <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:shrink-0 justify-end">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(d.token, 'Token')} title="Copiar Token">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLogsDevice(d)} title="Ver logs em tempo real">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                  </Button>
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
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">📋 Dados para o firmware:</p>
              <p className="text-xs text-muted-foreground font-mono">COMPANY_ID: {companyId}
                <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 inline-flex" onClick={() => copyToClipboard(companyId, 'Company ID')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </p>
              {form.machine_id && (
                <p className="text-xs text-muted-foreground font-mono">MACHINE_ID: {form.machine_id}
                  <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 inline-flex" onClick={() => copyToClipboard(form.machine_id, 'Machine ID')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </p>
              )}
              <p className="text-xs text-muted-foreground font-mono">DEVICE_TOKEN: {form.token}
                <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 inline-flex" onClick={() => copyToClipboard(form.token, 'Token')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </p>
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

      {/* Logs em tempo real */}
      <Dialog open={!!logsDevice} onOpenChange={(open) => { if (!open) setLogsDevice(null); }}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-[100vw] h-[100vh] sm:max-w-[80vw] sm:max-h-[80vh] sm:w-[80vw] sm:h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Cpu className="h-4 w-4 text-primary" />
              Logs — {logsDevice?.name || 'Sensor'}
              <Badge variant="outline" className="text-xs">{logs.length}/100</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs">
                <span className="relative flex h-1.5 w-1.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Ao vivo
              </Badge>
              {logsDevice && (
                <Button variant="outline" size="icon" className="h-7 w-7 ml-auto" onClick={() => fetchLogs(logsDevice.id)} title="Recarregar">
                  <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 border-t border-border pt-2">
            {logsLoading && logs.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Cpu className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum log recebido ainda</p>
                <p className="text-xs mt-1">Assim que o dispositivo enviar dados, aparecerá aqui automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-1.5 py-2">
                {logs.map((log) => {
                  const isError = log.response_status && log.response_status >= 400;
                  const isIgnored = log.response_body && String(log.response_body).includes('ignored');
                  const expanded = expandedLog === log.id;
                  return (
                    <div
                      key={log.id}
                      className={`rounded border font-mono text-xs cursor-pointer transition-colors ${
                        isError
                          ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10'
                          : isIgnored
                          ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                          : 'border-border bg-muted/30 hover:bg-muted/60'
                      }`}
                      onClick={() => setExpandedLog(expanded ? null : log.id)}
                    >
                      <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
                        <span className="text-muted-foreground shrink-0">
                          {new Date(log.created_at).toLocaleTimeString('pt-BR', { hour12: false })}
                          <span className="opacity-60 ml-1">
                            {new Date(log.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 h-4 ${
                            isError
                              ? 'border-destructive/40 text-destructive'
                              : isIgnored
                              ? 'border-amber-500/40 text-amber-600'
                              : 'border-emerald-500/40 text-emerald-600'
                          }`}
                        >
                          HTTP {log.response_status ?? '-'}
                        </Badge>
                        {log.rpm != null && (
                          <span className="text-foreground">RPM: <b>{log.rpm}</b></span>
                        )}
                        {log.total_rotations != null && (
                          <span className="text-muted-foreground">Rot: {log.total_rotations}</span>
                        )}
                        {log.is_running != null && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${log.is_running ? 'text-emerald-600 border-emerald-500/40' : 'text-muted-foreground'}`}>
                            {log.is_running ? 'RUN' : 'STOP'}
                          </Badge>
                        )}
                        {log.wifi_rssi != null && (
                          <span className="text-muted-foreground">RSSI: {log.wifi_rssi}dBm</span>
                        )}
                        {log.uptime_ms != null && (
                          <span className="text-muted-foreground">Up: {Math.floor(log.uptime_ms / 1000)}s</span>
                        )}
                        {log.error && (
                          <span className="text-destructive truncate max-w-[300px]" title={log.error}>⚠ {log.error}</span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground/60">{expanded ? '▲' : '▼'}</span>
                      </div>
                      {expanded && (
                        <div className="border-t border-border/50 px-2 py-2 space-y-1 bg-background/40">
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground mb-0.5">Payload recebido</p>
                            <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted/40 rounded p-2 max-h-40 overflow-auto">
{JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground mb-0.5">Resposta</p>
                            <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted/40 rounded p-2 max-h-32 overflow-auto">
{log.response_body || '(vazio)'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground text-center pt-1">
            Mantém os últimos 100 registros por dispositivo — novos entram no topo em tempo real, antigos são descartados automaticamente.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
