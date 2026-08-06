import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Plus, Loader2, Trash2, X, Repeat, ArrowRight, PlayCircle, CheckCircle2, Clock, Wrench, ClipboardCheck, Copy, AlertTriangle, Square, Download, Search, ChevronLeft, ChevronRight, Pencil, Camera, ImageIcon, Eye } from 'lucide-react';
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
import { useMarkSourceAsRead } from '@/hooks/useMarkSourceAsRead';
import OrderCardSkeleton from './OrderCardSkeleton';

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
  created_by_code: string | null;
  yarn_change_by_name: string | null;
  yarn_change_by_code: string | null;
  yarn_change_finished_by_name: string | null;
  yarn_change_finished_by_code: string | null;
  adjustment_by_name: string | null;
  adjustment_by_code: string | null;
  adjustment_finished_by_name: string | null;
  adjustment_finished_by_code: string | null;
  concluded_by_name: string | null;
  concluded_by_code: string | null;
  cancelled_by_name: string | null;
  cancelled_by_code: string | null;
  monitoring_turns: number | null;
  piece_defects_holes: number | null;
  piece_defects_flaws: number | null;
  final_report: string | null;
  created_at: string;
  yarns?: Yarn[];
  ot_photos?: OTPhoto[] | null;
}

type OTPhoto = {
  id: string;
  path: string;
  description: string;
  author: string | null;
  ts: string;
};

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
  useMarkSourceAsRead('OT');
  const { user } = useAuth();
  const { role } = usePermissions();
  const { logAction, userName, userCode } = useAuditLog();
  const { getMachines, getArticles, getYarnTypes, loading: companyLoading } = useSharedCompanyData();
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
  const [editTarget, setEditTarget] = useState<OT | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<OT | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OT | null>(null);
  const [photosTarget, setPhotosTarget] = useState<OT | null>(null);
  const [concluidasSearch, setConcluidasSearch] = useState('');
  const [concluidasPage, setConcluidasPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const CONCLUIDAS_PAGE_SIZE = 15;

  const isAdmin = role === 'admin';
  const isLiderNoite = role === 'lider_noite';
  const isLider = role === 'lider' || isLiderNoite;
  const isMecanico = role === 'mecanico' || role === 'lider_mecanica' || isLiderNoite;

  const machineById = useMemo(() => Object.fromEntries(machines.map(m => [m.id, m])), [machines]);
  const articleById = useMemo(() => Object.fromEntries(articles.map(a => [a.id, a])), [articles]);
  const yarnById = useMemo(() => Object.fromEntries(yarnTypes.map(y => [y.id, y])), [yarnTypes]);

  const [otCounts, setOtCounts] = useState<Record<string, number>>({});
  
  const loadStats = useCallback(async () => {
    if (!user?.company_id) return;
    const { data, error } = await (supabase.rpc as any)('get_mecanica_stats', { p_company_id: user.company_id });
    if (!error && data) {
      setOtCounts(data.ot || {});
    }
  }, [user?.company_id]);

  const load = useCallback(async (opts: { silent?: boolean; status?: OTStatus | 'concluidas'; page?: number; search?: string } = {}) => {
    if (!user?.company_id) return;
    if (!opts.silent) setLoading(true);

    const statusStr = opts.status || tab;
    let p_status: string | null = null;
    let limit = 1000;
    let offset = 0;
    const search = opts.search ?? (statusStr === 'concluidas' ? concluidasSearch : '');

    if (statusStr === 'concluidas') {
      p_status = 'concluida'; 
      limit = CONCLUIDAS_PAGE_SIZE;
      offset = (opts.page ?? concluidasPage) * limit;
    } else {
      p_status = statusStr;
    }

    const { data, error } = await (supabase.rpc as any)('get_article_change_orders_list', { 
      p_company_id: user.company_id,
      p_status: p_status,
      p_limit: limit,
      p_offset: offset,
      p_search: search
    });

    if (error) { toast.error(getFriendlyErrorMessage(error.message)); setLoading(false); return; }
    const payload = (data || {}) as { orders?: OT[]; count?: number };
    setOrders((payload.orders || []) as OT[]);
    setTotalCount(payload.count || 0);
    setLoading(false);
    loadStats();
  }, [user?.company_id, tab, concluidasPage, concluidasSearch, loadStats]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tab === 'concluidas') load({ silent: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [concluidasSearch, tab]);

  useEffect(() => {
    if (!user?.company_id) return;
    const ch = (supabase as any)
      .channel(`ot-${user.company_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_orders', filter: `company_id=eq.${user.company_id}` }, () => load({ silent: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_yarns', filter: `company_id=eq.${user.company_id}` }, () => load({ silent: true }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.company_id, load]);

  const filtered = orders;
  const concluidasFiltered = orders;
  const concluidasTotal = totalCount;
  const concluidasTotalPages = Math.max(1, Math.ceil(concluidasTotal / CONCLUIDAS_PAGE_SIZE));
  const concluidasPageSafe = concluidasPage;
  const pagedConcluidas = orders;

  useEffect(() => { setConcluidasPage(0); }, [concluidasSearch, tab]);

  const listToRender = orders;

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
    if (ok) {
      toast.success(`OT #${o.ot_number} — pronta para regulagem`);
      try {
        const machineName = machines.find((m: any) => m.id === o.machine_id)?.name || 'Máquina';
        const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
        const targetPath = slug ? `/${slug}/mecanica/ot` : '/';
        supabase.functions.invoke('send-push-notification', {
          body: {
            company_id: user?.company_id,
            title: `OT #${String(o.ot_number).padStart(3, '0')} — Aguardando Regulagem`,
            message: `${machineName} pronta para regulagem`,
            url: targetPath,
            roles: ['mecanico', 'lider_mecanica', 'lider_noite'],
            include_admins: true,
            source: 'OT',
            ref_id: o.id,
            ref_number: `OT #${String(o.ot_number).padStart(3, '0')}`,
          },
        }).catch(() => { /* silencioso */ });
      } catch { /* silencioso */ }
    }
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
        {(isAdmin || isLiderNoite) && (
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova OT
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/50 gap-1 w-full lg:w-fit">
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
          {loading || companyLoading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando OTs…</div>
              <OrderCardSkeleton count={3} label="OT" />
            </div>
          ) : (
            <>
              {tab === 'concluidas' && (
                <div className="mb-3 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={concluidasSearch}
                    onChange={e => setConcluidasSearch(e.target.value)}
                    placeholder="Buscar OT concluída por número, máquina ou artigo…"
                    className="pl-9"
                  />
                </div>
              )}
              {listToRender.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma OT nesta aba.</div>
              ) : (
                <div className="space-y-3">
                  {listToRender.map(o => (
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
                  isLiderMecanica={role === 'lider_mecanica'}
                  onStartYarn={() => startYarnChange(o)}
                  onFinishYarn={() => finishYarnChange(o)}
                  onStartAdj={() => startAdjustment(o)}
                  onFinishAdj={() => finishAdjustment(o)}
                  onFinalize={() => setFinalizeTarget(o)}
                  onCancel={() => cancelOrder(o)}
                  onDelete={() => setDeleteTarget(o)}
                  onDownload={() => downloadReport(o)}
                  onEdit={() => setEditTarget(o)}
                  onViewPhotos={() => setPhotosTarget(o)}
                />
                  ))}
                </div>
              )}
              {tab === 'concluidas' && concluidasTotal > CONCLUIDAS_PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {concluidasPageSafe * CONCLUIDAS_PAGE_SIZE + 1}
                    –{Math.min(concluidasTotal, (concluidasPageSafe + 1) * CONCLUIDAS_PAGE_SIZE)} de {concluidasTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConcluidasPage(p => Math.max(0, p - 1))}
                      disabled={concluidasPageSafe === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <span className="text-xs font-medium">
                      <span className="px-2 py-1 bg-primary text-primary-foreground rounded-md">{concluidasPageSafe + 1}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      {concluidasTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConcluidasPage(p => Math.min(concluidasTotalPages - 1, p + 1))}
                      disabled={concluidasPageSafe >= concluidasTotalPages - 1}
                    >
                      Próxima <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
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

      {editTarget && (
        <NewOTModal
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load({ silent: true }); }}
          machines={machines}
          articles={articles}
          yarnTypes={yarnTypes}
          orders={orders}
          editing={editTarget}
        />
      )}

      {finalizeTarget && (
        <FinalizeModal
          o={finalizeTarget}
          onClose={() => setFinalizeTarget(null)}
          onDone={() => { setFinalizeTarget(null); load({ silent: true }); }}
          machines={machines}
          articles={articles}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={deleteTarget ? `Excluir OT #${deleteTarget.ot_number}?` : ''}
        description="Esta ação é permanente e removerá todos os dados vinculados à OT."
        onConfirm={() => { if (deleteTarget) { deleteOrder(deleteTarget); setDeleteTarget(null); } }}
      />

      {photosTarget && (
        <OTPhotosModal o={photosTarget} onClose={() => setPhotosTarget(null)} />
      )}
    </div>
  );
}

// -------------- Visualizador de fotos da OT ----------------
function OTPhotosModal({ o, onClose }: { o: OT; onClose: () => void }) {
  const photos = useMemo<OTPhoto[]>(() => Array.isArray(o.ot_photos) ? (o.ot_photos as OTPhoto[]) : [], [o.ot_photos]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingUrls(true);
      const entries: Array<[string, string]> = [];
      for (const p of photos) {
        const { data } = await supabase.storage.from('oc-photos').createSignedUrl(p.path, 3600);
        if (data?.signedUrl) entries.push([p.path, data.signedUrl]);
      }
      if (!cancelled) { setUrls(Object.fromEntries(entries)); setLoadingUrls(false); }
    })();
    return () => { cancelled = true; };
  }, [photos]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-purple-600" /> Fotos — OT #{String(o.ot_number).padStart(3, '0')}
          </DialogTitle>
          <DialogDescription>Imagens anexadas na conclusão da ordem de troca de artigo.</DialogDescription>
        </DialogHeader>
        {loadingUrls ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fotos…
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Nenhuma foto anexada.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {photos.map(p => (
              <div key={p.id} className="rounded-md border overflow-hidden bg-muted/30">
                {urls[p.path] ? (
                  <a href={urls[p.path]} target="_blank" rel="noreferrer">
                    <img src={urls[p.path]} alt={p.description || 'Foto da conclusão da OT'} className="w-full h-56 object-cover" loading="lazy" />
                  </a>
                ) : (
                  <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">Imagem indisponível</div>
                )}
                <div className="p-2 space-y-0.5">
                  <div className="text-xs font-medium break-words">{p.description || '—'}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.author || '—'} · {p.ts ? format(new Date(p.ts), 'dd/MM/yyyy HH:mm') : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  isLiderMecanica: boolean;
  onStartYarn: () => void;
  onFinishYarn: () => void;
  onStartAdj: () => void;
  onFinishAdj: () => void;
  onFinalize: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onViewPhotos: () => void;
}) {
  const { o, machineName, currentArticleName, nextArticleName, yarnName, isAdmin, isLider, isMecanico, isLiderMecanica } = props;
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

  const renderAuthor = (name?: string | null, code?: string | null) =>
    name ? (code ? `${name} #${code}` : name) : '—';

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
              <span className="font-semibold text-xs sm:text-sm tabular-nums text-amber-600 dark:text-amber-400">
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
            <div className="text-xl font-bold text-foreground leading-tight break-words">{machineName}</div>

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
                    ? `${o.piece_defects_holes ?? 0} furo(s) · ${o.piece_defects_flaws ?? 0} falha(s) · ${o.monitoring_turns ?? 0} volta(s)`
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

            {/* Fotos anexadas na conclusão — destaque na aba Concluídas */}
            {Array.isArray(o.ot_photos) && o.ot_photos.length > 0 && (
              <div className="rounded-md border border-purple-500/40 bg-purple-500/10 p-2 flex flex-wrap items-center gap-2">
                <Badge className="bg-purple-600 text-white border-purple-700 gap-1 text-[10px] font-bold">
                  <ImageIcon className="h-3 w-3" /> {o.ot_photos.length} foto{o.ot_photos.length > 1 ? 's' : ''} anexada{o.ot_photos.length > 1 ? 's' : ''}
                </Badge>
                <Button size="sm" onClick={props.onViewPhotos} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 h-7">
                  <Eye className="h-3.5 w-3.5" /> Ver fotos
                </Button>
              </div>
            )}
          </div>

          {/* Coluna ações + auditoria */}
          <div className="flex flex-col items-stretch xl:items-end gap-2 xl:min-w-[240px]">
            <div className="text-[10px] text-muted-foreground leading-tight xl:text-right">
              <div><span className="font-semibold">Criada:</span> {renderAuthor(o.created_by_name, o.created_by_code)}</div>
              <div>{format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')}</div>
              {o.yarn_change_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Troca fio:</span> {renderAuthor(o.yarn_change_by_name, o.yarn_change_by_code)}</div>
              )}
              {o.adjustment_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Regulagem:</span> {renderAuthor(o.adjustment_by_name, o.adjustment_by_code)}</div>
              )}
              {o.concluded_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Concluída:</span> {renderAuthor(o.concluded_by_name, o.concluded_by_code)}</div>
              )}
              {o.cancelled_by_name && (
                <div className="mt-0.5"><span className="font-semibold">Cancelada:</span> {renderAuthor(o.cancelled_by_name, o.cancelled_by_code)}</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {o.status === 'aberto' && (isLider || isAdmin) && (
                <Button size="sm" onClick={props.onStartYarn} className="gap-1.5">
                  <PlayCircle className="h-3.5 w-3.5" /> Iniciar troca
                </Button>
              )}
              {o.status === 'aberto' && (isAdmin || isLiderMecanica) && (
                <Button size="sm" variant="outline" onClick={props.onEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
              {o.status === 'troca_fio_em_curso' && (isLider || isAdmin) && (
                <Button size="sm" onClick={props.onFinishYarn} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar troca
                </Button>
              )}
              {o.status === 'aguardando_regulagem' && (isMecanico || isAdmin) && (
                <Button size="sm" onClick={props.onStartAdj} className="gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Iniciar regulagem
                </Button>
              )}
              {o.status === 'em_regulagem' && (isMecanico || isAdmin) && (
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

function NewOTModal({ onClose, onSaved, machines, articles, yarnTypes, orders, editing }: {
  onClose: () => void;
  onSaved: () => void;
  machines: any[];
  articles: any[];
  yarnTypes: any[];
  orders: OT[];
  editing?: OT | null;
}) {
  const { user } = useAuth();
  const { logAction, userName, userCode } = useAuditLog();
  const isEdit = !!editing;
  const [machineId, setMachineId] = useState(editing?.machine_id || '');
  const [currentArticleId, setCurrentArticleId] = useState(editing?.current_article_id || '');
  const [nextArticleId, setNextArticleId] = useState(editing?.next_article_id || '');
  const [observations, setObservations] = useState(editing?.observations || '');
  const [saving, setSaving] = useState(false);
  // Guarda anti double-click (evita "Nova OT" e push duplicados).
  const savingRef = useRef(false);

  const [fitas, setFitas] = useState<Fita[]>(() => {
    if (editing?.yarns?.length) {
      const fs = editing.yarns
        .filter(y => y.feeder_type === 'fio')
        .sort((a, b) => (a.feeder_position || 0) - (b.feeder_position || 0))
        .map(y => ({ yarn_type_id: y.yarn_type_id || '', lfa: y.lfa != null ? String(y.lfa).replace('.', ',') : '' }));
      return fs.length ? fs : [{ ...EMPTY_FITA }];
    }
    return [{ ...EMPTY_FITA }];
  });
  const [elastano, setElastano] = useState<Elast>(() => {
    const e = editing?.yarns?.find(y => y.feeder_type === 'elastano');
    if (e) return {
      active: true,
      yarn_type_id: e.yarn_type_id || '',
      lfa: e.lfa != null ? String(e.lfa).replace('.', ',') : '',
      stretch: e.stretch != null ? String(e.stretch).replace('.', ',') : '',
    };
    return { ...EMPTY_ELAST };
  });

  const updateFita = (i: number, patch: Partial<Fita>) => {
    setFitas(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };
  const addFita = () => setFitas(prev => prev.length < 4 ? [...prev, { ...EMPTY_FITA }] : prev);
  const removeFita = (i: number) => setFitas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const copyFirstToAll = () => setFitas(prev => prev.map((f, idx) => idx === 0 ? f : { ...prev[0] }));

  useEffect(() => {
    if (isEdit) return; // não sobrescrever seleção durante edição
    // pré-preencher artigo atual pela máquina selecionada
    if (!machineId) return;
    const m = machines.find(x => x.id === machineId);
    if (m?.article_id) setCurrentArticleId(m.article_id);
  }, [machineId, machines, isEdit]);

  const canSave = machineId && nextArticleId && !saving;

  const save = async () => {
    if (savingRef.current) return;
    if (!canSave || !user?.company_id) return;

    // Bloqueio de artigo igual
    if (currentArticleId && nextArticleId && currentArticleId === nextArticleId) {
      toast.error('O próximo artigo deve ser diferente do artigo atual.');
      return;
    }

    // Bloqueio de OT duplicada na mesma máquina (aberta ou em qualquer etapa em curso)
    const busy = orders.find(
      o => o.machine_id === machineId && o.id !== editing?.id &&
      (o.status === 'aberto' || IN_PROGRESS.includes(o.status))
    );
    if (busy) {
      const m = machines.find(x => x.id === machineId);
      toast.error(
        `${m?.name || 'Máquina'} já tem a OT #${String(busy.ot_number).padStart(3, '0')} ${STATUS_LABEL[busy.status].toLowerCase()}. Finalize ou cancele antes de criar outra.`
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
    if (isEdit && editing) {
      // UPDATE do cabeçalho
      const { error: upErr } = await (supabase.from as any)('article_change_orders')
        .update({
          machine_id: machineId,
          current_article_id: currentArticleId || null,
          next_article_id: nextArticleId,
          observations: observations || null,
        })
        .eq('id', editing.id);
      if (upErr) { toast.error(getFriendlyErrorMessage(upErr.message)); return; }
      // Substitui fitas
      const { error: delErr } = await (supabase.from as any)('article_change_yarns').delete().eq('order_id', editing.id);
      if (delErr) { toast.error('OT atualizada, mas erro ao limpar fitas: ' + getFriendlyErrorMessage(delErr.message)); }
      const yarnRows: any[] = [];
      fitas.forEach((f, i) => {
        if (!f.yarn_type_id && !f.lfa) return;
        yarnRows.push({
          order_id: editing.id,
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
          order_id: editing.id,
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
        if (yErr) toast.error('OT atualizada, mas erro nas fitas: ' + getFriendlyErrorMessage(yErr.message));
      }
      logAction('ot_edit', { ot: editing.ot_number, machine_id: machineId });
      toast.success(`OT #${editing.ot_number} atualizada`);
      onSaved();
      return;
    }
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
    if (error || !ins) { toast.error(getFriendlyErrorMessage(error?.message)); return; }

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
    // Notificação push para líderes
    try {
      const machineName = machines.find((m: any) => m.id === machineId)?.name || 'Máquina';
      const nextArt = articles.find((a: any) => a.id === nextArticleId);
      const nextName = nextArt ? (nextArt.client_name ? `${nextArt.name} (${nextArt.client_name})` : nextArt.name) : 'novo artigo';
      const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
      const targetPath = slug ? `/${slug}/mecanica/ot` : '/';
      supabase.functions.invoke('send-push-notification', {
        body: {
          company_id: user.company_id,
          title: `Nova OT #${String(ins.ot_number).padStart(3, '0')} — ${machineName}`,
          message: `Troca para ${nextName}`,
          url: targetPath,
          roles: ['lider', 'lider_noite'],
          include_admins: true,
          source: 'OT',
          ref_id: ins.id,
          ref_number: `OT #${String(ins.ot_number).padStart(3, '0')}`,
        },
      }).catch(() => { /* silencioso */ });
    } catch { /* silencioso */ }
    onSaved();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const yarnOptions = useMemo(() => yarnTypes.map(y => ({ value: y.id, label: y.name })), [yarnTypes]);
  const machineOptions = useMemo(() => machines.map(m => ({ value: m.id, label: m.name })), [machines]);
  const articleOptions = useMemo(() => articles.map(a => ({ value: a.id, label: a.client_name ? `${a.name} (${a.client_name})` : a.name })), [articles]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar OT #${String(editing!.ot_number).padStart(3, '0')}` : 'Nova Ordem de Troca de Artigo'}</DialogTitle>
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : (isEdit ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />)}
            {isEdit ? 'Salvar alterações' : 'Criar OT'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------- Finalize (peça + relatório) ----------------
function FinalizeModal({ o, onClose, onDone, machines, articles }: { o: OT; onClose: () => void; onDone: () => void; machines: any[]; articles: any[] }) {
  const { logAction, userName, userCode } = useAuditLog();
  const { refreshData } = useSharedCompanyData() as any;
  const [turns, setTurns] = useState('');
  const [holes, setHoles] = useState('0');
  const [flaws, setFlaws] = useState('0');
  const [report, setReport] = useState('');
  const [saving, setSaving] = useState(false);
  const MAX_PHOTOS = 3;
  const [photoDrafts, setPhotoDrafts] = useState<Array<{ id: string; file: File; url: string; description: string }>>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const clearPhotoDrafts = () => {
    setPhotoDrafts(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
  };

  const addPhotoFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    setPhotoDrafts(prev => {
      const room = MAX_PHOTOS - prev.length;
      if (room <= 0) { toast.error(`Máximo de ${MAX_PHOTOS} fotos`); return prev; }
      const accepted = incoming.slice(0, room).filter(f => {
        if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name}: máximo 8 MB por foto`); return false; }
        return true;
      });
      if (incoming.length > room) toast.error(`Máximo de ${MAX_PHOTOS} fotos`);
      return [
        ...prev,
        ...accepted.map(f => ({
          id: (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`,
          file: f,
          url: URL.createObjectURL(f),
          description: '',
        })),
      ];
    });
  };

  const removePhotoDraft = (id: string) => {
    setPhotoDrafts(prev => {
      const target = prev.find(p => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(p => p.id !== id);
    });
  };

  // Comprime e envia as fotos da conclusão; retorna false se falhar
  const uploadPhotos = async (): Promise<boolean> => {
    if (photoDrafts.length === 0) return true;
    const uploadedPaths: string[] = [];
    try {
      const { compressImage } = await import('@/lib/imageCompression');
      const { uploadProgress } = await import('@/lib/uploadProgress');
      uploadProgress.start('Enviando fotos da conclusão', photoDrafts.length);
      const authorLabel = userCode ? `${userName} #${userCode}` : userName;
      const existing: OTPhoto[] = Array.isArray(o.ot_photos) ? (o.ot_photos as OTPhoto[]) : [];
      const uploaded: OTPhoto[] = [];
      for (let i = 0; i < photoDrafts.length; i++) {
        const draft = photoDrafts[i];
        uploadProgress.step({ index: i + 1, phase: 'compressing' });
        const c = await compressImage(draft.file);
        const uploadFile = c.file;
        const ext = (uploadFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const uid = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
        const path = `${o.company_id}/${o.id}/${uid}.${ext}`;
        uploadProgress.step({ index: i + 1, phase: 'uploading' });
        const { error: upErr } = await supabase.storage.from('oc-photos').upload(path, uploadFile, {
          contentType: uploadFile.type || 'image/jpeg',
          upsert: false,
        });
        if (upErr) throw upErr;
        uploadedPaths.push(path);
        uploaded.push({
          id: uid,
          path,
          description: draft.description.trim() || 'Foto da conclusão',
          author: authorLabel,
          ts: new Date().toISOString(),
        });
      }
      uploadProgress.step({ index: photoDrafts.length, phase: 'finalizing' });
      const { error: updErr } = await (supabase.from as any)('article_change_orders')
        .update({ ot_photos: [...existing, ...uploaded] })
        .eq('id', o.id);
      if (updErr) throw updErr;
      uploadProgress.done();
      clearPhotoDrafts();
      return true;
    } catch (photoErr) {
      console.error('Falha ao anexar fotos da conclusão da OT', photoErr);
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('oc-photos').remove(uploadedPaths).catch(() => { /* */ });
      }
      try { const { uploadProgress } = await import('@/lib/uploadProgress'); uploadProgress.fail('Falha ao enviar fotos'); } catch { /* */ }
      return false;
    }
  };

  // Guarda anti double-click: sem isso, dois cliques rápidos entram em `submit`
  // antes do próximo render, criando linhas duplicadas na tabela `notifications`
  // (OT concluída aparecendo 2x/3x na central).
  const savingRef = useRef(false);

  const submit = async () => {
    if (savingRef.current) return;
    if (!report.trim()) { toast.error('Relatório final é obrigatório'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
    // [rpcmecanica Fase 3] Conclusão atômica em uma única transação SQL.
    const parsedTurns = (() => {
      if (!turns) return null;
      const n = Number(String(turns).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    })();
    const { data: rpcData, error } = await (supabase.rpc as any)('finalize_article_change_order', {
      p_order_id: o.id,
      p_report: report.trim(),
      p_turns: parsedTurns,
      p_holes: Number(holes) || 0,
      p_flaws: Number(flaws) || 0,
      p_author_name: userName,
      p_author_code: userCode,
    });
    if (error) { toast.error(getFriendlyErrorMessage(error.message)); return; }
    const alreadyConcluded = !!(rpcData && rpcData.already);
    // Refresh do contexto compartilhado (Artigo Atual em Máquinas)
    try { await refreshData?.(); } catch (e) { console.error('[FinalizeOT] refreshData failed', e); }
    if (alreadyConcluded) {
      toast.success(`OT #${o.ot_number} já concluída`);
      onDone();
      return;
    }
    logAction('ot_conclude', { ot: o.ot_number });
    toast.success(`OT #${o.ot_number} concluída`);
    // Fotos da conclusão (até 3) — comprimidas antes do upload
    if (photoDrafts.length > 0) {
      const ok = await uploadPhotos();
      if (!ok) toast.error('OT concluída, mas houve erro ao anexar as fotos.');
    }
    // Push de finalização — notifica admins (e líderes/mecânicos)
    try {
      const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
      const targetPath = slug ? `/${slug}/mecanica/ot` : '/';
      const machine = machines.find((m: any) => m.id === o.machine_id);
      const machineName = machine?.name || 'Máquina';
      const nextArt = articles.find((a: any) => a.id === (o as any).next_article_id);
      const nextName = nextArt ? (nextArt.client_name ? `${nextArt.name} (${nextArt.client_name})` : nextArt.name) : null;
      const authorLabel = userCode ? `${userName} #${userCode}` : userName;
      const msgParts = [
        `Concluída por ${authorLabel}`,
        nextName ? `Artigo: ${nextName}` : null,
        parsedTurns != null ? `${parsedTurns} voltas` : null,
        `${Number(holes) || 0} furos`,
        `${Number(flaws) || 0} falhas`,
        report.trim() ? `Relatório: ${report.trim().slice(0, 100)}` : null,
      ].filter(Boolean);
      supabase.functions.invoke('send-push-notification', {
        body: {
          company_id: o.company_id,
          title: `OT #${String(o.ot_number).padStart(3, '0')} concluída — ${machineName}`,
          message: msgParts.join(' • '),
          url: targetPath,
          roles: ['lider', 'lider_noite', 'mecanico', 'lider_mecanica'],
          include_admins: true,
          source: 'OT',
          ref_id: o.id,
          ref_number: `OT #${String(o.ot_number).padStart(3, '0')}`,
        },
      }).catch(() => { /* silencioso */ });
    } catch { /* silencioso */ }
    onDone();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) { if (saving) return; clearPhotoDrafts(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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

          {/* Fotos da conclusão (até 3) */}
          <div className="rounded-md border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                <Camera className="h-4 w-4" /> Fotos da conclusão (opcional)
              </Label>
              <span className="text-[10px] text-muted-foreground">{photoDrafts.length}/{MAX_PHOTOS}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Até {MAX_PHOTOS} imagens (8 MB cada). São comprimidas automaticamente antes do envio.</p>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => { addPhotoFiles(e.target.files); e.currentTarget.value = ''; }} />
            <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addPhotoFiles(e.target.files); e.currentTarget.value = ''; }} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={saving || photoDrafts.length >= MAX_PHOTOS} onClick={() => photoInputRef.current?.click()} className="gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Câmera
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={saving || photoDrafts.length >= MAX_PHOTOS} onClick={() => galleryInputRef.current?.click()} className="gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Galeria
              </Button>
            </div>
            {photoDrafts.length > 0 && (
              <div className="space-y-2">
                {photoDrafts.map(p => (
                  <div key={p.id} className="flex items-start gap-2 rounded-md border bg-background p-2">
                    <img src={p.url} alt="Pré-visualização da foto da conclusão da OT" className="h-16 w-16 rounded object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Input
                        value={p.description}
                        onChange={e => { const v = e.target.value; setPhotoDrafts(prev => prev.map(d => d.id === p.id ? { ...d, description: v } : d)); }}
                        placeholder="Descrição (opcional)"
                        className="h-8 text-xs"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground truncate">{p.file.name}</p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="shrink-0" disabled={saving} onClick={() => removePhotoDraft(p.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { clearPhotoDrafts(); onClose(); }}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Finalizar OT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}