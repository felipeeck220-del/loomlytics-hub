import { useEffect, useMemo, useState, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Loader2, Trash2, X, Repeat, ArrowRight, PlayCircle, CheckCircle2, Timer, Wrench, ClipboardCheck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/SearchableSelect';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { usePermissions } from '@/hooks/usePermissions';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

type OTStatus =
  | 'aberto'
  | 'troca_fio_em_curso'
  | 'aguardando_regulagem'
  | 'em_regulagem'
  | 'em_acompanhamento'
  | 'concluida'
  | 'cancelada';

interface Yarn {
  id?: string;
  order_id?: string;
  company_id?: string;
  feeder_type: 'fio' | 'elastano';
  feeder_position: number;
  yarn_type_id: string | null;
  yarn_label: string | null;
  lfa: number | null;
  stretch: number | null;
  observation: string | null;
}

interface OT {
  id: string;
  company_id: string;
  ot_number: number;
  machine_id: string;
  current_article_id: string | null;
  next_article_id: string | null;
  status: OTStatus;
  observations: string | null;
  yarn_change_started_at: string | null;
  yarn_change_ended_at: string | null;
  adjustment_started_at: string | null;
  adjustment_ended_at: string | null;
  monitoring_started_at: string | null;
  concluded_at: string | null;
  cancelled_at: string | null;
  created_by_name: string | null;
  yarn_change_by_name: string | null;
  yarn_change_finished_by_name: string | null;
  adjustment_by_name: string | null;
  adjustment_finished_by_name: string | null;
  concluded_by_name: string | null;
  cancelled_by_name: string | null;
  monitoring_turns: number | null;
  piece_defects_holes: number | null;
  piece_defects_flaws: number | null;
  final_report: string | null;
  created_at: string;
  yarns?: Yarn[];
}

const STATUS_LABEL: Record<OTStatus, string> = {
  aberto: 'Aberta',
  troca_fio_em_curso: 'Troca de fio em curso',
  aguardando_regulagem: 'Aguardando regulagem',
  em_regulagem: 'Em regulagem',
  em_acompanhamento: 'Em acompanhamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const IN_PROGRESS: OTStatus[] = [
  'troca_fio_em_curso',
  'aguardando_regulagem',
  'em_regulagem',
  'em_acompanhamento',
];

function useLiveTimer(startIso: string | null | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startIso) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [startIso]);
  if (!startIso) return '';
  try {
    return formatDistanceToNow(new Date(startIso), { locale: ptBR, addSuffix: false });
  } catch { return ''; }
}

