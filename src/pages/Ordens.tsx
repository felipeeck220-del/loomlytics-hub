import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  Clock, Factory, Wrench, AlertTriangle, RefreshCw, Settings2, Zap,
  Hash, UserCircle2, PlayCircle, PauseCircle, ImageIcon, Eye, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

type Photo = { path: string; description?: string | null };
type ProgressNote = { note?: string; text?: string; created_at?: string; by_name?: string; by_code?: string };

export default function OrdensPage() {
  const { dbCompanyId, getMachines } = useSharedCompanyData();
  const { slug } = useParams<{ slug: string }>();
  const machines = getMachines();

  const [openOMs, setOpenOMs] = useState<any[]>([]);
  const [openOTs, setOpenOTs] = useState<any[]>([]);
  const [nowTick, setNowTick] = useState(new Date());
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [galleryOrder, setGalleryOrder] = useState<any | null>(null);

  const fetchOpenOMs = useCallback(async () => {
    if (!dbCompanyId) return;
    const { data, error } = await (supabase.from as any)('maintenance_orders')
      .select('*')
      .eq('company_id', dbCompanyId)
      .eq('status', 'em_curso')
      .order('started_at', { ascending: false });
    if (!error) setOpenOMs(data || []);
  }, [dbCompanyId]);

  const fetchOpenOTs = useCallback(async () => {
    if (!dbCompanyId) return;
    const { data, error } = await (supabase.from as any)('article_change_orders')
      .select('*')
      .eq('company_id', dbCompanyId)
      .in('status', ['troca_fio_em_curso', 'aguardando_regulagem', 'em_regulagem', 'em_acompanhamento'])
      .order('created_at', { ascending: false });
    if (!error) setOpenOTs(data || []);
  }, [dbCompanyId]);

  useEffect(() => { fetchOpenOMs(); fetchOpenOTs(); }, [fetchOpenOMs, fetchOpenOTs]);

  useEffect(() => {
    if (!dbCompanyId) return;
    const ch = supabase
      .channel(`ordens-page-${dbCompanyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_orders', filter: `company_id=eq.${dbCompanyId}` }, () => fetchOpenOMs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_orders', filter: `company_id=eq.${dbCompanyId}` }, () => fetchOpenOTs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dbCompanyId, fetchOpenOMs, fetchOpenOTs]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Sign URLs for all photos across open OMs (OC/OE with oc_photos)
  useEffect(() => {
    const paths = new Set<string>();
    openOMs.forEach(o => {
      const arr: Photo[] = Array.isArray(o.oc_photos) ? o.oc_photos : [];
      arr.forEach(p => p?.path && paths.add(p.path));
    });
    const missing = Array.from(paths).filter(p => !photoUrls[p]);
    if (missing.length === 0) return;
    (async () => {
      const entries: [string, string][] = [];
      for (const p of missing) {
        const { data } = await supabase.storage.from('oc-photos').createSignedUrl(p, 3600);
        if (data?.signedUrl) entries.push([p, data.signedUrl]);
      }
      if (entries.length) setPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOMs]);

  const orders = useMemo(() => {
    const oms = openOMs.map(om => {
      const isOC = om.type === 'manutencao_corretiva';
      const isOE = om.type === 'manutencao_eletrica';
      const kind: 'om' | 'oc' | 'oe' = isOE ? 'oe' : isOC ? 'oc' : 'om';
      const num = isOE ? om.oe_number : isOC ? (om.oc_number ?? om.om_number) : om.om_number;
      return {
        kind,
        id: om.id,
        machine_id: om.machine_id,
        number: num,
        type: om.type,
        priority: om.priority,
        status: om.status,
        statusLabel: 'Em curso',
        startedAt: om.started_at || om.created_at,
        createdByName: om.created_by_name,
        createdByCode: om.created_by_code,
        startedByName: om.started_by_name,
        startedByCode: om.started_by_code,
        description: om.description as string | null,
        progress_notes: (Array.isArray(om.progress_notes) ? om.progress_notes : []) as ProgressNote[],
        photos: (Array.isArray(om.oc_photos) ? om.oc_photos : []) as Photo[],
        raw: om,
      };
    });
    const OT_STATUS_LABELS: Record<string, string> = {
      troca_fio_em_curso: 'Troca de Fio',
      aguardando_regulagem: 'Aguardando Regulagem',
      em_regulagem: 'Em Regulagem',
      em_acompanhamento: 'Em Acompanhamento',
    };
    const ots = openOTs.map(ot => {
      let stageStartedAt: string | null = null;
      let stageByName: string | null = null;
      let stageByCode: string | null = null;
      switch (ot.status) {
        case 'troca_fio_em_curso':
          stageStartedAt = ot.yarn_change_started_at || ot.created_at;
          stageByName = ot.yarn_change_by_name || null;
          stageByCode = ot.yarn_change_by_code || null;
          break;
        case 'aguardando_regulagem':
          stageStartedAt = ot.yarn_change_ended_at || ot.yarn_change_started_at || ot.created_at;
          stageByName = ot.yarn_change_finished_by_name || ot.yarn_change_by_name || null;
          stageByCode = ot.yarn_change_finished_by_code || ot.yarn_change_by_code || null;
          break;
        case 'em_regulagem':
          stageStartedAt = ot.adjustment_started_at || ot.yarn_change_ended_at || ot.created_at;
          stageByName = ot.adjustment_by_name || null;
          stageByCode = ot.adjustment_by_code || null;
          break;
        case 'em_acompanhamento':
          stageStartedAt = ot.monitoring_started_at || ot.adjustment_ended_at || ot.adjustment_started_at || ot.created_at;
          stageByName = ot.adjustment_finished_by_name || ot.adjustment_by_name || null;
          stageByCode = ot.adjustment_finished_by_code || ot.adjustment_by_code || null;
          break;
        default:
          stageStartedAt = ot.created_at;
      }
      return {
        kind: 'ot' as const,
        id: ot.id,
        machine_id: ot.machine_id,
        number: ot.ot_number,
        type: 'troca_artigo',
        priority: 'normal',
        status: ot.status,
        statusLabel: OT_STATUS_LABELS[ot.status] || ot.status,
        startedAt: stageStartedAt,
        createdByName: ot.created_by_name,
        createdByCode: ot.created_by_code,
        startedByName: stageByName,
        startedByCode: stageByCode,
        description: ot.observations as string | null,
        progress_notes: [] as ProgressNote[],
        photos: [] as Photo[],
        raw: ot,
      };
    });
    return [...oms, ...ots].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
  }, [openOMs, openOTs]);

  const typeLabels: Record<string, string> = {
    manutencao_preventiva: 'Manutenção Preventiva',
    manutencao_corretiva: 'Manutenção Corretiva',
    manutencao_eletrica: 'Manutenção Elétrica',
    troca_artigo: 'Troca de Artigo',
    troca_agulhas: 'Troca de Agulheiro',
  };
  const typeIcons: Record<string, React.ReactNode> = {
    manutencao_preventiva: <Wrench className="h-4 w-4" />,
    manutencao_corretiva: <AlertTriangle className="h-4 w-4" />,
    manutencao_eletrica: <Zap className="h-4 w-4" />,
    troca_artigo: <RefreshCw className="h-4 w-4" />,
    troca_agulhas: <Settings2 className="h-4 w-4" />,
  };
  const typeColors: Record<string, string> = {
    manutencao_preventiva: 'border-l-warning bg-warning/5',
    manutencao_corretiva: 'border-l-destructive bg-destructive/5',
    manutencao_eletrica: 'border-l-yellow-500 bg-yellow-500/5',
    troca_artigo: 'border-l-info bg-info/5',
    troca_agulhas: 'border-l-primary bg-primary/5',
  };
  const badgeColors: Record<string, string> = {
    manutencao_preventiva: 'bg-warning/10 text-warning border-warning/20',
    manutencao_corretiva: 'bg-destructive/10 text-destructive border-destructive/20',
    manutencao_eletrica: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
    troca_artigo: 'bg-info/10 text-info border-info/20',
    troca_agulhas: 'bg-primary/10 text-primary border-primary/20',
  };

  return (
    <div className="-mx-4 md:mx-0 space-y-4">
      <Card className="shadow-material border-0 border-l-4 border-l-warning">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <PauseCircle className="h-5 w-5 text-warning" />
                Ordens em Curso ({orders.length})
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                  </span>
                  ao vivo
                </span>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Máquinas paradas por OM, OC, OE e OT · atualização em tempo real
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Factory className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma ordem em execução no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {orders.map(o => {
                const machine = machines.find(mm => mm.id === o.machine_id);
                const startedAt = o.startedAt;
                const rawElapsed = startedAt ? Math.floor((nowTick.getTime() - new Date(startedAt).getTime()) / 1000) : 0;
                const elapsed = Math.max(0, rawElapsed);
                const hours = Math.floor(elapsed / 3600);
                const minutes = Math.floor((elapsed % 3600) / 60);
                const seconds = elapsed % 60;
                const timeStr = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
                const colorClass = typeColors[o.type] || 'border-l-muted bg-muted/5';
                const isPriority = o.priority === 'prioritaria';
                const numberPrefix = o.kind.toUpperCase();
                const numberStr = o.number != null ? String(o.number).padStart(3, '0') : '—';
                const notes = o.progress_notes || [];
                const photos = o.photos || [];

                return (
                  <div
                    key={`${o.kind}-${o.id}`}
                    className={cn(
                      'rounded-xl border border-border/50 border-l-4 p-3 sm:p-4 hover:shadow-md transition-shadow flex flex-col',
                      colorClass
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-mono font-semibold text-muted-foreground">{numberPrefix} #{numberStr}</span>
                          {isPriority && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-destructive/10 text-destructive border-destructive/20">
                              PRIORITÁRIA
                            </Badge>
                          )}
                        </div>
                        <p className="font-bold text-base text-foreground truncate">{machine?.name || 'Máquina'}</p>
                        {machine?.model && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {machine.model}{machine.diameter ? ` · Ø ${machine.diameter}` : ''}{machine.fineness ? ` · ${machine.fineness}` : ''}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 bg-success/10 text-success border-success/20">
                        {o.statusLabel}
                      </Badge>
                    </div>

                    <div className={cn('inline-flex self-start items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium mb-3', badgeColors[o.type])}>
                      {typeIcons[o.type]}
                      <span>{typeLabels[o.type] || o.type}</span>
                    </div>

                    {o.description && (
                      <div className="mb-3 rounded-md border border-border/40 bg-background/60 p-2 text-xs">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Descrição</div>
                        <p className="whitespace-pre-wrap line-clamp-4 text-foreground/90">{o.description}</p>
                      </div>
                    )}

                    <div className="space-y-1.5 mb-3 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          <span className="opacity-70">Criada por:</span>{' '}
                          <span className="font-medium text-foreground">
                            {o.createdByName ? (o.createdByCode ? `${o.createdByName} #${o.createdByCode}` : o.createdByName) : '—'}
                          </span>
                        </span>
                      </div>
                      {o.startedByName && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <PlayCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                          <span className="truncate">
                            <span className="opacity-70">
                              {o.kind === 'ot'
                                ? (o.status === 'troca_fio_em_curso' ? 'Troca de fio por:'
                                  : o.status === 'aguardando_regulagem' ? 'Troca finalizada por:'
                                  : o.status === 'em_regulagem' ? 'Regulagem por:'
                                  : o.status === 'em_acompanhamento' ? 'Regulagem finalizada por:'
                                  : 'Iniciada por:')
                                : 'Iniciada por:'}
                            </span>{' '}
                            <span className="font-medium text-foreground">
                              {o.startedByCode ? `${o.startedByName} #${o.startedByCode}` : o.startedByName}
                            </span>
                          </span>
                        </div>
                      )}
                      {startedAt && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span className="opacity-70">Início:</span>{' '}
                          <span className="font-medium text-foreground">{format(new Date(startedAt), 'dd/MM/yyyy HH:mm')}</span>
                        </div>
                      )}
                    </div>

                    {photos.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" /> Fotos ({photos.length})
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setGalleryOrder(o)}>
                            <Eye className="h-3 w-3 mr-1" /> Ampliar
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {photos.slice(0, 3).map((p, idx) => {
                            const url = photoUrls[p.path];
                            return url ? (
                              <button
                                key={idx}
                                onClick={() => setGalleryOrder(o)}
                                className="aspect-square overflow-hidden rounded-md border border-border/40 bg-muted"
                              >
                                <img src={url} alt={p.description || `Foto ${idx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <div key={idx} className="aspect-square rounded-md border border-border/40 bg-muted animate-pulse" />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {notes.length > 0 && (
                      <div className="mb-3 rounded-md border border-border/40 bg-background/60 p-2 text-xs">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Anotações ({notes.length})
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {notes.slice(-3).reverse().map((n, i) => (
                            <div key={i} className="border-l-2 border-primary/40 pl-2">
                              <div className="whitespace-pre-wrap text-foreground/90">{n.note || n.text || ''}</div>
                              {(n.by_name || n.created_at) && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {n.by_name}{n.by_code ? ` #${n.by_code}` : ''}
                                  {n.created_at ? ` · ${format(new Date(n.created_at), 'dd/MM HH:mm')}` : ''}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-2 border-t border-border/40">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {o.kind === 'ot'
                          ? (o.status === 'troca_fio_em_curso' ? 'Tempo de troca de fio'
                            : o.status === 'aguardando_regulagem' ? 'Aguardando regulagem há'
                            : o.status === 'em_regulagem' ? 'Tempo em regulagem'
                            : o.status === 'em_acompanhamento' ? 'Em acompanhamento há'
                            : 'Tempo em execução')
                          : 'Tempo em curso'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-base font-bold tracking-wider tabular-nums text-foreground">{timeStr}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo gallery modal */}
      <Dialog open={!!galleryOrder} onOpenChange={v => !v && setGalleryOrder(null)}>
        <DialogContent className="max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] sm:max-w-[80vw] sm:w-[80vw] sm:h-auto sm:max-h-[80vh] overflow-y-auto">
          {galleryOrder && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Fotos — {galleryOrder.kind.toUpperCase()} #{galleryOrder.number != null ? String(galleryOrder.number).padStart(3, '0') : '—'}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {(galleryOrder.photos as Photo[]).map((p, idx) => {
                  const url = photoUrls[p.path];
                  return (
                    <div key={idx} className="rounded-lg border border-border/40 overflow-hidden bg-muted">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={p.description || `Foto ${idx + 1}`} className="w-full h-auto object-contain" />
                        </a>
                      ) : (
                        <div className="aspect-video animate-pulse" />
                      )}
                      {p.description && (
                        <div className="p-2 text-xs text-muted-foreground border-t border-border/40">
                          {p.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
