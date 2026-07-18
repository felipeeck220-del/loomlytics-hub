import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import type { Machine, MaintenanceOrder, MaintenanceOrderItem, NeedleInventory, SinkerInventory, NeedleTransaction, SinkerTransaction } from '@/types';
import { SearchableSelect } from '@/components/SearchableSelect';

const TYPE_LABELS: Record<string, string> = {
  manutencao_preventiva: 'Preventiva',
  manutencao_corretiva: 'Corretiva',
  troca_artigo: 'Troca Artigo',
  troca_agulhas: 'Troca Agulheiro',
};

interface Props {
  machines: Machine[];
  needles: NeedleInventory[];
  sinkers: SinkerInventory[];
  needleTransactions: NeedleTransaction[];
  sinkerTransactions: SinkerTransaction[];
}

type FeedItem = {
  id: string;
  date: string;
  machine_id?: string | null;
  kind: 'om' | 'agulha' | 'platina';
  title: string;
  detail: string;
  raw?: any;
};

export default function MaintenanceMovementsTab({ machines, needles, sinkers, needleTransactions, sinkerTransactions }: Props) {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [items, setItems] = useState<MaintenanceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [detail, setDetail] = useState<FeedItem | null>(null);

  useEffect(() => {
    (async () => {
      if (!companyId) return;
      setLoading(true);
      // [rpcmecanica Fase 2] 1 RPC consolidada em vez de 2 SELECTs
      const { data, error } = await (supabase.rpc as any)('get_maintenance_orders_list', { p_company_id: companyId });
      if (error) console.error('[MaintenanceMovementsTab] rpc failed', error);
      const payload = (data || {}) as { orders?: MaintenanceOrder[]; items?: MaintenanceOrderItem[] };
      setOrders((payload.orders as MaintenanceOrder[]) || []);
      setItems((payload.items as MaintenanceOrderItem[]) || []);
      setLoading(false);
    })();
  }, [companyId]);

  const machineById = useMemo(() => Object.fromEntries(machines.map(m => [m.id, m])), [machines]);
  const itemsByOrder = useMemo(() => {
    const m: Record<string, MaintenanceOrderItem[]> = {};
    items.forEach(it => { (m[it.order_id] ||= []).push(it); });
    return m;
  }, [items]);

  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    orders.filter(o => o.status === 'finalizada').forEach(o => {
      const its = itemsByOrder[o.id] || [];
      out.push({
        id: `om-${o.id}`,
        date: o.finished_at || o.created_at,
        machine_id: o.machine_id,
        kind: 'om',
        title: (() => {
          const isC = o.type === 'manutencao_corretiva';
          const lbl = isC ? 'OC' : 'OM';
          const num = isC ? ((o as any).oc_number ?? o.om_number) : o.om_number;
          return `${lbl} #${num != null ? String(num).padStart(3, '0') : '—'} — ${TYPE_LABELS[o.type] || o.type}`;
        })(),
        detail: `${machineById[o.machine_id]?.name || ''} · ${its.length} item(ns) trocado(s) · ${o.duration_seconds ? Math.round(o.duration_seconds / 60) + ' min' : '—'}`,
        raw: { order: o, items: its },
      });
    });
    needleTransactions.forEach(t => {
      const n = needles.find(x => x.id === t.needle_id);
      out.push({
        id: `nt-${t.id}`,
        date: t.date,
        machine_id: t.machine_id || null,
        kind: 'agulha',
        title: `${t.type === 'entry' ? 'Entrada' : 'Saída'} de agulha — ${n?.reference_code || '—'}`,
        detail: `${t.quantity}× ${n?.brand || ''}${t.machine_id ? ` · ${machineById[t.machine_id]?.name || ''}` : ''}`,
        raw: { txn: t, needle: n },
      });
    });
    sinkerTransactions.forEach(t => {
      const s = sinkers.find(x => x.id === t.sinker_id);
      out.push({
        id: `st-${t.id}`,
        date: t.date,
        machine_id: t.machine_id || null,
        kind: 'platina',
        title: `${t.type === 'entry' ? 'Entrada' : 'Saída'} de platina — ${s?.reference_code || '—'}`,
        detail: `${t.quantity}× ${s?.brand || ''}${t.machine_id ? ` · ${machineById[t.machine_id]?.name || ''}` : ''}`,
        raw: { txn: t, sinker: s },
      });
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [orders, itemsByOrder, needleTransactions, sinkerTransactions, needles, sinkers, machineById]);

  const filteredByMachine = useMemo(() => selectedMachine ? feed.filter(f => f.machine_id === selectedMachine) : [], [feed, selectedMachine]);

  if (loading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>;

  const renderList = (list: FeedItem[]) => list.length === 0 ? (
    <div className="text-center text-muted-foreground py-10 border rounded">Sem movimentações.</div>
  ) : (
    <div className="space-y-2">
      {list.map(f => (
        <Card key={f.id}><CardContent className="p-3 flex items-center gap-3">
          <Badge variant="outline" className="shrink-0">{f.kind === 'om' ? 'OM' : f.kind === 'agulha' ? 'AGULHA' : 'PLATINA'}</Badge>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{f.title}</div>
            <div className="text-xs text-muted-foreground truncate">{f.detail}</div>
          </div>
          <div className="text-xs text-muted-foreground shrink-0">{f.date ? format(new Date(f.date), 'dd/MM/yyyy HH:mm') : '—'}</div>
          <Button size="icon" variant="ghost" onClick={() => setDetail(f)}><Eye className="h-4 w-4" /></Button>
        </CardContent></Card>
      ))}
    </div>
  );

  return (
    <>
    <Tabs defaultValue="geral" className="w-full">
      <TabsList className="flex flex-wrap h-auto justify-start gap-1">
        <TabsTrigger value="geral">Movimentações Gerais</TabsTrigger>
        <TabsTrigger value="por_maquina">Por Máquina</TabsTrigger>
      </TabsList>
      <TabsContent value="geral" className="mt-4">{renderList(feed)}</TabsContent>
      <TabsContent value="por_maquina" className="mt-4 space-y-3">
        <div className="max-w-md">
          <SearchableSelect
            value={selectedMachine}
            onValueChange={setSelectedMachine}
            placeholder="Selecione uma máquina"
            searchPlaceholder="Buscar máquina..."
            options={machines.map(m => ({ value: m.id, label: m.name }))}
          />
        </div>
        {selectedMachine ? renderList(filteredByMachine) : <div className="text-center text-muted-foreground py-10 border rounded">Selecione uma máquina para ver o histórico.</div>}
      </TabsContent>
    </Tabs>

    <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{detail?.title}</DialogTitle></DialogHeader>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span className="font-medium">{detail.date ? format(new Date(detail.date), 'dd/MM/yyyy HH:mm') : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Máquina</span><span className="font-medium">{detail.machine_id ? machineById[detail.machine_id]?.name : '—'}</span></div>
            {detail.kind === 'om' && detail.raw?.order && (() => {
              const o = detail.raw.order; const its = detail.raw.items as MaintenanceOrderItem[];
              return (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span className="font-medium">{TYPE_LABELS[o.type] || o.type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Início</span><span className="font-medium">{o.started_at ? format(new Date(o.started_at), 'dd/MM/yyyy HH:mm') : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Fim</span><span className="font-medium">{o.finished_at ? format(new Date(o.finished_at), 'dd/MM/yyyy HH:mm') : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Duração</span><span className="font-medium">{o.duration_seconds ? Math.round(o.duration_seconds / 60) + ' min' : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Criada por</span><span className="font-medium">{o.created_by_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Finalizada por</span><span className="font-medium">{o.finished_by_name || '—'}</span></div>
                  {o.description && <div><div className="text-muted-foreground mb-1">Descrição</div><div className="border rounded p-2 text-xs whitespace-pre-wrap">{o.description}</div></div>}
                  {its.length > 0 && (
                    <div>
                      <div className="text-muted-foreground mb-1">Itens trocados</div>
                      <ul className="list-disc pl-5 text-xs space-y-0.5">
                        {its.map(it => {
                          const ref = it.needle_id ? needles.find(n => n.id === it.needle_id)?.reference_code :
                                      it.sinker_id ? sinkers.find(s => s.id === it.sinker_id)?.reference_code :
                                      it.cylinder_id ? 'Cilindro' : it.description;
                          return <li key={it.id}>{it.quantity}× {it.item_type} {ref ? `— ${ref}` : ''}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
            {detail.kind !== 'om' && detail.raw?.txn && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span className="font-medium">{detail.raw.txn.type === 'entry' ? 'Entrada' : 'Saída'}{detail.raw.txn.exit_mode ? ` — ${detail.raw.txn.exit_mode}` : ''}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><span className="font-medium">{detail.raw.txn.quantity}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Referência</span><span className="font-medium">{detail.raw.needle?.reference_code || detail.raw.sinker?.reference_code || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Por</span><span className="font-medium">{detail.raw.txn.created_by_name || '—'}</span></div>
              </>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}