export default function ArticleChangeOrdersTab() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const { logAction, userName, userCode } = useAuditLog();
  const { getMachines, getArticles, getYarnTypes } = useSharedCompanyData();
  const machines = getMachines();
  const articles = getArticles();
  const yarnTypes = getYarnTypes();

  const [orders, setOrders] = useState<OT[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'aberto' | 'em_curso' | 'concluidas'>('aberto');
  const [showNew, setShowNew] = useState(false);
  const [finalizeTarget, setFinalizeTarget] = useState<OT | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OT | null>(null);

  const isAdmin = role === 'admin';
  const isLider = role === 'lider';
  const isMecanico = role === 'mecanico' || role === 'lider_mecanica';

  const machineById = useMemo(() => Object.fromEntries(machines.map(m => [m.id, m])), [machines]);
  const articleById = useMemo(() => Object.fromEntries(articles.map(a => [a.id, a])), [articles]);
  const yarnById = useMemo(() => Object.fromEntries(yarnTypes.map(y => [y.id, y])), [yarnTypes]);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!user?.company_id) return;
    if (!opts.silent) setLoading(true);
    const { data: os, error } = await (supabase.from as any)('article_change_orders')
      .select('*')
      .eq('company_id', user.company_id)
      .order('created_at', { ascending: false });
    if (error) { toast.error(getFriendlyErrorMessage(error.message)); setLoading(false); return; }
    const ids = (os || []).map((o: OT) => o.id);
    let yarns: Yarn[] = [];
    if (ids.length) {
      const { data: ys } = await (supabase.from as any)('article_change_yarns')
        .select('*')
        .in('order_id', ids);
      yarns = (ys || []) as Yarn[];
    }
    const enriched = (os || []).map((o: OT) => ({
      ...o,
      yarns: yarns.filter(y => y.order_id === o.id).sort((a, b) => {
        if (a.feeder_type !== b.feeder_type) return a.feeder_type === 'fio' ? -1 : 1;
        return a.feeder_position - b.feeder_position;
      }),
    })) as OT[];
    setOrders(enriched);
    setLoading(false);
  }, [user?.company_id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.company_id) return;
    const ch = (supabase as any)
      .channel(`ot-${user.company_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_orders', filter: `company_id=eq.${user.company_id}` }, () => load({ silent: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_yarns', filter: `company_id=eq.${user.company_id}` }, () => load({ silent: true }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.company_id, load]);

  const filtered = useMemo(() => {
    if (tab === 'aberto') return orders.filter(o => o.status === 'aberto');
    if (tab === 'em_curso') return orders.filter(o => IN_PROGRESS.includes(o.status));
    return orders.filter(o => o.status === 'concluida' || o.status === 'cancelada');
  }, [orders, tab]);

  // Ações de transição
  const patch = async (id: string, patch: any, auditKey: string, auditExtra: any = {}) => {
    const { error } = await (supabase.from as any)('article_change_orders')
      .update(patch)
      .eq('id', id);
    if (error) { toast.error(getFriendlyErrorMessage(error.message)); return false; }
    logAction(auditKey, { id, ...auditExtra });
    return true;
  };

  const startYarnChange = async (o: OT) => {
    const ok = await patch(o.id, {
      status: 'troca_fio_em_curso',
      yarn_change_started_at: new Date().toISOString(),
      yarn_change_by_name: userName,
      yarn_change_by_code: userCode,
    }, 'ot_start_yarn', { ot: o.ot_number });
    if (ok) toast.success(`OT #${o.ot_number} — troca de fio iniciada`);
  };

  const finishYarnChange = async (o: OT) => {
    const ok = await patch(o.id, {
      status: 'aguardando_regulagem',
      yarn_change_ended_at: new Date().toISOString(),
      yarn_change_finished_by_name: userName,
      yarn_change_finished_by_code: userCode,
    }, 'ot_finish_yarn', { ot: o.ot_number });
    if (ok) toast.success(`OT #${o.ot_number} — pronta para regulagem`);
  };

  const startAdjustment = async (o: OT) => {
    const ok = await patch(o.id, {
      status: 'em_regulagem',
      adjustment_started_at: new Date().toISOString(),
      adjustment_by_name: userName,
      adjustment_by_code: userCode,
    }, 'ot_start_adjustment', { ot: o.ot_number });
    if (ok) toast.success(`OT #${o.ot_number} — regulagem iniciada`);
  };

  const finishAdjustment = async (o: OT) => {
    const ok = await patch(o.id, {
      status: 'em_acompanhamento',
      adjustment_ended_at: new Date().toISOString(),
      adjustment_finished_by_name: userName,
      adjustment_finished_by_code: userCode,
      monitoring_started_at: new Date().toISOString(),
    }, 'ot_finish_adjustment', { ot: o.ot_number });
    if (ok) toast.success(`OT #${o.ot_number} — em acompanhamento`);
  };

  const cancelOrder = async (o: OT) => {
    const ok = await patch(o.id, {
      status: 'cancelada',
      cancelled_at: new Date().toISOString(),
      cancelled_by_name: userName,
      cancelled_by_code: userCode,
    }, 'ot_cancel', { ot: o.ot_number });
    if (ok) toast.success(`OT #${o.ot_number} cancelada`);
  };

  const deleteOrder = async (o: OT) => {
    const { error } = await (supabase.from as any)('article_change_orders').delete().eq('id', o.id);
    if (error) { toast.error(getFriendlyErrorMessage(error.message)); return; }
    logAction('ot_delete', { ot: o.ot_number });
    toast.success(`OT #${o.ot_number} excluída`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Repeat className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Ordens de Troca de Artigo (OT)</h2>
            <p className="text-xs text-muted-foreground">Fluxo: troca de fio → regulagem → acompanhamento → revisão</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova OT
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="aberto">Aberto ({orders.filter(o => o.status === 'aberto').length})</TabsTrigger>
          <TabsTrigger value="em_curso">Em curso ({orders.filter(o => IN_PROGRESS.includes(o.status)).length})</TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas / Canceladas</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Carregando OTs…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma OT nesta aba.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(o => (
                <OTCard
                  key={o.id}
                  o={o}
                  machineName={machineById[o.machine_id]?.name || '—'}
                  currentArticleName={o.current_article_id ? (articleById[o.current_article_id]?.name || '—') : '—'}
                  nextArticleName={o.next_article_id ? (articleById[o.next_article_id]?.name || '—') : '—'}
                  yarnName={(id: string | null) => id ? (yarnById[id]?.name || '—') : '—'}
                  isAdmin={isAdmin}
                  isLider={isLider}
                  isMecanico={isMecanico}
                  onStartYarn={() => startYarnChange(o)}
                  onFinishYarn={() => finishYarnChange(o)}
                  onStartAdj={() => startAdjustment(o)}
                  onFinishAdj={() => finishAdjustment(o)}
                  onFinalize={() => setFinalizeTarget(o)}
                  onCancel={() => cancelOrder(o)}
                  onDelete={() => setDeleteTarget(o)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showNew && (
        <NewOTModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load({ silent: true }); }}
          machines={machines}
          articles={articles}
          yarnTypes={yarnTypes}
        />
      )}

      {finalizeTarget && (
        <FinalizeModal
          o={finalizeTarget}
          onClose={() => setFinalizeTarget(null)}
          onDone={() => { setFinalizeTarget(null); load({ silent: true }); }}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={deleteTarget ? `Excluir OT #${deleteTarget.ot_number}?` : ''}
        description="Esta ação é permanente e removerá todos os dados vinculados à OT."
        onConfirm={() => { if (deleteTarget) { deleteOrder(deleteTarget); setDeleteTarget(null); } }}
      />
    </div>
  );
}

// -------------- Card ----------------
function OTCard(props: {
  o: OT;
  machineName: string;
  currentArticleName: string;
  nextArticleName: string;
  yarnName: (id: string | null) => string;
  isAdmin: boolean;
  isLider: boolean;
  isMecanico: boolean;
  onStartYarn: () => void;
  onFinishYarn: () => void;
  onStartAdj: () => void;
  onFinishAdj: () => void;
  onFinalize: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { o, machineName, currentArticleName, nextArticleName, yarnName, isAdmin, isLider, isMecanico } = props;
  const waitTimer = useLiveTimer(o.status === 'aberto' ? o.created_at : null);
  const yarnTimer = useLiveTimer(o.status === 'troca_fio_em_curso' ? o.yarn_change_started_at : null);
  const awaitAdjTimer = useLiveTimer(o.status === 'aguardando_regulagem' ? o.yarn_change_ended_at : null);
  const adjTimer = useLiveTimer(o.status === 'em_regulagem' ? o.adjustment_started_at : null);
  const monTimer = useLiveTimer(o.status === 'em_acompanhamento' ? o.monitoring_started_at : null);

  const statusColor: Record<OTStatus, string> = {
    aberto: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    troca_fio_em_curso: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    aguardando_regulagem: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    em_regulagem: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    em_acompanhamento: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    concluida: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    cancelada: 'bg-red-500/15 text-red-700 dark:text-red-300',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold">OT #{String(o.ot_number).padStart(3, '0')} — {machineName}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              Criada por {o.created_by_name || '—'} em {format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')}
            </div>
          </div>
          <Badge className={statusColor[o.status]}>{STATUS_LABEL[o.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/40">
          <span className="font-medium">{currentArticleName}</span>
          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-primary">{nextArticleName}</span>
        </div>

        {o.yarns && o.yarns.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Fitas</div>
            <div className="grid grid-cols-1 gap-1">
              {o.yarns.map((y, i) => (
                <div key={i} className="text-xs flex items-center gap-2 p-1.5 rounded border border-border/60">
                  <Badge variant="outline" className="text-[10px]">
                    {y.feeder_type === 'elastano' ? 'ELAST' : `FITA ${y.feeder_position}`}
                  </Badge>
                  <span className="font-medium truncate">{yarnName(y.yarn_type_id)}</span>
                  <span className="text-muted-foreground ml-auto">LFA {y.lfa ?? '—'} · Est {y.stretch ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {o.observations && (
          <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
            {o.observations}
          </div>
        )}

        {/* Timers */}
        {o.status === 'aberto' && (
          <div className="text-xs flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><Timer className="h-3.5 w-3.5" /> Aguardando início · {waitTimer}</div>
        )}
        {o.status === 'troca_fio_em_curso' && (
          <div className="text-xs flex items-center gap-1.5 text-blue-700 dark:text-blue-400"><Timer className="h-3.5 w-3.5" /> Troca de fio · {yarnTimer}</div>
        )}
        {o.status === 'aguardando_regulagem' && (
          <div className="text-xs flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><Timer className="h-3.5 w-3.5" /> Aguardando regulagem · {awaitAdjTimer}</div>
        )}
        {o.status === 'em_regulagem' && (
          <div className="text-xs flex items-center gap-1.5 text-purple-700 dark:text-purple-400"><Timer className="h-3.5 w-3.5" /> Em regulagem · {adjTimer}</div>
        )}
        {o.status === 'em_acompanhamento' && (
          <div className="text-xs flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400"><Timer className="h-3.5 w-3.5" /> Em acompanhamento · {monTimer}</div>
        )}

        {o.status === 'concluida' && (
          <div className="text-xs space-y-1 border-t pt-2">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Concluída em {o.concluded_at ? format(new Date(o.concluded_at), 'dd/MM/yyyy HH:mm') : '—'} por {o.concluded_by_name || '—'}
            </div>
            <div className="text-muted-foreground">
              Voltas: <b>{o.monitoring_turns ?? '—'}</b> · Furos: <b>{o.piece_defects_holes ?? 0}</b> · Falhas: <b>{o.piece_defects_flaws ?? 0}</b>
            </div>
            {o.final_report && (
              <div className="border-l-2 border-emerald-500/40 pl-2 text-muted-foreground whitespace-pre-wrap">{o.final_report}</div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-wrap gap-2 pt-1">
          {o.status === 'aberto' && isLider && (
            <Button size="sm" onClick={props.onStartYarn}><PlayCircle className="h-4 w-4 mr-1" /> Iniciar troca de fio</Button>
          )}
          {o.status === 'troca_fio_em_curso' && isLider && (
            <Button size="sm" onClick={props.onFinishYarn}><CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar troca de fio</Button>
          )}
          {o.status === 'aguardando_regulagem' && isMecanico && (
            <Button size="sm" onClick={props.onStartAdj}><Wrench className="h-4 w-4 mr-1" /> Iniciar regulagem</Button>
          )}
          {o.status === 'em_regulagem' && isMecanico && (
            <Button size="sm" onClick={props.onFinishAdj}><CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar regulagem</Button>
          )}
          {o.status === 'em_acompanhamento' && (isMecanico || isLider || isAdmin) && (
            <Button size="sm" onClick={props.onFinalize}><ClipboardCheck className="h-4 w-4 mr-1" /> Revisar peça e finalizar</Button>
          )}
          {isAdmin && o.status !== 'concluida' && o.status !== 'cancelada' && (
            <Button size="sm" variant="outline" onClick={props.onCancel}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={props.onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// -------------- New OT modal ----------------
type Slot = { active: boolean; yarn_type_id: string; lfa: string; stretch: string; observation: string };
const EMPTY_SLOT: Slot = { active: false, yarn_type_id: '', lfa: '', stretch: '', observation: '' };

function SlotEditor({ label, slot, onChange, yarnOptions }: {
  label: string;
  slot: Slot;
  onChange: (p: Partial<Slot>) => void;
  yarnOptions: { value: string; label: string }[];
}) {
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${slot.active ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <Checkbox checked={slot.active} onCheckedChange={(v) => onChange({ active: !!v })} />
        <div className="font-medium text-sm">{label}</div>
      </div>
      {slot.active && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Tipo de fio</Label>
            <SearchableSelect
              value={slot.yarn_type_id}
              onValueChange={(v) => onChange({ yarn_type_id: v })}
              options={yarnOptions}
              placeholder="Selecione o fio…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">LFA</Label>
              <Input value={slot.lfa} onChange={e => onChange({ lfa: e.target.value })} inputMode="decimal" />
            </div>
            <div>
              <Label className="text-xs">Estiragem</Label>
              <Input value={slot.stretch} onChange={e => onChange({ stretch: e.target.value })} inputMode="decimal" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Input value={slot.observation} onChange={e => onChange({ observation: e.target.value })} placeholder="Opcional" />
          </div>
        </div>
      )}
    </div>
  );
}

function NewOTModal({ onClose, onSaved, machines, articles, yarnTypes }: {
  onClose: () => void;
  onSaved: () => void;
  machines: any[];
  articles: any[];
  yarnTypes: any[];
}) {
  const { user } = useAuth();
  const { logAction, userName, userCode } = useAuditLog();
  const [machineId, setMachineId] = useState('');
  const [currentArticleId, setCurrentArticleId] = useState('');
  const [nextArticleId, setNextArticleId] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);

  const [fitas, setFitas] = useState<Slot[]>([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
  const [elastano, setElastano] = useState<Slot>({ ...EMPTY_SLOT });

  const updateFita = (i: number, patch: Partial<Slot>) => {
    setFitas(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };

  useEffect(() => {
    // pré-preencher artigo atual pela máquina selecionada
    if (!machineId) return;
    const m = machines.find(x => x.id === machineId);
    if (m?.article_id) setCurrentArticleId(m.article_id);
  }, [machineId, machines]);

  const canSave = machineId && nextArticleId && !saving;

  const save = async () => {
    if (!canSave || !user?.company_id) return;
    setSaving(true);
    const { data: ins, error } = await (supabase.from as any)('article_change_orders')
      .insert({
        company_id: user.company_id,
        machine_id: machineId,
        current_article_id: currentArticleId || null,
        next_article_id: nextArticleId,
        observations: observations || null,
        created_by_id: user.id,
        created_by_name: userName,
        created_by_code: userCode,
      })
      .select('id, ot_number')
      .single();
    if (error || !ins) { toast.error(getFriendlyErrorMessage(error?.message)); setSaving(false); return; }

    const yarnRows: any[] = [];
    fitas.forEach((f, i) => {
      if (!f.active) return;
      yarnRows.push({
        order_id: ins.id,
        company_id: user.company_id,
        feeder_type: 'fio',
        feeder_position: i + 1,
        yarn_type_id: f.yarn_type_id || null,
        lfa: f.lfa ? Number(String(f.lfa).replace(',', '.')) : null,
        stretch: f.stretch ? Number(String(f.stretch).replace(',', '.')) : null,
        observation: f.observation || null,
      });
    });
    if (elastano.active) {
      yarnRows.push({
        order_id: ins.id,
        company_id: user.company_id,
        feeder_type: 'elastano',
        feeder_position: 1,
        yarn_type_id: elastano.yarn_type_id || null,
        lfa: elastano.lfa ? Number(String(elastano.lfa).replace(',', '.')) : null,
        stretch: elastano.stretch ? Number(String(elastano.stretch).replace(',', '.')) : null,
        observation: elastano.observation || null,
      });
    }
    if (yarnRows.length) {
      const { error: yErr } = await (supabase.from as any)('article_change_yarns').insert(yarnRows);
      if (yErr) {
        toast.error('OT criada, mas houve erro nas fitas: ' + getFriendlyErrorMessage(yErr.message));
      }
    }
    logAction('ot_create', { ot: ins.ot_number, machine_id: machineId });
    toast.success(`OT #${ins.ot_number} criada`);
    setSaving(false);
    onSaved();
  };

  const yarnOptions = useMemo(() => yarnTypes.map(y => ({ value: y.id, label: y.name })), [yarnTypes]);
  const machineOptions = useMemo(() => machines.map(m => ({ value: m.id, label: m.name })), [machines]);
  const articleOptions = useMemo(() => articles.map(a => ({ value: a.id, label: a.client_name ? `${a.name} (${a.client_name})` : a.name })), [articles]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Troca de Artigo</DialogTitle>
          <DialogDescription>Configure a máquina, o artigo destino e as fitas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Máquina *</Label>
              <SearchableSelect value={machineId} onValueChange={setMachineId} options={machineOptions} placeholder="Selecione…" />
            </div>
            <div>
              <Label>Artigo atual</Label>
              <SearchableSelect value={currentArticleId} onValueChange={setCurrentArticleId} options={articleOptions} placeholder="Selecione…" />
            </div>
            <div>
              <Label>Próximo artigo *</Label>
              <SearchableSelect value={nextArticleId} onValueChange={setNextArticleId} options={articleOptions} placeholder="Selecione…" />
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Fitas de fio (até 4) + Elastano</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {fitas.map((f, i) => (
                <SlotEditor key={i} label={`Fita ${i + 1}`} slot={f} onChange={(p) => updateFita(i, p)} yarnOptions={yarnOptions} />
              ))}
              <SlotEditor label="Elastano" slot={elastano} onChange={(p) => setElastano(s => ({ ...s, ...p }))} yarnOptions={yarnOptions} />
            </div>
          </div>

          <div>
            <Label>Observação geral</Label>
            <Textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Criar OT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------- Finalize (peça + relatório) ----------------
function FinalizeModal({ o, onClose, onDone }: { o: OT; onClose: () => void; onDone: () => void }) {
  const { logAction, userName, userCode } = useAuditLog();
  const [turns, setTurns] = useState('');
  const [holes, setHoles] = useState('0');
  const [flaws, setFlaws] = useState('0');
  const [report, setReport] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!report.trim()) { toast.error('Relatório final é obrigatório'); return; }
    setSaving(true);
    const { error } = await (supabase.from as any)('article_change_orders')
      .update({
        status: 'concluida',
        concluded_at: new Date().toISOString(),
        concluded_by_name: userName,
        concluded_by_code: userCode,
        monitoring_turns: turns ? Number(String(turns).replace(',', '.')) : null,
        piece_defects_holes: Number(holes) || 0,
        piece_defects_flaws: Number(flaws) || 0,
        final_report: report.trim(),
      })
      .eq('id', o.id);
    setSaving(false);
    if (error) { toast.error(getFriendlyErrorMessage(error.message)); return; }
    logAction('ot_conclude', { ot: o.ot_number });
    toast.success(`OT #${o.ot_number} concluída`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisão da peça — OT #{String(o.ot_number).padStart(3, '0')}</DialogTitle>
          <DialogDescription>Registre voltas acompanhadas, defeitos encontrados na peça e o relatório final para concluir a OT.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Voltas acompanhadas</Label>
            <Input value={turns} onChange={e => setTurns(e.target.value)} inputMode="decimal" placeholder="Ex.: 15" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Furos na peça</Label>
              <Input value={holes} onChange={e => setHoles(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <Label>Falhas na peça</Label>
              <Input value={flaws} onChange={e => setFlaws(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div>
            <Label>Relatório final *</Label>
            <Textarea rows={5} value={report} onChange={e => setReport(e.target.value)} placeholder="Descreva o que foi observado, ajustes finais, conformidade da peça…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Finalizar OT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}