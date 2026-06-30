import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Play, Square, Trash2, Pencil, Clock, AlertTriangle, Wrench, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type {
  Machine, MaintenanceOrder, MaintenanceOrderItem, MaintenanceOrderItemType,
  MaintenanceOrderType, MaintenanceOrderPriority, MaintenanceOrderStatus,
  NeedleInventory, SinkerInventory, Cylinder,
} from '@/types';
import { SearchableSelect } from '@/components/SearchableSelect';

const TYPE_LABELS: Record<MaintenanceOrderType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  troca_artigo: 'Troca de Artigo',
  troca_agulhas: 'Troca de Agulheiro',
};
const TYPE_COLORS: Record<MaintenanceOrderType, string> = {
  manutencao_preventiva: 'bg-warning/15 text-warning border-warning/30',
  manutencao_corretiva: 'bg-destructive/15 text-destructive border-destructive/30',
  troca_artigo: 'bg-info/15 text-info border-info/30',
  troca_agulhas: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
};

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

function useLiveTimer(startedAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

function LiveTimer({ startedAt }: { startedAt?: string | null }) {
  const s = useLiveTimer(startedAt);
  return <span className="font-mono tabular-nums">{fmtDuration(s)}</span>;
}

interface Props {
  machines: Machine[];
  needles: NeedleInventory[];
  sinkers: SinkerInventory[];
  cylinders: Cylinder[];
  refreshMachines: () => void;
}

export default function MaintenanceOrdersTab({ machines, needles, sinkers, cylinders, refreshMachines }: Props) {
  const { user } = useAuth();
  const { logAction, userName, userCode } = useAuditLog();
  const { role } = usePermissions();
  const companyId = user?.company_id || '';
  const authorLabel = userName ? (userCode ? `${userName} #${userCode}` : userName) : null;

  const canManage = role === 'admin' || role === 'lider_mecanica';
  const canExecute = canManage || role === 'mecanico' || role === 'lider';

  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [items, setItems] = useState<MaintenanceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MaintenanceOrderStatus>('aberto');
  // Confirm dialogs
  const [confirmStart, setConfirmStart] = useState<MaintenanceOrder | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<MaintenanceOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<MaintenanceOrder | null>(null);
  const [confirmFinishGate, setConfirmFinishGate] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: o }, { data: i }] = await Promise.all([
      (supabase.from as any)('maintenance_orders').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      (supabase.from as any)('maintenance_order_items').select('*').eq('company_id', companyId),
    ]);
    setOrders((o as MaintenanceOrder[]) || []);
    setItems((i as MaintenanceOrderItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const machineById = useMemo(() => Object.fromEntries(machines.map(m => [m.id, m])), [machines]);

  // ============ CREATE / EDIT MODAL ============
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceOrder | null>(null);
  const [form, setForm] = useState({
    machine_id: '',
    type: 'manutencao_preventiva' as MaintenanceOrderType,
    priority: 'normal' as MaintenanceOrderPriority,
    description: '',
  });
  const openCreate = () => {
    setEditing(null);
    setForm({ machine_id: '', type: 'manutencao_preventiva', priority: 'normal', description: '' });
    setCreateOpen(true);
  };
  const openEdit = (o: MaintenanceOrder) => {
    setEditing(o);
    setForm({ machine_id: o.machine_id, type: o.type, priority: o.priority, description: o.description || '' });
    setCreateOpen(true);
  };
  const saveOrder = async () => {
    if (!form.machine_id) { toast.error('Selecione uma máquina'); return; }
    // Bloqueia criar nova OM para uma máquina que já tem OM aberta ou em curso
    if (!editing) {
      const busy = orders.find(o => o.machine_id === form.machine_id && (o.status === 'aberto' || o.status === 'em_curso'));
      if (busy) {
        const m = machineById[form.machine_id];
        toast.error(`${m?.name || 'Máquina'} já tem a OM #${String(busy.om_number).padStart(3, '0')} ${busy.status === 'aberto' ? 'em aberto' : 'em curso'}. Finalize ou cancele antes de criar outra.`);
        return;
      }
    }
    if (editing) {
      const { error } = await (supabase.from as any)('maintenance_orders').update({
        machine_id: form.machine_id, type: form.type, priority: form.priority, description: form.description || null,
      }).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar OM'); return; }
      toast.success(`OM #${String(editing.om_number).padStart(3, '0')} atualizada`);
      logAction('om_update', { om: editing.om_number });
    } else {
      const { data, error } = await (supabase.from as any)('maintenance_orders').insert({
        company_id: companyId,
        machine_id: form.machine_id,
        type: form.type,
        priority: form.priority,
        description: form.description || null,
        created_by_id: user?.id,
        created_by_name: authorLabel,
      }).select().single();
      if (error) { toast.error('Erro ao criar OM'); return; }
      toast.success(`OM #${String((data as any).om_number).padStart(3, '0')} criada`);
      logAction('om_create', { om: (data as any).om_number, type: form.type });
    }
    setCreateOpen(false);
    await load();
  };

  // ============ START ============
  const startOrder = async (o: MaintenanceOrder) => {
    if (!canExecute) return;
    const now = new Date().toISOString();
    // 1) cria machine_log
    const { data: log, error: logErr } = await (supabase.from as any)('machine_logs').insert({
      machine_id: o.machine_id,
      company_id: companyId,
      status: o.type,
      started_at: now,
      started_by_name: authorLabel,
    }).select().single();
    if (logErr) { toast.error('Erro ao registrar início'); return; }
    // 2) atualiza machines.status
    await (supabase.from as any)('machines').update({ status: o.type }).eq('id', o.machine_id);
    // 3) atualiza OM
    const { error } = await (supabase.from as any)('maintenance_orders').update({
      status: 'em_curso', started_at: now, started_by_id: user?.id, started_by_name: authorLabel,
      machine_log_id: (log as any).id,
    }).eq('id', o.id);
    if (error) { toast.error('Erro ao iniciar OM'); return; }
    toast.success('OM iniciada');
    logAction('om_start', { om: o.om_number });
    refreshMachines();
    await load();
  };

  // ============ FINISH MODAL ============
  const [finishOrder, setFinishOrder] = useState<MaintenanceOrder | null>(null);
  const [finishItems, setFinishItems] = useState<Array<{ item_type: MaintenanceOrderItemType; ref_id: string; description: string; quantity: number }>>([]);
  const openFinish = (o: MaintenanceOrder) => {
    setFinishOrder(o);
    setFinishItems([]);
  };
  const addItem = () => setFinishItems(p => [...p, { item_type: 'agulha', ref_id: '', description: '', quantity: 1 }]);
  const removeItem = (idx: number) => setFinishItems(p => p.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<{ item_type: MaintenanceOrderItemType; ref_id: string; description: string; quantity: number }>) =>
    setFinishItems(p => p.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const confirmFinish = async () => {
    if (!finishOrder || !finishOrder.started_at) return;
    const now = new Date().toISOString();
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(finishOrder.started_at).getTime()) / 1000));

    // 1) fecha machine_log
    if (finishOrder.machine_log_id) {
      await (supabase.from as any)('machine_logs').update({
        ended_at: now, ended_by_name: authorLabel,
      }).eq('id', finishOrder.machine_log_id);
    }
    // 2) máquina volta a ativa
    await (supabase.from as any)('machines').update({ status: 'ativa' }).eq('id', finishOrder.machine_id);

    // 3) atualiza OM
    const { error } = await (supabase.from as any)('maintenance_orders').update({
      status: 'finalizada', finished_at: now, finished_by_id: user?.id, finished_by_name: authorLabel,
      duration_seconds: seconds,
    }).eq('id', finishOrder.id);
    if (error) { toast.error('Erro ao finalizar OM'); return; }

    // 4) insere itens
    const itemsToInsert = finishItems.filter(it => it.quantity > 0 && (it.ref_id || it.description)).map(it => ({
      company_id: companyId,
      order_id: finishOrder.id,
      item_type: it.item_type,
      needle_id: it.item_type === 'agulha' ? (it.ref_id || null) : null,
      sinker_id: it.item_type === 'platina' ? (it.ref_id || null) : null,
      cylinder_id: it.item_type === 'cilindro' ? (it.ref_id || null) : null,
      description: it.description || null,
      quantity: it.quantity,
    }));
    if (itemsToInsert.length) {
      await (supabase.from as any)('maintenance_order_items').insert(itemsToInsert);
    }

    // 5) trocas de agulha/platina viram transações de estoque (saída)
    //    + atualizam automaticamente as referências em USO da máquina
    const machine = machines.find(m => m.id === finishOrder.machine_id);
    const isDupla = machine?.machine_type === 'dupla';
    for (const it of itemsToInsert) {
      if (it.item_type === 'agulha' && it.needle_id) {
        await (supabase.from as any)('needle_transactions').insert({
          company_id: companyId, needle_id: it.needle_id, type: 'exit',
          exit_mode: finishOrder.type === 'troca_agulhas' ? 'troca_agulheiro' : 'reposicao',
          quantity: it.quantity, date: now.slice(0, 10), machine_id: finishOrder.machine_id,
          created_by_id: user?.id, created_by_name: authorLabel,
        });
        // Atualiza ref em uso (substitui posição correspondente)
        const position = isDupla ? 'cilindro' : 'mono';
        await (supabase.from as any)('machine_needle_refs')
          .delete()
          .eq('machine_id', finishOrder.machine_id)
          .eq('position', position);
        await (supabase.from as any)('machine_needle_refs').insert({
          company_id: companyId, machine_id: finishOrder.machine_id,
          needle_id: it.needle_id, position,
        });
      } else if (it.item_type === 'platina' && it.sinker_id) {
        await (supabase.from as any)('sinker_transactions').insert({
          company_id: companyId, sinker_id: it.sinker_id, type: 'exit',
          exit_mode: 'troca_platinas', quantity: it.quantity, date: now.slice(0, 10),
          machine_id: finishOrder.machine_id,
          created_by_id: user?.id, created_by_name: authorLabel,
        });
        await (supabase.from as any)('machine_sinker_refs')
          .delete()
          .eq('machine_id', finishOrder.machine_id);
        await (supabase.from as any)('machine_sinker_refs').insert({
          company_id: companyId, machine_id: finishOrder.machine_id, sinker_id: it.sinker_id,
        });
      } else if (it.item_type === 'cilindro' && it.cylinder_id) {
        // Libera cilindro anterior e atribui o novo
        if (machine?.cylinder_id && machine.cylinder_id !== it.cylinder_id) {
          await (supabase.from as any)('cylinders').update({ machine_id: null }).eq('id', machine.cylinder_id);
        }
        await (supabase.from as any)('machines').update({ cylinder_id: it.cylinder_id }).eq('id', finishOrder.machine_id);
        await (supabase.from as any)('cylinders').update({ machine_id: finishOrder.machine_id }).eq('id', it.cylinder_id);
      }
    }

    toast.success('OM finalizada');
    logAction('om_finish', { om: finishOrder.om_number, duration_s: seconds, items: itemsToInsert.length });
    setFinishOrder(null);
    refreshMachines();
    await load();
  };

  // ============ CANCEL ============
  const cancelOrder = async (o: MaintenanceOrder, reason: string | null) => {
    if (!canManage) return;
    if (o.status !== 'aberto') { toast.error('Só é possível cancelar OMs em aberto'); return; }
    const { error } = await (supabase.from as any)('maintenance_orders').update({
      status: 'cancelada', cancelled_at: new Date().toISOString(), cancelled_by_id: user?.id, cancelled_by_name: authorLabel,
      cancellation_reason: reason,
    }).eq('id', o.id);
    if (error) { toast.error('Erro ao cancelar'); return; }
    toast.success('OM cancelada');
    logAction('om_cancel', { om: o.om_number, reason });
    await load();
  };

  const deleteOrder = async (o: MaintenanceOrder) => {
    if (!canManage) return;
    await (supabase.from as any)('maintenance_order_items').delete().eq('order_id', o.id);
    await (supabase.from as any)('maintenance_orders').delete().eq('id', o.id);
    toast.success('OM excluída');
    logAction('om_delete', { om: o.om_number });
    await load();
  };

  const filtered = useMemo(() => orders.filter(o => o.status === tab), [orders, tab]);
  const counts = useMemo(() => ({
    aberto: orders.filter(o => o.status === 'aberto').length,
    em_curso: orders.filter(o => o.status === 'em_curso').length,
    finalizada: orders.filter(o => o.status === 'finalizada').length,
    cancelada: orders.filter(o => o.status === 'cancelada').length,
  }), [orders]);

  const itemsByOrder = useMemo(() => {
    const m: Record<string, MaintenanceOrderItem[]> = {};
    items.forEach(it => { (m[it.order_id] ||= []).push(it); });
    return m;
  }, [items]);

  if (loading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando OMs…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Wrench className="h-5 w-5" /> Ordens de Manutenção</h2>
          <p className="text-sm text-muted-foreground">Fluxo Aberto → Em curso → Finalizada. Cria-se por admin/líder mecânica; mecânico inicia e finaliza.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nova OM</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as MaintenanceOrderStatus)}>
        <TabsList className="flex flex-wrap h-auto justify-center sm:justify-start gap-1 w-full sm:w-auto">
          <TabsTrigger value="aberto">Aberto <Badge className="ml-2" variant="secondary">{counts.aberto}</Badge></TabsTrigger>
          <TabsTrigger value="em_curso">Em Curso <Badge className="ml-2" variant="secondary">{counts.em_curso}</Badge></TabsTrigger>
          <TabsTrigger value="finalizada">Finalizadas <Badge className="ml-2" variant="secondary">{counts.finalizada}</Badge></TabsTrigger>
          <TabsTrigger value="cancelada">Canceladas <Badge className="ml-2" variant="secondary">{counts.cancelada}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">Nenhuma OM nessa lista.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(o => {
                const m = machineById[o.machine_id];
                const its = itemsByOrder[o.id] || [];
                return (
                  <Card key={o.id} className={cn('overflow-hidden', o.priority === 'prioritaria' && 'border-destructive/50')}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">OM #{String(o.om_number).padStart(3, '0')}</span>
                            {o.priority === 'prioritaria' && <Badge className="bg-destructive/15 text-destructive border-destructive/30"><AlertTriangle className="h-3 w-3 mr-1" /> Prioritária</Badge>}
                          </div>
                          <div className="text-sm font-medium">{m?.name || '—'}</div>
                        </div>
                        <Badge variant="outline" className={cn(TYPE_COLORS[o.type])}>{TYPE_LABELS[o.type]}</Badge>
                      </div>
                      {o.description && <p className="text-xs text-muted-foreground line-clamp-2">{o.description}</p>}
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>Criada por <strong>{o.created_by_name || '—'}</strong> · {format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')}</div>
                        {o.started_by_name && <div>Iniciada por <strong>{o.started_by_name}</strong>{o.started_at ? ` · ${format(new Date(o.started_at), 'dd/MM/yyyy HH:mm')}` : ''}</div>}
                        {o.finished_by_name && <div>Finalizada por <strong>{o.finished_by_name}</strong>{o.finished_at ? ` · ${format(new Date(o.finished_at), 'dd/MM/yyyy HH:mm')}` : ''}</div>}
                      </div>

                      {o.status === 'em_curso' && o.started_at && (
                        <div className="flex items-center gap-2 text-sm bg-warning/10 text-warning rounded px-2 py-1.5">
                          <Clock className="h-4 w-4" /> Em andamento — <LiveTimer startedAt={o.started_at} />
                        </div>
                      )}
                      {o.status === 'finalizada' && (
                        <div className="text-xs space-y-1">
                          <div>Início: {o.started_at ? format(new Date(o.started_at), 'dd/MM HH:mm') : '—'} · Fim: {o.finished_at ? format(new Date(o.finished_at), 'dd/MM HH:mm') : '—'}</div>
                          <div>Tempo total: <strong>{fmtDuration(o.duration_seconds || 0)}</strong></div>
                          {its.length > 0 && (
                            <div className="pt-1">
                              <div className="font-medium">Itens trocados:</div>
                              <ul className="list-disc pl-4">
                                {its.map(it => (
                                  <li key={it.id}>
                                    {it.quantity}× {it.item_type} {it.needle_id ? `(agulha ${needles.find(n => n.id === it.needle_id)?.reference_code || ''})` :
                                      it.sinker_id ? `(platina ${sinkers.find(s => s.id === it.sinker_id)?.reference_code || ''})` :
                                      it.cylinder_id ? `(cilindro ${cylinders.find(c => c.id === it.cylinder_id)?.brand || ''})` :
                                      it.description ? `(${it.description})` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {o.status === 'cancelada' && (
                        <div className="text-xs text-muted-foreground">Cancelada por {o.cancelled_by_name || '—'} {o.cancellation_reason ? ` · ${o.cancellation_reason}` : ''}</div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {o.status === 'aberto' && canExecute && (
                          <Button size="sm" onClick={() => setConfirmStart(o)}><Play className="h-3.5 w-3.5 mr-1" /> Iniciar</Button>
                        )}
                        {o.status === 'aberto' && canManage && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="outline" onClick={() => { setCancelReason(''); setConfirmCancel(o); }}><X className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
                          </>
                        )}
                        {o.status === 'em_curso' && canExecute && (
                          <Button size="sm" onClick={() => openFinish(o)}><Square className="h-3.5 w-3.5 mr-1" /> Finalizar</Button>
                        )}
                        {canManage && (o.status === 'cancelada' || o.status === 'finalizada') && (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(o)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? `Editar OM #${String(editing.om_number).padStart(3, '0')}` : 'Nova OM'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Máquina *</Label>
              <SearchableSelect
                value={form.machine_id}
                onValueChange={v => setForm(p => ({ ...p, machine_id: v }))}
                placeholder="Selecione a máquina"
                searchPlaceholder="Buscar máquina..."
                options={machines.map(m => ({ value: m.id, label: m.name }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as MaintenanceOrderType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as MaintenanceOrderPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="prioritaria">Prioritária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição / serviço</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="O que precisa ser feito" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={saveOrder}>{editing ? 'Salvar' : 'Criar OM'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finish Modal */}
      <Dialog open={!!finishOrder} onOpenChange={v => !v && setFinishOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Finalizar OM #{finishOrder ? String(finishOrder.om_number).padStart(3, '0') : ''}</DialogTitle></DialogHeader>
          {finishOrder && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Início</div><div className="font-medium">{finishOrder.started_at ? format(new Date(finishOrder.started_at), 'dd/MM/yyyy HH:mm:ss') : '—'}</div></div>
                <div><div className="text-xs text-muted-foreground">Fim (agora)</div><div className="font-medium">{format(new Date(), 'dd/MM/yyyy HH:mm:ss')}</div></div>
                <div><div className="text-xs text-muted-foreground">Tempo total</div><div className="font-medium"><LiveTimer startedAt={finishOrder.started_at} /></div></div>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Itens trocados</Label>
                  <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item</Button>
                </div>
                {finishItems.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item — pode finalizar sem trocar peças.</p>}
                <div className="space-y-2">
                  {finishItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end border rounded p-2">
                      <div className="col-span-1 md:col-span-3 space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select value={it.item_type} onValueChange={v => updateItem(idx, { item_type: v as MaintenanceOrderItemType, ref_id: '' })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agulha">Agulha</SelectItem>
                            <SelectItem value="platina">Platina</SelectItem>
                            <SelectItem value="cilindro">Cilindro</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 md:col-span-6 space-y-1 order-last md:order-none">
                        <Label className="text-xs">Referência</Label>
                        {it.item_type === 'outro' ? (
                          <Input value={it.description} onChange={e => updateItem(idx, { description: e.target.value })} placeholder="Descreva o item" />
                        ) : (
                          <SearchableSelect
                            value={it.ref_id}
                            onValueChange={v => updateItem(idx, { ref_id: v })}
                            placeholder="Selecionar"
                            searchPlaceholder="Buscar..."
                            options={
                              it.item_type === 'agulha' ? needles.map(n => ({ value: n.id, label: `${n.brand} · ${n.reference_code}` })) :
                              it.item_type === 'platina' ? sinkers.map(s => ({ value: s.id, label: `${s.brand} · ${s.reference_code}` })) :
                              cylinders.map(c => ({ value: c.id, label: `${c.brand} ${c.model || ''}`.trim() }))
                            }
                          />
                        )}
                      </div>
                      <div className="col-span-1 md:col-span-2 space-y-1">
                        <Label className="text-xs">Qtd</Label>
                        <Input type="number" inputMode="numeric" min={1} value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="col-span-2 md:col-span-1 flex md:block justify-end">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOrder(null)}>Cancelar</Button>
            <Button onClick={() => setConfirmFinishGate(true)}>Confirmar finalização</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Start */}
      <Dialog open={!!confirmStart} onOpenChange={v => !v && setConfirmStart(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Iniciar OM?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Iniciar a OM #{confirmStart ? String(confirmStart.om_number).padStart(3, '0') : ''} parará a máquina e começará o cronômetro.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStart(null)}>Cancelar</Button>
            <Button onClick={async () => { const o = confirmStart!; setConfirmStart(null); await startOrder(o); }}>Iniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Cancel */}
      <Dialog open={!!confirmCancel} onOpenChange={v => !v && setConfirmCancel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancelar OM?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Cancelar a OM #{confirmCancel ? String(confirmCancel.om_number).padStart(3, '0') : ''}? Esta ação não pode ser desfeita.
          </p>
          <Textarea rows={2} placeholder="Motivo do cancelamento (opcional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(null)}>Voltar</Button>
            <Button variant="destructive" onClick={async () => { const o = confirmCancel!; const r = cancelReason || null; setConfirmCancel(null); await cancelOrder(o, r); }}>Cancelar OM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Delete */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir OM?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir definitivamente a OM #{confirmDelete ? String(confirmDelete.om_number).padStart(3, '0') : ''} e seus itens?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Voltar</Button>
            <Button variant="destructive" onClick={async () => { const o = confirmDelete!; setConfirmDelete(null); await deleteOrder(o); }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Finish */}
      <Dialog open={confirmFinishGate} onOpenChange={setConfirmFinishGate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar finalização?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            A máquina voltará a "Ativa", o histórico será fechado e os itens trocados aplicados (referências em uso e estoque).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinishGate(false)}>Voltar</Button>
            <Button onClick={async () => { setConfirmFinishGate(false); await confirmFinish(); }}>Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}