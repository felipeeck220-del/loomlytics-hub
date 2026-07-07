import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useFreightOrders, type FreightOrderStatus, type FreightOrder } from '@/hooks/useFreightOrders';
import { generateFreightOrderPdf } from '@/lib/freightOrderPdf';
import { useMarkSourceAsRead } from '@/hooks/useMarkSourceAsRead';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/SearchableSelect';
import { BrazilianWeightInput } from '@/components/BrazilianWeightInput';
import { Plus, Play, Truck, CheckCircle2, Download, Ban, X, Camera, Eye, Trash2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STATUS_ORDER: FreightOrderStatus[] = ['open', 'pickup_in_progress', 'delivery_in_progress', 'completed'];
const STATUS_LABEL: Record<FreightOrderStatus, string> = {
  open: 'Aberto',
  pickup_in_progress: 'Coleta em curso',
  delivery_in_progress: 'Entrega em curso',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};
const STATUS_BG: Record<FreightOrderStatus, string> = {
  open: 'bg-red-500/10 border-red-500/30',
  pickup_in_progress: 'bg-yellow-500/15 border-yellow-500/30',
  delivery_in_progress: 'bg-blue-500/10 border-blue-500/30',
  completed: 'bg-green-500/10 border-green-500/30',
  cancelled: 'bg-slate-500/10 border-slate-500/30',
};

function fmt(dt?: string | null): string {
  if (!dt) return '—';
  const d = new Date(dt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function elapsed(fromIso?: string | null): string {
  if (!fromIso) return '—';
  const ms = Date.now() - new Date(fromIso).getTime();
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function FreightOrders() {
  const { user } = useAuth();
  useMarkSourceAsRead('OFR');
  const { role } = usePermissions();
  const { getArticles } = useSharedCompanyData();
  const articles = getArticles();
  const { toast } = useToast();
  const {
    orders, isLoading, freighters,
    createOrder, startPickup, startDelivery, completeOrder, cancelOrder,
    createFreighter, updateFreighter, deleteFreighter,
    getPhotoSignedUrl,
  } = useFreightOrders();

  const isAdmin = role === 'admin';
  const isFreteiro = role === 'freteiro';
  const [tab, setTab] = useState<FreightOrderStatus>('open');
  const [newOpen, setNewOpen] = useState(false);
  const [freightersOpen, setFreightersOpen] = useState(false);
  const [detailsOrder, setDetailsOrder] = useState<FreightOrder | null>(null);
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useTicker(tab === 'pickup_in_progress' || tab === 'delivery_in_progress');

  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)('companies').select('name, logo_url').eq('id', user.company_id).maybeSingle()
      .then(({ data }: any) => {
        setCompanyName(data?.name || '');
        setCompanyLogo(data?.logo_url || null);
      });
  }, [user?.company_id]);

  const counts = useMemo(() => {
    const c: Record<FreightOrderStatus, number> = {
      open: 0, pickup_in_progress: 0, delivery_in_progress: 0, completed: 0, cancelled: 0,
    };
    for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(() => orders.filter(o => o.status === tab), [orders, tab]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center"><Truck className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Ordem de Frete</h1>
            <p className="text-xs text-muted-foreground">Coletas realizadas por motoristas freteiros</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setFreightersOpen(true)}>
                <Users className="h-4 w-4 mr-1.5" /> Freteiros
              </Button>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Nova OFR
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FreightOrderStatus)}>
        <TabsList className="w-full grid grid-cols-2 md:grid-cols-5 h-auto">
          {STATUS_ORDER.map(s => (
            <TabsTrigger key={s} value={s} className="text-xs sm:text-sm py-2">
              {STATUS_LABEL[s]}
              {counts[s] > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{counts[s]}</span>}
            </TabsTrigger>
          ))}
          <TabsTrigger value="cancelled" className="text-xs sm:text-sm py-2">
            Cancelados
            {counts.cancelled > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">{counts.cancelled}</span>}
          </TabsTrigger>
        </TabsList>

        {(['open','pickup_in_progress','delivery_in_progress','completed','cancelled'] as FreightOrderStatus[]).map(s => (
          <TabsContent key={s} value={s} className="mt-4 space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma OFR nesta aba.</div>
            )}
            {filtered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                isAdmin={isAdmin}
                isFreteiro={isFreteiro}
                onStartPickup={() => startPickup.mutate(order.id)}
                onStartDelivery={() => startDelivery.mutate(order.id)}
                onComplete={() => setCompleteOrderId(order.id)}
                onCancel={() => setCancelOrderId(order.id)}
                onDetails={() => setDetailsOrder(order)}
                onDownload={() => generateFreightOrderPdf(order, companyName, companyLogo)}
                getPhotoSignedUrl={getPhotoSignedUrl}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {isAdmin && (
        <NewOFRModal
          open={newOpen}
          onOpenChange={setNewOpen}
          freighters={freighters}
          articles={articles as any}
          onSubmit={(payload) => createOrder.mutate(payload, { onSuccess: () => setNewOpen(false) })}
          submitting={createOrder.isPending}
        />
      )}

      {isAdmin && (
        <FreightersModal
          open={freightersOpen}
          onOpenChange={setFreightersOpen}
          freighters={freighters}
          onCreate={(p) => createFreighter.mutate(p)}
          onUpdate={(p) => updateFreighter.mutate(p)}
          onDelete={(id) => deleteFreighter.mutate(id)}
        />
      )}

      <CompleteModal
        open={!!completeOrderId}
        onOpenChange={(o) => !o && setCompleteOrderId(null)}
        onSubmit={(photos) => {
          if (!completeOrderId) return;
          completeOrder.mutate({ id: completeOrderId, photos }, {
            onSuccess: () => setCompleteOrderId(null),
          });
        }}
        submitting={completeOrder.isPending}
      />

      <CancelModal
        open={!!cancelOrderId}
        onOpenChange={(o) => !o && setCancelOrderId(null)}
        onSubmit={(reason) => {
          if (!cancelOrderId) return;
          cancelOrder.mutate({ id: cancelOrderId, reason }, {
            onSuccess: () => setCancelOrderId(null),
          });
        }}
      />

      <DetailsModal
        order={detailsOrder}
        onOpenChange={(o) => !o && setDetailsOrder(null)}
        getPhotoSignedUrl={getPhotoSignedUrl}
      />
    </div>
  );
}

/* ---------------- Cards ---------------- */

function OrderCard({
  order, isAdmin, isFreteiro,
  onStartPickup, onStartDelivery, onComplete, onCancel, onDetails, onDownload,
  getPhotoSignedUrl,
}: {
  order: FreightOrder;
  isAdmin: boolean;
  isFreteiro: boolean;
  onStartPickup: () => void;
  onStartDelivery: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDetails: () => void;
  onDownload: () => void;
  getPhotoSignedUrl: (p: string, e?: number) => Promise<string | null>;
}) {
  const totalPieces = (order.items || []).reduce((s, i) => s + Number(i.pieces || 0), 0);
  const totalKg = (order.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);

  const timer =
    order.status === 'pickup_in_progress' ? elapsed(order.pickup_started_at)
    : order.status === 'delivery_in_progress' ? elapsed(order.delivery_started_at)
    : null;

  return (
    <Card className={cn('border', STATUS_BG[order.status])}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">OFR #{order.ofr_number}</span>
              <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[order.status]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Freteiro: <span className="font-medium text-foreground">{order.freighter?.name || '—'}</span>
              {order.freighter?.vehicle ? ` · ${order.freighter.vehicle}` : ''}
            </p>
          </div>
          {timer && (
            <div className="px-3 py-1.5 rounded-lg bg-background/60 border border-border font-mono text-sm">
              ⏱ {timer}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Coleta:</span> <span className="font-medium">{order.pickup_location}</span></div>
          <div><span className="text-muted-foreground">Entrega:</span> <span className="font-medium">{order.delivery_location}</span></div>
        </div>

        <div className="text-xs text-muted-foreground">
          {(order.items || []).length} artigo(s) · {totalPieces} peça(s) · {totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onDetails}>
            <Eye className="h-4 w-4 mr-1.5" /> Detalhes
          </Button>

          {order.status === 'open' && (isFreteiro || isAdmin) && (
            <Button size="sm" onClick={onStartPickup}>
              <Play className="h-4 w-4 mr-1.5" /> Iniciar Coleta
            </Button>
          )}
          {order.status === 'pickup_in_progress' && (isFreteiro || isAdmin) && (
            <Button size="sm" onClick={onStartDelivery}>
              <Truck className="h-4 w-4 mr-1.5" /> Iniciar Entrega
            </Button>
          )}
          {order.status === 'delivery_in_progress' && (isFreteiro || isAdmin) && (
            <Button size="sm" onClick={onComplete}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Finalizar Entrega
            </Button>
          )}
          {order.status === 'completed' && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4 mr-1.5" /> Baixar Relatório
            </Button>
          )}
          {isAdmin && order.status !== 'completed' && order.status !== 'cancelled' && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-destructive">
              <Ban className="h-4 w-4 mr-1.5" /> Cancelar
            </Button>
          )}
        </div>

        {order.status === 'cancelled' && order.cancellation_reason && (
          <p className="text-xs text-destructive">Motivo do cancelamento: {order.cancellation_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Modals ---------------- */

function NewOFRModal({
  open, onOpenChange, freighters, articles, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  freighters: Array<{ id: string; name: string; active: boolean }>;
  articles: Array<{ id: string; name: string; client_name?: string }>;
  onSubmit: (p: {
    freighter_id: string; pickup_location: string; delivery_location: string;
    observations?: string;
    items: Array<{ article_id?: string | null; article_name?: string; pieces: number; weight_kg: number }>;
  }) => void;
  submitting: boolean;
}) {
  const [freighterId, setFreighterId] = useState('');
  const [pickup, setPickup] = useState('');
  const [delivery, setDelivery] = useState('');
  const [obs, setObs] = useState('');
  const [items, setItems] = useState<Array<{ article_id: string; pieces: number; weight_kg: string }>>([
    { article_id: '', pieces: 0, weight_kg: '' },
  ]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setFreighterId(''); setPickup(''); setDelivery(''); setObs('');
      setItems([{ article_id: '', pieces: 0, weight_kg: '' }]);
    }
  }, [open]);

  const submit = () => {
    if (!freighterId) return toast({ title: 'Selecione o freteiro', variant: 'destructive' });
    if (!pickup.trim() || !delivery.trim()) return toast({ title: 'Preencha coleta e entrega', variant: 'destructive' });
    const cleaned = items
      .map(i => ({ ...i, weight_num: parseFloat((i.weight_kg || '0').toString().replace(',', '.')) || 0 }))
      .filter(i => i.article_id && (i.pieces > 0 || i.weight_num > 0));
    if (!cleaned.length) return toast({ title: 'Adicione pelo menos 1 artigo', variant: 'destructive' });
    onSubmit({
      freighter_id: freighterId,
      pickup_location: pickup.trim(),
      delivery_location: delivery.trim(),
      observations: obs.trim() || undefined,
      items: cleaned.map(i => {
        const art = articles.find(a => a.id === i.article_id);
        return {
          article_id: i.article_id,
          article_name: art?.name,
          pieces: i.pieces,
          weight_kg: i.weight_num,
        };
      }),
    });
  };

  const artOptions = articles.map(a => ({ value: a.id, label: `${a.name}${(a as any).client_name ? ` (${(a as any).client_name})` : ''}` }));
  const freighterOptions = freighters.filter(f => f.active).map(f => ({ value: f.id, label: f.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Ordem de Frete</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Freteiro *</Label>
            <SearchableSelect value={freighterId} onValueChange={setFreighterId} options={freighterOptions} placeholder="Selecione o freteiro" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Local de coleta *</Label>
              <Input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="Ex: TEAR / Tinturaria Litoral" />
            </div>
            <div>
              <Label>Local de entrega *</Label>
              <Input value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="Ex: Cliente XYZ" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Artigos *</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { article_id: '', pieces: 0, weight_kg: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar artigo
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
                  <div className="col-span-12 sm:col-span-6">
                    <Label className="text-xs">Artigo</Label>
                    <SearchableSelect
                      value={it.article_id}
                      onValueChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, article_id: v } : x))}
                      options={artOptions}
                      placeholder="Selecione"
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <Label className="text-xs">Peças</Label>
                    <Input type="number" min={0} value={it.pieces || ''} onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, pieces: parseInt(e.target.value || '0', 10) } : x))} />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <Label className="text-xs">Peso (kg)</Label>
                    <BrazilianWeightInput value={it.weight_kg} onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, weight_kg: v } : x))} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Salvando…' : 'Criar OFR'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreightersModal({
  open, onOpenChange, freighters, onCreate, onUpdate, onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  freighters: any[];
  onCreate: (p: { name: string; phone?: string; vehicle?: string; user_id?: string; profile_id?: string }) => void;
  onUpdate: (p: { id: string; name?: string; phone?: string; vehicle?: string; active?: boolean; user_id?: string | null; profile_id?: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [userId, setUserId] = useState('');
  const [profiles, setProfiles] = useState<Array<{ user_id: string; id: string; name: string; email: string; role: string }>>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!open || !user?.company_id) return;
    (supabase.from as any)('profiles')
      .select('id, user_id, name, email, role')
      .eq('company_id', user.company_id)
      .eq('role', 'freteiro')
      .then(({ data }: any) => setProfiles(data || []));
  }, [open, user?.company_id]);

  const submit = () => {
    if (!name.trim()) return;
    const prof = profiles.find(p => p.user_id === userId);
    onCreate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      vehicle: vehicle.trim() || undefined,
      user_id: userId || undefined,
      profile_id: prof?.id,
    });
    setName(''); setPhone(''); setVehicle(''); setUserId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Freteiros cadastrados</DialogTitle></DialogHeader>

        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-sm font-medium">Novo freteiro</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Veículo</Label>
              <Input value={vehicle} onChange={e => setVehicle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vincular usuário (freteiro)</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Nenhum (só cadastro)" /></SelectTrigger>
                <SelectContent>
                  {profiles.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Cadastre um usuário com perfil "Freteiro" em Configurações.</div>}
                  {profiles.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.name} ({p.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit}><Plus className="h-4 w-4 mr-1.5" />Adicionar</Button>
          </div>
        </div>

        <div className="space-y-2">
          {freighters.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum freteiro cadastrado.</p>}
          {freighters.map(f => (
            <div key={f.id} className="flex items-center justify-between border rounded-lg p-2 gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{f.name}{!f.active && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[f.phone, f.vehicle].filter(Boolean).join(' · ') || '—'}
                  {f.user_id ? ' · com login' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onUpdate({ id: f.id, active: !f.active })}>{f.active ? 'Desativar' : 'Ativar'}</Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(f.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompleteModal({
  open, onOpenChange, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (photos: Array<{ file: File; description?: string }>) => void;
  submitting: boolean;
}) {
  const [photos, setPhotos] = useState<Array<{ file: File; description: string; preview: string }>>([]);
  const { toast } = useToast();

  useEffect(() => { if (open) setPhotos([]); }, [open]);

  const onFile = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= 2) break;
      next.push({ file: f, description: '', preview: URL.createObjectURL(f) });
    }
    setPhotos(next);
  };

  const submit = () => {
    if (photos.length === 0) return toast({ title: 'Anexe ao menos 1 foto', variant: 'destructive' });
    onSubmit(photos.map(p => ({ file: p.file, description: p.description })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Finalizar Entrega</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Anexe até 2 fotos comprovando a entrega.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild disabled={photos.length >= 2}>
              <label className="cursor-pointer">
                <Camera className="h-4 w-4 mr-1.5" /> Tirar foto
                <input hidden type="file" accept="image/*" capture="environment" onChange={e => onFile(e.target.files)} />
              </label>
            </Button>
            <Button variant="outline" size="sm" asChild disabled={photos.length >= 2}>
              <label className="cursor-pointer">
                <Plus className="h-4 w-4 mr-1.5" /> Da galeria
                <input hidden type="file" accept="image/*" multiple onChange={e => onFile(e.target.files)} />
              </label>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, idx) => (
              <div key={idx} className="border rounded-lg p-2 space-y-2">
                <div className="relative">
                  <img src={p.preview} alt="" className="w-full h-32 object-cover rounded" />
                  <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 bg-background/80" onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input placeholder="Descrição (opcional)" value={p.description} onChange={e => setPhotos(photos.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Enviando…' : 'Finalizar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelModal({
  open, onOpenChange, onSubmit,
}: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancelar OFR</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Motivo *</Label>
          <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button variant="destructive" onClick={() => reason.trim() && onSubmit(reason.trim())}>Cancelar OFR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsModal({
  order, onOpenChange, getPhotoSignedUrl,
}: {
  order: FreightOrder | null;
  onOpenChange: (o: boolean) => void;
  getPhotoSignedUrl: (p: string, e?: number) => Promise<string | null>;
}) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!order?.photos?.length) { setPhotoUrls({}); return; }
    (async () => {
      const map: Record<string, string> = {};
      for (const p of order.photos!) {
        const url = await getPhotoSignedUrl(p.storage_path, 3600);
        if (url) map[p.id] = url;
      }
      setPhotoUrls(map);
    })();
  }, [order?.id]);

  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>OFR #{order.ofr_number} — {STATUS_LABEL[order.status]}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Freteiro:</span> <span className="font-medium">{order.freighter?.name}</span></div>
            <div><span className="text-muted-foreground">Veículo:</span> <span className="font-medium">{order.freighter?.vehicle || '—'}</span></div>
            <div><span className="text-muted-foreground">Coleta:</span> <span className="font-medium">{order.pickup_location}</span></div>
            <div><span className="text-muted-foreground">Entrega:</span> <span className="font-medium">{order.delivery_location}</span></div>
          </div>
          {order.observations && (
            <div><span className="text-muted-foreground">Observações:</span> <span className="font-medium">{order.observations}</span></div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">Artigos</div>
            <div className="divide-y">
              {(order.items || []).map(i => (
                <div key={i.id} className="px-3 py-1.5 flex justify-between text-xs">
                  <span>{i.article?.name || i.article_name || '—'}</span>
                  <span className="text-muted-foreground">{i.pieces} pçs · {Number(i.weight_kg).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">Linha do tempo</div>
            <div className="px-3 py-2 space-y-1 text-xs">
              <div>Criada: <span className="font-medium">{fmt(order.created_at)}</span></div>
              <div>Coleta iniciada: <span className="font-medium">{fmt(order.pickup_started_at)}</span></div>
              <div>Entrega iniciada: <span className="font-medium">{fmt(order.delivery_started_at)}</span></div>
              <div>Finalizada: <span className="font-medium">{fmt(order.completed_at)}</span></div>
              {order.cancelled_at && <div className="text-destructive">Cancelada: {fmt(order.cancelled_at)} — {order.cancellation_reason}</div>}
            </div>
          </div>

          {(order.photos || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1">Fotos da entrega</p>
              <div className="grid grid-cols-2 gap-2">
                {order.photos!.map(p => (
                  <div key={p.id} className="border rounded-lg p-2">
                    {photoUrls[p.id] ? (
                      <img src={photoUrls[p.id]} alt="" className="w-full h-40 object-cover rounded" />
                    ) : (
                      <div className="w-full h-40 bg-muted animate-pulse rounded" />
                    )}
                    {p.description && <p className="text-xs mt-1">{p.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}