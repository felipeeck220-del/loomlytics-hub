import { useEffect, useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Plus, Loader2, Trash2, X, Repeat, ArrowRight, PlayCircle, CheckCircle2, Clock, Wrench, ClipboardCheck, Copy, AlertTriangle, Square, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { generateOtReportPdf } from '@/lib/otReportPdf';

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

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

function useLiveTimer(startIso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startIso]);
  if (!startIso) return '';
  const s = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  return fmtDuration(s);
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
  const [tab, setTab] = useState<
    | 'aberto'
    | 'troca_fio_em_curso'
    | 'aguardando_regulagem'
    | 'em_regulagem'
    | 'em_acompanhamento'
    | 'concluidas'
  >('aberto');
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
    if (tab === 'concluidas') return orders.filter(o => o.status === 'concluida' || o.status === 'cancelada');
    return orders.filter(o => o.status === tab);
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
    if (!isAdmin) { toast.error('Apenas admin pode cancelar uma OT'); return; }
    if (o.status === 'concluida' || o.status === 'cancelada') {
      toast.error('Esta OT já foi encerrada.'); return;
    }
    const ok = await patch(o.id, {
      status: 'cancelada',
      cancelled_at: new Date().toISOString(),
      cancelled_by_name: userName,
      cancelled_by_code: userCode,
    }, 'ot_cancel', { ot: o.ot_number });
    if (ok) toast.success(`OT #${o.ot_number} cancelada`);
  };

  const deleteOrder = async (o: OT) => {
    if (!isAdmin) { toast.error('Apenas admin pode excluir uma OT'); return; }
    if (o.status !== 'concluida' && o.status !== 'cancelada') {
      toast.error('Só é possível excluir OTs concluídas ou canceladas.'); return;
    }
    const { error } = await (supabase.from as any)('article_change_orders').delete().eq('id', o.id);
    if (error) { toast.error(getFriendlyErrorMessage(error.message)); return; }
    logAction('ot_delete', { ot: o.ot_number });
    toast.success(`OT #${o.ot_number} excluída`);
    await load({ silent: true });
  };

  const authorLabel = userCode ? `${userName} #${userCode}` : (userName || null);
  const downloadReport = async (o: OT) => {
    if (!user?.company_id) return;
    try {
      await generateOtReportPdf({
        order: o as any,
        machineName: machineById[o.machine_id]?.name || '—',
        currentArticleName: o.current_article_id ? (articleById[o.current_article_id]?.name || '—') : '—',
        nextArticleName: o.next_article_id ? (articleById[o.next_article_id]?.name || '—') : '—',
        yarnName: (id) => id ? (yarnById[id]?.name || '—') : '—',
        companyId: user.company_id,
        authorLabel,
      });
      logAction('ot_report_download', { ot: o.ot_number });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar relatório');
    }
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
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/50 gap-1 w-full">
          {([
            { key: 'aberto', label: 'Aberto', icon: AlertTriangle, count: orders.filter(o => o.status === 'aberto').length, active: 'data-[state=active]:bg-amber-500 data-[state=active]:text-white' },
            { key: 'troca_fio_em_curso', label: 'Troca de Fio', icon: Clock, count: orders.filter(o => o.status === 'troca_fio_em_curso').length, active: 'data-[state=active]:bg-blue-600 data-[state=active]:text-white' },
            { key: 'aguardando_regulagem', label: 'Aguardando Regulagem', icon: Wrench, count: orders.filter(o => o.status === 'aguardando_regulagem').length, active: 'data-[state=active]:bg-amber-600 data-[state=active]:text-white' },
            { key: 'em_regulagem', label: 'Em Regulagem', icon: Wrench, count: orders.filter(o => o.status === 'em_regulagem').length, active: 'data-[state=active]:bg-purple-600 data-[state=active]:text-white' },
            { key: 'em_acompanhamento', label: 'Acompanhamento', icon: ClipboardCheck, count: orders.filter(o => o.status === 'em_acompanhamento').length, active: 'data-[state=active]:bg-cyan-600 data-[state=active]:text-white' },
            { key: 'concluidas', label: 'Concluídas', icon: Square, count: orders.filter(o => o.status === 'concluida' || o.status === 'cancelada').length, active: 'data-[state=active]:bg-emerald-600 data-[state=active]:text-white' },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className={cn('gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial', t.count > 0 && t.active)}
              >
                <Icon className="h-3 w-3" /> {t.label}
                <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{t.count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Carregando OTs…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma OT nesta aba.</div>
          ) : (
            <div className="space-y-3">
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
                  onDownload={() => downloadReport(o)}
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
          orders={orders}
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
  onDownload: () => void;
}) {
  const { o, machineName, currentArticleName, nextArticleName, yarnName, isAdmin, isLider, isMecanico } = props;
  const waitTimer = useLiveTimer(o.status === 'aberto' ? o.created_at : null);
  const yarnTimer = useLiveTimer(o.status === 'troca_fio_em_curso' ? o.yarn_change_started_at : null);
  const awaitAdjTimer = useLiveTimer(o.status === 'aguardando_regulagem' ? o.yarn_change_ended_at : null);
  const adjTimer = useLiveTimer(o.status === 'em_regulagem' ? o.adjustment_started_at : null);
  const monTimer = useLiveTimer(o.status === 'em_acompanhamento' ? o.monitoring_started_at : null);

  const STATUS_STYLE: Record<OTStatus, { stripe: string; badge: string; label: string }> = {
    aberto: { stripe: 'bg-amber-500', badge: 'bg-amber-500 text-white', label: 'ABERTA' },
    troca_fio_em_curso: { stripe: 'bg-blue-600', badge: 'bg-blue-600 text-white', label: 'TROCA DE FIO' },
    aguardando_regulagem: { stripe: 'bg-amber-600', badge: 'bg-amber-600 text-white', label: 'AGUARDANDO REGULAGEM' },
    em_regulagem: { stripe: 'bg-purple-600', badge: 'bg-purple-600 text-white', label: 'EM REGULAGEM' },
    em_acompanhamento: { stripe: 'bg-cyan-600', badge: 'bg-cyan-600 text-white', label: 'EM ACOMPANHAMENTO' },
    concluida: { stripe: 'bg-emerald-600', badge: 'bg-emerald-600 text-white', label: 'CONCLUÍDA' },
    cancelada: { stripe: 'bg-zinc-500', badge: 'bg-zinc-500 text-white', label: 'CANCELADA' },
  };
  const style = STATUS_STYLE[o.status];

  const renderAuthor = (name?: string | null) => name || '—';

  return (
    <Card className="relative overflow-hidden border bg-card hover:shadow-md transition-shadow">
      <div className={cn('absolute left-0 top-0 bottom-0 w-1.5', style.stripe)} />
      <CardContent className="p-4 pl-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          {/* Coluna principal */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Linha 1: Status + OT# + Tipo + Timer */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn(style.badge, 'font-bold text-[10px] tracking-wide uppercase px-2 py-0.5')}>
                {style.label}
              </Badge>
              <span className="font-bold text-lg text-amber-600 dark:text-amber-400">
                OT #{String(o.ot_number).padStart(3, '0')}
              </span>
              <Badge variant="outline" className="font-semibold uppercase text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">
                TROCA DE ARTIGO
              </Badge>
              {o.status === 'aberto' && (
                <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3" /> Aguardando início {waitTimer}
                </Badge>
              )}
              {o.status === 'troca_fio_em_curso' && (
                <Badge className="bg-blue-600 text-white border-blue-700 gap-1 text-[10px] px-2 py-0.5">
                  <Clock className="h-3 w-3" /> Troca de fio {yarnTimer}
                </Badge>
              )}
              {o.status === 'aguardando_regulagem' && (
                <Badge variant="outline" className="gap-1 text-[10px] border-amber-600/60 text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3" /> Aguardando regulagem {awaitAdjTimer}
                </Badge>
              )}
              {o.status === 'em_regulagem' && (
                <Badge className="bg-purple-600 text-white border-purple-700 gap-1 text-[10px] px-2 py-0.5">
                  <Clock className="h-3 w-3" /> Regulagem {adjTimer}
                </Badge>
              )}
              {o.status === 'em_acompanhamento' && (
                <Badge className="bg-cyan-600 text-white border-cyan-700 gap-1 text-[10px] px-2 py-0.5">
                  <Clock className="h-3 w-3" /> Acompanhamento {monTimer}
                </Badge>
              )}
            </div>

            {/* Linha 2: Máquina em destaque */}
            <div className="text-base font-semibold text-foreground">{machineName}</div>

            {/* Linha 3: Artigo atual → próximo */}
            <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/40 flex-wrap">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Artigo</span>
              <span className="font-medium truncate">{currentArticleName}</span>
              <ArrowRight className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="font-semibold text-amber-700 dark:text-amber-400 truncate">{nextArticleName}</span>
            </div>

            {/* Fitas */}
            {o.yarns && o.yarns.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Fitas ({o.yarns.length})</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {o.yarns.map((y, i) => (
                    <div key={i} className="text-xs flex items-center gap-2 p-1.5 rounded border border-border/60 bg-background/60">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {y.feeder_type === 'elastano' ? 'ELAST' : `FITA ${y.feeder_position}`}
                      </Badge>
                      <span className="font-medium truncate">{yarnName(y.yarn_type_id)}</span>
                      <span className="text-muted-foreground ml-auto tabular-nums shrink-0">
                        LFA {y.lfa ?? '—'}{y.feeder_type === 'elastano' ? ` · Est ${y.stretch ?? '—'}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            {o.observations && (
              <p className="text-xs text-muted-foreground line-clamp-2">{o.observations}</p>
            )}

            {/* Grid técnico */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Troca fio</div>
                <div className="text-foreground font-medium tabular-nums">
                  {o.yarn_change_started_at ? format(new Date(o.yarn_change_started_at), 'dd/MM HH:mm') : '—'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Regulagem</div>
                <div className="text-foreground font-medium tabular-nums">
                  {o.adjustment_started_at ? format(new Date(o.adjustment_started_at), 'dd/MM HH:mm') : '—'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Concluída</div>
                <div className="text-foreground font-medium tabular-nums">
                  {o.concluded_at ? format(new Date(o.concluded_at), 'dd/MM HH:mm') : '—'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Peça</div>
                <div className="text-foreground font-medium">
                  {o.status === 'concluida'
                    ? `${o.piece_defects_holes ?? 0} furo(s) · ${o.piece_defects_flaws ?? 0} falha(s)`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Relatório (concluída) */}
            {o.status === 'concluida' && o.final_report && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="font-semibold text-[10px] uppercase text-emerald-700 dark:text-emerald-400 tracking-wide mb-1">Relatório final</div>
                <div className="text-xs text-foreground whitespace-pre-wrap">{o.final_report}</div>
              </div>
            )}
          </div>

          {/* Coluna ações + auditoria */}
          <div className="flex flex-col items-stretch xl:items-end gap-2 xl:min-w-[240px]">
            <div className="text-[10px] text-muted-foreground leading-tight xl:text-right">
              <div><span className="font-semibold">Criada:</span> {renderAuthor(o.created_by_name)}</div>
              <div>{format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')}</div>
              {o.yarn_change_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Troca fio:</span> {renderAuthor(o.yarn_change_by_name)}</div>
              )}
              {o.adjustment_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Regulagem:</span> {renderAuthor(o.adjustment_by_name)}</div>
              )}
              {o.concluded_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Concluída:</span> {renderAuthor(o.concluded_by_name)}</div>
              )}
              {o.cancelled_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Cancelada:</span> {renderAuthor(o.cancelled_by_name)}</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {o.status === 'aberto' && isLider && (
                <Button size="sm" onClick={props.onStartYarn} className="gap-1.5">
                  <PlayCircle className="h-3.5 w-3.5" /> Iniciar troca
                </Button>
              )}
              {o.status === 'troca_fio_em_curso' && isLider && (
                <Button size="sm" onClick={props.onFinishYarn} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar troca
                </Button>
              )}
              {o.status === 'aguardando_regulagem' && isMecanico && (
                <Button size="sm" onClick={props.onStartAdj} className="gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Iniciar regulagem
                </Button>
              )}
              {o.status === 'em_regulagem' && isMecanico && (
                <Button size="sm" onClick={props.onFinishAdj} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar regulagem
                </Button>
              )}
              {o.status === 'em_acompanhamento' && (isMecanico || isLider || isAdmin) && (
                <Button size="sm" onClick={props.onFinalize} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <ClipboardCheck className="h-3.5 w-3.5" /> Revisar e finalizar
                </Button>
              )}
              {isAdmin && o.status !== 'concluida' && o.status !== 'cancelada' && (
                <Button size="sm" variant="outline" onClick={props.onCancel} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
              {isAdmin && (o.status === 'concluida' || o.status === 'cancelada') && (
                <Button size="sm" variant="outline" onClick={props.onDelete} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              )}
              {o.status === 'concluida' && (
                <Button size="sm" variant="outline" onClick={props.onDownload} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Baixar Relatório
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------- New OT modal ----------------
type Fita = { yarn_type_id: string; lfa: string };
type Elast = { active: boolean; yarn_type_id: string; lfa: string; stretch: string };
const EMPTY_FITA: Fita = { yarn_type_id: '', lfa: '' };
const EMPTY_ELAST: Elast = { active: false, yarn_type_id: '', lfa: '', stretch: '' };

function FitaRow({ index, fita, onChange, onRemove, canRemove, yarnOptions }: {
  index: number;
  fita: Fita;
  onChange: (p: Partial<Fita>) => void;
  onRemove: () => void;
  canRemove: boolean;
  yarnOptions: { value: string; label: string }[];
}) {
  return (
    <div className="border rounded-lg p-3 grid grid-cols-[auto_1fr_120px_auto] gap-2 items-end">
      <div className="pb-2">
        <Badge variant="outline" className="text-[10px]">FITA {index + 1}</Badge>
      </div>
      <div>
        <Label className="text-xs">Tipo de fio</Label>
        <SearchableSelect
          value={fita.yarn_type_id}
          onValueChange={(v) => onChange({ yarn_type_id: v })}
          options={yarnOptions}
          placeholder="Selecione o fio…"
        />
      </div>
      <div>
        <Label className="text-xs">LFA</Label>
        <Input value={fita.lfa} onChange={e => onChange({ lfa: e.target.value })} inputMode="decimal" />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="text-destructive"
        disabled={!canRemove}
        onClick={onRemove}
        title={canRemove ? 'Remover fita' : 'Mínimo 1 fita'}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ElastanoEditor({ elastano, onChange, yarnOptions }: {
  elastano: Elast;
  onChange: (p: Partial<Elast>) => void;
  yarnOptions: { value: string; label: string }[];
}) {
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${elastano.active ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <Checkbox checked={elastano.active} onCheckedChange={(v) => onChange({ active: !!v })} />
        <div className="font-medium text-sm">Elastano</div>
      </div>
      {elastano.active && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="md:col-span-1">
            <Label className="text-xs">Tipo de fio</Label>
            <SearchableSelect
              value={elastano.yarn_type_id}
              onValueChange={(v) => onChange({ yarn_type_id: v })}
              options={yarnOptions}
              placeholder="Selecione o fio…"
            />
          </div>
          <div>
            <Label className="text-xs">LFA</Label>
            <Input value={elastano.lfa} onChange={e => onChange({ lfa: e.target.value })} inputMode="decimal" />
          </div>
          <div>
            <Label className="text-xs">Estiragem</Label>
            <Input value={elastano.stretch} onChange={e => onChange({ stretch: e.target.value })} inputMode="decimal" />
          </div>
        </div>
      )}
    </div>
  );
}

function NewOTModal({ onClose, onSaved, machines, articles, yarnTypes, orders }: {
  onClose: () => void;
  onSaved: () => void;
  machines: any[];
  articles: any[];
  yarnTypes: any[];
  orders: OT[];
}) {
  const { user } = useAuth();
  const { logAction, userName, userCode } = useAuditLog();
  const [machineId, setMachineId] = useState('');
  const [currentArticleId, setCurrentArticleId] = useState('');
  const [nextArticleId, setNextArticleId] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);

  const [fitas, setFitas] = useState<Fita[]>([{ ...EMPTY_FITA }]);
  const [elastano, setElastano] = useState<Elast>({ ...EMPTY_ELAST });

  const updateFita = (i: number, patch: Partial<Fita>) => {
    setFitas(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };
  const addFita = () => setFitas(prev => prev.length < 4 ? [...prev, { ...EMPTY_FITA }] : prev);
  const removeFita = (i: number) => setFitas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const copyFirstToAll = () => setFitas(prev => prev.map((f, idx) => idx === 0 ? f : { ...prev[0] }));

  useEffect(() => {
    // pré-preencher artigo atual pela máquina selecionada
    if (!machineId) return;
    const m = machines.find(x => x.id === machineId);
    if (m?.article_id) setCurrentArticleId(m.article_id);
  }, [machineId, machines]);

  const canSave = machineId && nextArticleId && !saving;

  const save = async () => {
    if (!canSave || !user?.company_id) return;

    // Bloqueio de artigo igual
    if (currentArticleId && nextArticleId && currentArticleId === nextArticleId) {
      toast.error('O próximo artigo deve ser diferente do artigo atual.');
      return;
    }

    // Bloqueio de OT duplicada na mesma máquina (aberta ou em qualquer etapa em curso)
    const busy = orders.find(
      o => o.machine_id === machineId &&
      (o.status === 'aberto' || IN_PROGRESS.includes(o.status))
    );
    if (busy) {
      const m = machines.find(x => x.id === machineId);
      toast.error(
        `${m?.name || 'Máquina'} já tem a OT #${String(busy.ot_number).padStart(3, '0')} ${STATUS_LABEL[busy.status].toLowerCase()}. Finalize ou cancele antes de criar outra.`
      );
      return;
    }

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
      if (!f.yarn_type_id && !f.lfa) return; // pula fita vazia
      yarnRows.push({
        order_id: ins.id,
        company_id: user.company_id,
        feeder_type: 'fio',
        feeder_position: i + 1,
        yarn_type_id: f.yarn_type_id || null,
        lfa: f.lfa ? Number(String(f.lfa).replace(',', '.')) : null,
        stretch: null,
        observation: null,
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
        observation: null,
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Fitas de fio <span className="text-xs text-muted-foreground font-normal">({fitas.length}/4)</span></div>
              <div className="flex items-center gap-2">
                {fitas.length >= 2 && (
                  <Button type="button" size="sm" variant="outline" onClick={copyFirstToAll}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar Fita 1 para as demais
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={addFita} disabled={fitas.length >= 4}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar fita
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {fitas.map((f, i) => (
                <FitaRow
                  key={i}
                  index={i}
                  fita={f}
                  onChange={(p) => updateFita(i, p)}
                  onRemove={() => removeFita(i)}
                  canRemove={fitas.length > 1}
                  yarnOptions={yarnOptions}
                />
              ))}
            </div>
            <ElastanoEditor elastano={elastano} onChange={(p) => setElastano(s => ({ ...s, ...p }))} yarnOptions={yarnOptions} />
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
    // Ao concluir a OT, promove o "próximo artigo" a artigo atual da máquina
    // (Máquinas > Informações Básicas > Artigo Atual → coluna machines.article_id)
    if (o.next_article_id && o.machine_id) {
      const { error: machErr, data: machUpd } = await (supabase.from as any)('machines')
        .update({ article_id: o.next_article_id })
        .eq('id', o.machine_id)
        .select('id');
      if (machErr || !machUpd || (Array.isArray(machUpd) && machUpd.length === 0)) {
        toast.error('OT concluída, mas não foi possível atualizar o Artigo Atual da máquina. Ajuste manualmente em Máquinas.');
        console.error('[FinalizeOT] machine current_article update failed', { machErr, machUpd, machine_id: o.machine_id });
      }
    }
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