import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Plus, Trash2, Download, QrCode, Eye, Package, ScanLine, Search, Factory, History, X, Edit3, Boxes, CheckCircle2, AlertCircle, Link2, Unlink, Activity, ArrowDownCircle, ArrowUpCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import { toast } from 'sonner';
import { QrScannerModal } from '@/components/yarn/QrScannerModal';
import { generatePalletQrPdf } from '@/lib/yarnStockPdf';
import { logYarnMovement, generatePalletCode, generateUniquePalletCode } from '@/lib/yarnStockAudit';

type YarnType = { id: string; name: string };
type YarnClient = { id: string; name: string };
type Machine = { id: string; name: string };
type Pallet = {
  id: string; code: string; yarn_type_id: string | null; yarn_type_name: string | null;
  client_id: string | null; client_name: string | null; supplier_name: string | null;
  invoice_number: string | null; entry_id: string | null;
  total_boxes: number; remaining_boxes: number; status: string;
  current_machine_id: string | null; notes: string | null;
  created_by_name: string | null; created_by_code: string | null; created_at: string;
};
type YarnEntry = {
  id: string; company_id: string;
  client_id: string | null; client_name: string | null;
  yarn_type_name: string; supplier_name: string | null; invoice_number: string | null;
  created_at: string; created_by_name: string | null; created_by_code: string | null;
};
type Movement = {
  id: string; pallet_id: string; type: string; boxes: number; machine_name: string | null;
  notes: string | null; user_name: string | null; user_code: string | null; user_role: string | null; created_at: string;
};
type MachineCurrent = { machine_id: string; yarn_type_id: string | null; yarn_type_name: string | null; client_id: string | null; client_name: string | null; set_by_name: string | null; updated_at: string };

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch { return iso; }
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  available: { label: 'Disponível', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  in_machine: { label: 'Em Máquina', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  empty: { label: 'Vazio', className: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-400' },
};
const TYPE_LABEL: Record<string, string> = {
  entry: 'Entrada',
  exit: 'Baixa (saída)',
  assign_machine: 'Vinculado à máquina',
  unassign_machine: 'Desvinculado da máquina',
};

export default function StockYarnPage() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const { userTrackingInfo } = useAuditLog();
  const [searchParams, setSearchParams] = useSearchParams();

  const canEntry = role === 'admin' || role === 'expedicao_fio';

  const [yarnTypes, setYarnTypes] = useState<YarnType[]>([]);
  const [clients, setClients] = useState<YarnClient[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [machineCurrent, setMachineCurrent] = useState<MachineCurrent[]>([]);
  const [search, setSearch] = useState('');

  const [entryOpen, setEntryOpen] = useState(false);
  const [entries, setEntries] = useState<YarnEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [palletViewId, setPalletViewId] = useState<string | null>(null);
  const [palletViewError, setPalletViewError] = useState<string | null>(null);
  const [tab, setTab] = useState('paletes');

  // Open scanner if URL has ?scan=1 (mobile FAB)
  useEffect(() => {
    if (searchParams.get('scan') === '1') {
      setScanOpen(true);
      searchParams.delete('scan');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadAll = async () => {
    if (!user?.company_id) return;
    const cid = user.company_id;
    const [yt, cl, mc, pl, mv, mcur, ent] = await Promise.all([
      (supabase.from as any)('yarn_stock_types').select('*').eq('company_id', cid).order('name'),
      (supabase.from as any)('clients').select('id,name').eq('company_id', cid).order('name'),
      (supabase.from as any)('machines').select('id,name').eq('company_id', cid).order('name'),
      (supabase.from as any)('yarn_stock_pallets').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      (supabase.from as any)('yarn_stock_movements').select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(500),
      (supabase.from as any)('yarn_stock_machine_current').select('*').eq('company_id', cid),
      (supabase.from as any)('yarn_stock_entries').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
    ]);
    setYarnTypes(yt.data || []);
    setClients(cl.data || []);
    setMachines(mc.data || []);
    setPallets(pl.data || []);
    setMovements(mv.data || []);
    setMachineCurrent(mcur.data || []);
    setEntries(ent.data || []);
  };

  useEffect(() => { loadAll(); }, [user?.company_id]);

  // Realtime: refresh on any change in yarn stock tables
  useEffect(() => {
    if (!user?.company_id) return;
    const cid = user.company_id;
    const channel = supabase
      .channel(`yarn-stock-${cid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yarn_stock_pallets', filter: `company_id=eq.${cid}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yarn_stock_movements', filter: `company_id=eq.${cid}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yarn_stock_machine_current', filter: `company_id=eq.${cid}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yarn_stock_entries', filter: `company_id=eq.${cid}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.company_id]);

  const filteredPallets = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return pallets;
    return pallets.filter(p =>
      p.code.toLowerCase().includes(s) ||
      (p.client_name || '').toLowerCase().includes(s) ||
      (p.yarn_type_name || '').toLowerCase().includes(s) ||
      (p.supplier_name || '').toLowerCase().includes(s) ||
      (p.invoice_number || '').toLowerCase().includes(s),
    );
  }, [pallets, search]);

  const palletViewing = pallets.find(p => p.id === palletViewId);
  const machineCurrentMap = useMemo(() => {
    const m = new Map<string, MachineCurrent>();
    machineCurrent.forEach(mc => m.set(mc.machine_id, mc));
    return m;
  }, [machineCurrent]);

  // ============ KPIs por aba ============
  const palletKpis = useMemo(() => {
    const totalPallets = pallets.length;
    const totalBoxes = pallets.reduce((s, p) => s + (p.total_boxes || 0), 0);
    const remainingBoxes = pallets.reduce((s, p) => s + (p.remaining_boxes || 0), 0);
    const inMachine = pallets.filter(p => p.status === 'in_machine').length;
    const empty = pallets.filter(p => p.status === 'empty').length;
    const available = pallets.filter(p => p.status === 'available').length;
    return { totalPallets, totalBoxes, remainingBoxes, inMachine, empty, available };
  }, [pallets]);

  const machineKpis = useMemo(() => {
    const total = machines.length;
    const linked = machineCurrent.length;
    const unlinked = Math.max(0, total - linked);
    const distinctYarns = new Set(machineCurrent.map(mc => `${(mc.yarn_type_name || '').trim()}__${mc.client_id || ''}`).filter(k => k !== '__')).size;
    return { total, linked, unlinked, distinctYarns };
  }, [machines, machineCurrent]);

  const auditKpis = useMemo(() => {
    const total = movements.length;
    const entries = movements.filter(m => m.type === 'entry').length;
    const exits = movements.filter(m => m.type === 'exit').length;
    const links = movements.filter(m => m.type === 'assign_machine' || m.type === 'unassign_machine').length;
    return { total, entries, exits, links };
  }, [movements]);

  // ============ SCANNER HANDLER ============
  const handleScanned = async (code: string) => {
    setScanOpen(false);
    const found = pallets.find(p => p.code === code.trim());
    if (found) {
      setPalletViewError(null);
      setPalletViewId(found.id);
      return;
    }
    // Refresh and try again (maybe added by other user)
    await loadAll();
    const found2 = (await (supabase.from as any)('yarn_stock_pallets')
      .select('*').eq('company_id', user!.company_id).eq('code', code.trim()).maybeSingle()).data as Pallet | null;
    if (found2) {
      setPalletViewError(null);
      setPalletViewId(found2.id);
    } else {
      setPalletViewError(`Palete "${code}" não encontrado.`);
      setPalletViewId('__notfound__');
    }
  };

  // ============ DELIVERY (baixa) ============
  const [exitBoxes, setExitBoxes] = useState<string>('');
  const [exitMachineId, setExitMachineId] = useState<string>('');
  const [exitAllBoxes, setExitAllBoxes] = useState(true);

  const doExit = async () => {
    if (!palletViewing) return;
    const boxesToTake = exitAllBoxes ? palletViewing.remaining_boxes : parseInt(exitBoxes, 10) || 0;
    if (boxesToTake <= 0) { toast.error('Quantidade inválida.'); return; }
    if (boxesToTake > palletViewing.remaining_boxes) { toast.error('Quantidade maior que o disponível.'); return; }

    const newRemaining = palletViewing.remaining_boxes - boxesToTake;
    const targetMachineId = exitMachineId || palletViewing.current_machine_id || null;
    const newStatus = newRemaining <= 0 ? 'empty' : (targetMachineId ? 'in_machine' : palletViewing.status);
    const machine = machines.find(m => m.id === (targetMachineId || ''));

    const { error } = await (supabase.from as any)('yarn_stock_pallets')
      .update({
        remaining_boxes: newRemaining,
        status: newStatus,
        current_machine_id: newRemaining <= 0 ? null : targetMachineId,
      })
      .eq('id', palletViewing.id);
    if (error) { toast.error('Erro ao dar baixa: ' + error.message); return; }

    await logYarnMovement(
      { companyId: user!.company_id, userId: user!.id, userName: userTrackingInfo.created_by_name, userCode: userTrackingInfo.created_by_code, userRole: role },
      {
        pallet_id: palletViewing.id,
        pallet_code: palletViewing.code,
        type: 'exit',
        boxes: boxesToTake,
        machine_id: targetMachineId,
        machine_name: machine?.name || null,
        notes: exitAllBoxes ? 'Baixa total do palete' : `Baixa parcial de ${boxesToTake} caixas`,
      },
    );

    toast.success(`${boxesToTake} caixa(s) baixada(s).`);
    setExitBoxes('');
    setExitMachineId('');
    setExitAllBoxes(true);
    setPalletViewId(null);
    await loadAll();
  };

  // ============ ASSIGN YARN TO MACHINE ============
  const setMachineYarn = async (
    machineId: string,
    yarnTypeName: string | null,
    clientId: string | null,
    clientName: string | null,
  ) => {
    const machine = machines.find(m => m.id === machineId);
    if (!yarnTypeName && !clientId) {
      const { error: delErr } = await (supabase.from as any)('yarn_stock_machine_current')
        .delete().eq('machine_id', machineId).eq('company_id', user!.company_id);
      if (delErr) { toast.error('Erro ao limpar: ' + delErr.message); return; }
      try {
        await (supabase.from as any)('audit_logs').insert({
          company_id: user!.company_id, user_id: user!.id,
          user_name: userTrackingInfo.created_by_name, user_role: role, user_code: userTrackingInfo.created_by_code,
          action: 'yarn_machine_clear_current',
          details: { machine_id: machineId, machine_name: machine?.name },
        });
      } catch {}
      toast.success('Vínculo da máquina removido.');
      await loadAll();
      return;
    }
    const payload = {
      company_id: user!.company_id,
      machine_id: machineId,
      yarn_type_id: null,
      yarn_type_name: yarnTypeName,
      client_id: clientId,
      client_name: clientName,
      set_by_name: userTrackingInfo.created_by_name,
      set_by_code: userTrackingInfo.created_by_code,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase.from as any)('yarn_stock_machine_current')
      .upsert(payload, { onConflict: 'machine_id' });
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    try {
      await (supabase.from as any)('audit_logs').insert({
        company_id: user!.company_id, user_id: user!.id,
        user_name: userTrackingInfo.created_by_name, user_role: role, user_code: userTrackingInfo.created_by_code,
        action: 'yarn_machine_set_current',
        details: { machine_id: machineId, machine_name: machine?.name, yarn_type_name: yarnTypeName, client_name: clientName },
      });
    } catch {}
    toast.success('Vínculo da máquina atualizado.');
    await loadAll();
  };

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-4 pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            {tab === 'maquinas' ? 'Fios por Máquina' : tab === 'auditoria' ? 'Auditoria de Movimentações' : 'Estoque Fio'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'maquinas'
              ? 'Vínculo do fio em uso em cada máquina e paletes na linha de produção.'
              : tab === 'auditoria'
              ? 'Histórico detalhado de entradas, baixas e vínculos por usuário.'
              : 'Controle de paletes de fio por entrada, leitura de QR Code e baixa por máquina.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setScanOpen(true)}>
            <ScanLine className="h-4 w-4 mr-2" /> Ler QR
          </Button>
          {canEntry && (
            <Button onClick={() => setEntryOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nova Entrada
            </Button>
          )}
        </div>
      </div>

      {/* ============ KPI CARDS POR ABA ============ */}
      {tab === 'paletes' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Paletes totais</div>
            <p className="text-xl font-bold text-foreground">{formatNumber(palletKpis.totalPallets)}</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(palletKpis.totalBoxes)} caixas no total</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Boxes className="h-3.5 w-3.5" />Caixas em estoque</div>
            <p className="text-xl font-bold text-success">{formatNumber(palletKpis.remainingBoxes)}</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(palletKpis.available)} paletes disponíveis</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Factory className="h-3.5 w-3.5" />Em máquina</div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatNumber(palletKpis.inMachine)}</p>
            <p className="text-[10px] text-muted-foreground">paletes em produção</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertCircle className="h-3.5 w-3.5" />Vazios</div>
            <p className={cn('text-xl font-bold', palletKpis.empty > 0 ? 'text-muted-foreground' : 'text-foreground')}>{formatNumber(palletKpis.empty)}</p>
            <p className="text-[10px] text-muted-foreground">paletes esgotados</p>
          </CardContent></Card>
        </div>
      )}

      {tab === 'maquinas' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Factory className="h-3.5 w-3.5" />Máquinas totais</div>
            <p className="text-xl font-bold text-foreground">{formatNumber(machineKpis.total)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Link2 className="h-3.5 w-3.5" />Com fio vinculado</div>
            <p className="text-xl font-bold text-success">{formatNumber(machineKpis.linked)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Unlink className="h-3.5 w-3.5" />Sem vínculo</div>
            <p className={cn('text-xl font-bold', machineKpis.unlinked > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{formatNumber(machineKpis.unlinked)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Boxes className="h-3.5 w-3.5" />Fios distintos</div>
            <p className="text-xl font-bold text-foreground">{formatNumber(machineKpis.distinctYarns)}</p>
            <p className="text-[10px] text-muted-foreground">combinações fio (cliente) em uso</p>
          </CardContent></Card>
        </div>
      )}

      {tab === 'auditoria' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Activity className="h-3.5 w-3.5" />Movimentos exibidos</div>
            <p className="text-xl font-bold text-foreground">{formatNumber(auditKpis.total)}</p>
            <p className="text-[10px] text-muted-foreground">últimos 500 registros</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ArrowDownCircle className="h-3.5 w-3.5" />Entradas</div>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(auditKpis.entries)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ArrowUpCircle className="h-3.5 w-3.5" />Baixas (saída)</div>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatNumber(auditKpis.exits)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Link2 className="h-3.5 w-3.5" />Vínculos máquina</div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatNumber(auditKpis.links)}</p>
            <p className="text-[10px] text-muted-foreground">atribuir/desvincular</p>
          </CardContent></Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full md:w-auto">
          <TabsTrigger value="paletes">Paletes</TabsTrigger>
          <TabsTrigger value="maquinas">Máquinas</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        {/* ============ PALETES ============ */}
        <TabsContent value="paletes" className="space-y-3 mt-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código, cliente, fio, fornecedor..." className="pl-9" />
          </div>

          <PalletsGrouped
            pallets={filteredPallets}
            entries={entries}
            machines={machines}
            machineCurrent={machineCurrent}
            companyId={user!.company_id}
            canEdit={canEntry}
            onEditEntry={(entryId) => { setEditingEntryId(entryId); setEntryOpen(true); }}
            onOpenPallet={(id) => { setPalletViewError(null); setPalletViewId(id); }}
          />
        </TabsContent>

        {/* ============ MÁQUINAS ============ */}
        <TabsContent value="maquinas" className="space-y-3 mt-3">
          <Card className="overflow-x-auto">
            {(() => null)()}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MÁQUINA</TableHead>
                  <TableHead className="min-w-[280px]">FIO ATUAL (CLIENTE)</TableHead>
                  <TableHead>PALETES NA MÁQUINA</TableHead>
                  <TableHead>ATUALIZADO</TableHead>
                  <TableHead className="text-right">AÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => null)()}
                {machines.map(m => {
                  const cur = machineCurrentMap.get(m.id);
                  const palletsOnMachine = pallets.filter(p => p.current_machine_id === m.id);
                  // Build option list from entries + pallets (distinct yarn+client combos)
                  const combos = new Map<string, { value: string; label: string; yarnTypeName: string; clientId: string | null; clientName: string | null }>();
                  const add = (yarnTypeName?: string | null, clientId?: string | null, clientName?: string | null) => {
                    const yn = (yarnTypeName || '').trim();
                    if (!yn) return;
                    const cid = clientId || '';
                    const key = `${yn}__${cid}`;
                    if (combos.has(key)) return;
                    const label = `${yn}${clientName ? ` (${clientName})` : ''}`;
                    combos.set(key, { value: key, label, yarnTypeName: yn, clientId: clientId || null, clientName: clientName || null });
                  };
                  entries.forEach(e => add(e.yarn_type_name, e.client_id, e.client_name));
                  pallets.forEach(p => add(p.yarn_type_name, p.client_id, p.client_name));
                  const options = Array.from(combos.values()).sort((a, b) => a.label.localeCompare(b.label));
                  const currentKey = cur ? `${(cur.yarn_type_name || '').trim()}__${cur.client_id || ''}` : '';
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-semibold">{m.name}</TableCell>
                      <TableCell>
                        <SearchableSelect
                          value={currentKey}
                          onValueChange={(v) => {
                            if (!v) { setMachineYarn(m.id, null, null, null); return; }
                            const opt = combos.get(v);
                            if (!opt) return;
                            setMachineYarn(m.id, opt.yarnTypeName, opt.clientId, opt.clientName);
                          }}
                          options={[{ value: '', label: '— Nenhum —' }, ...options]}
                          placeholder={options.length ? 'Buscar fio (cliente)...' : 'Cadastre uma entrada primeiro'}
                          disabled={!canEntry && role !== 'lider'}
                        />
                      </TableCell>
                      <TableCell>
                        {palletsOnMachine.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nenhum</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {palletsOnMachine.map(p => (
                              <Badge key={p.id} variant="secondary" className="font-mono text-[10px]">
                                {p.code} · {p.remaining_boxes}cx
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {cur ? (
                          <>
                            <div>{formatDateTime(cur.updated_at)}</div>
                            <div className="text-[10px] text-muted-foreground">{cur.set_by_name || ''}</div>
                          </>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {cur && (
                          <Button size="sm" variant="ghost" onClick={() => setMachineYarn(m.id, null, null, null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ============ AUDITORIA ============ */}
        <TabsContent value="auditoria" className="space-y-3 mt-3">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATA/HORA</TableHead>
                  <TableHead>MOVIMENTO</TableHead>
                  <TableHead>PALETE</TableHead>
                  <TableHead>FIO</TableHead>
                  <TableHead>CLIENTE</TableHead>
                  <TableHead className="text-center">CAIXAS</TableHead>
                  <TableHead>MÁQUINA</TableHead>
                  <TableHead>USUÁRIO</TableHead>
                  <TableHead>OBS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Nenhum movimento registrado.
                  </TableCell></TableRow>
                )}
                {movements.map(mv => {
                  const p = pallets.find(x => x.id === mv.pallet_id);
                  return (
                    <TableRow key={mv.id}>
                      <TableCell className="text-xs">{formatDateTime(mv.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[mv.type] || mv.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p?.code || '—'}</TableCell>
                      <TableCell className="text-xs">{p?.yarn_type_name || '—'}</TableCell>
                      <TableCell className="text-xs">{p?.client_name || '—'}</TableCell>
                      <TableCell className="text-center font-semibold">{mv.boxes || '—'}</TableCell>
                      <TableCell className="text-xs">{mv.machine_name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {mv.user_name ? `${mv.user_name} #${mv.user_code || '-'}` : '—'}
                        <div className="text-[10px] text-muted-foreground">{mv.user_role || ''}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{mv.notes || ''}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ MODAL NOVA ENTRADA ============ */}
      {entryOpen && (
        <NewEntryModal
          open={entryOpen}
          onClose={() => { setEntryOpen(false); setEditingEntryId(null); }}
          yarnTypes={yarnTypes}
          clients={clients}
          existingPalletCodes={pallets.map(p => p.code)}
          editingEntry={editingEntryId ? entries.find(e => e.id === editingEntryId) || null : null}
          editingPallets={editingEntryId ? pallets.filter(p => p.entry_id === editingEntryId) : []}
          companyId={user!.company_id}
          userId={user!.id}
          userInfo={{ name: userTrackingInfo.created_by_name, code: userTrackingInfo.created_by_code, role }}
          onSaved={async () => { await loadAll(); }}
          onCloseAfterSave={() => { setEntryOpen(false); setEditingEntryId(null); }}
          onYarnTypeCreated={loadAll}
          onClientCreated={loadAll}
        />
      )}

      {/* ============ MODAL VIEW PALLET (scan/eye) ============ */}
      <Dialog open={!!palletViewId} onOpenChange={(o) => { if (!o) { setPalletViewId(null); setPalletViewError(null); } }}>
        <DialogContent className="max-w-lg w-[95vw]">
          {palletViewError ? (
            <>
              <DialogHeader>
                <DialogTitle>Palete não encontrado</DialogTitle>
                <DialogDescription>{palletViewError}</DialogDescription>
              </DialogHeader>
            </>
          ) : palletViewing ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Palete <span className="font-mono">{palletViewing.code}</span>
                </DialogTitle>
                <DialogDescription>
                  {palletViewing.yarn_type_name || '—'} · {palletViewing.client_name || '—'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Fornecedor:</span> {palletViewing.supplier_name || '—'}</div>
                <div><span className="text-muted-foreground">Status:</span> {STATUS_BADGE[palletViewing.status]?.label}</div>
                <div><span className="text-muted-foreground">Caixas disponíveis:</span> <strong>{palletViewing.remaining_boxes}</strong> / {palletViewing.total_boxes}</div>
                <div><span className="text-muted-foreground">Máquina atual:</span> {machines.find(m => m.id === palletViewing.current_machine_id)?.name || '—'}</div>
              </div>

              {palletViewing.remaining_boxes > 0 ? (
                <div className="border-t pt-3 space-y-3">
                  <h4 className="font-semibold flex items-center gap-2"><Factory className="h-4 w-4" /> Dar baixa para máquina</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Máquina</Label>
                      <SearchableSelect
                        value={exitMachineId}
                        onValueChange={setExitMachineId}
                        options={[{ value: '', label: '— Sem vincular —' }, ...machines.map(m => ({ value: m.id, label: m.name }))]}
                        placeholder="Selecionar máquina"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Quantidade</Label>
                      <div className="flex gap-2 items-center">
                        <Button type="button" size="sm" variant={exitAllBoxes ? 'default' : 'outline'} onClick={() => setExitAllBoxes(true)}>
                          Todas ({palletViewing.remaining_boxes})
                        </Button>
                        <Button type="button" size="sm" variant={!exitAllBoxes ? 'default' : 'outline'} onClick={() => setExitAllBoxes(false)}>
                          Parcial
                        </Button>
                        {!exitAllBoxes && (
                          <Input type="number" inputMode="numeric" min={1} max={palletViewing.remaining_boxes}
                            value={exitBoxes} onChange={(e) => setExitBoxes(e.target.value)}
                            className="w-20" placeholder="Cx." />
                        )}
                      </div>
                    </div>
                  </div>
                  <Button onClick={doExit} className="w-full">
                    Confirmar baixa
                  </Button>
                </div>
              ) : (
                <div className="border-t pt-3 text-sm text-muted-foreground">Palete vazio — sem caixas para baixa.</div>
              )}

              {/* Histórico do palete */}
              <div className="border-t pt-3">
                <h4 className="font-semibold flex items-center gap-2 mb-2"><History className="h-4 w-4" /> Histórico</h4>
                <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                  {movements.filter(m => m.pallet_id === palletViewing.id).map(m => (
                    <div key={m.id} className="flex justify-between border-b py-1">
                      <span>{formatDateTime(m.created_at)} · {TYPE_LABEL[m.type] || m.type}{m.boxes ? ` (${m.boxes}cx)` : ''}</span>
                      <span className="text-muted-foreground">{m.user_name ? `${m.user_name}` : ''}</span>
                    </div>
                  ))}
                  {movements.filter(m => m.pallet_id === palletViewing.id).length === 0 && (
                    <div className="text-muted-foreground">Sem movimentos.</div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => generatePalletQrPdf(palletViewing, user!.company_id)}>
                  <Download className="h-4 w-4 mr-2" /> QR PDF
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <QrScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanned} />
    </div>
  );
}

// ================ NEW ENTRY MODAL ================

// ================ PALLETS GROUPED BY CLIENT > NF ================
function PalletsGrouped({ pallets, entries = [], machines, machineCurrent = [], companyId, canEdit, onEditEntry, onOpenPallet }: { pallets: any[]; entries?: any[]; machines: Machine[]; machineCurrent?: MachineCurrent[]; companyId: string; canEdit: boolean; onEditEntry: (entryId: string) => void; onOpenPallet: (id: string) => void; }) {
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});
  const [openNfs, setOpenNfs] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const byClient = new Map<string, { name: string; nfs: Map<string, { invoice: string; entryId: string | null; yarnNames: Set<string>; supplierNames: Set<string>; items: any[] }> }>();
    // First: seed groups from ENTRIES (NF headers), so entries without pallets still show up
    for (const e of entries) {
      const ck = e.client_id || `__noclient__::${e.client_name || '—'}`;
      const cname = e.client_name || 'Sem cliente';
      if (!byClient.has(ck)) byClient.set(ck, { name: cname, nfs: new Map() });
      const entry = byClient.get(ck)!;
      const groupKey = e.id;
      if (!entry.nfs.has(groupKey)) entry.nfs.set(groupKey, {
        invoice: (e.invoice_number || '').trim(),
        entryId: e.id,
        yarnNames: new Set(), supplierNames: new Set(), items: [],
      });
      const nfEntry = entry.nfs.get(groupKey)!;
      if (e.yarn_type_name) nfEntry.yarnNames.add(e.yarn_type_name);
      if (e.supplier_name) nfEntry.supplierNames.add(e.supplier_name);
    }
    for (const p of pallets) {
      const ck = p.client_id || `__noclient__::${p.client_name || '—'}`;
      const cname = p.client_name || 'Sem cliente';
      if (!byClient.has(ck)) byClient.set(ck, { name: cname, nfs: new Map() });
      const entry = byClient.get(ck)!;
      // Group preferably by entry_id; fallback to invoice_number; fallback to standalone
      const groupKey = p.entry_id || ((p.invoice_number || '').trim() ? `nf::${(p.invoice_number || '').trim()}` : `__semnf__::${p.id}`);
      if (!entry.nfs.has(groupKey)) entry.nfs.set(groupKey, {
        invoice: (p.invoice_number || '').trim(),
        entryId: p.entry_id || null,
        yarnNames: new Set(), supplierNames: new Set(), items: [],
      });
      const nfEntry = entry.nfs.get(groupKey)!;
      if (p.yarn_type_name) nfEntry.yarnNames.add(p.yarn_type_name);
      if (p.supplier_name) nfEntry.supplierNames.add(p.supplier_name);
      nfEntry.items.push(p);
    }
    return Array.from(byClient.entries()).map(([ck, v]) => ({
      key: ck, name: v.name,
      nfs: Array.from(v.nfs.entries()).map(([nfk, nv]) => ({ key: nfk, ...nv })),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pallets, entries]);

  if (pallets.length === 0 && entries.length === 0) {
    return <Card className="p-6 text-center text-muted-foreground">Nenhum palete cadastrado.</Card>;
  }

  return (
    <div className="space-y-3">
      {grouped.map(client => {
        const cOpen = openClients[client.key] !== false; // default open
        const totalPallets = client.nfs.reduce((s, n) => s + n.items.length, 0);
        const totalBoxes = client.nfs.reduce((s, n) => s + n.items.reduce((ss: number, it: any) => ss + (it.remaining_boxes || 0), 0), 0);
        const totalCapacity = client.nfs.reduce((s, n) => s + n.items.reduce((ss: number, it: any) => ss + (it.total_boxes || 0), 0), 0);
        return (
          <Collapsible
            key={client.key}
            open={cOpen}
            onOpenChange={(v) => setOpenClients(s => ({ ...s, [client.key]: v }))}
          >
            <Card>
              <CollapsibleTrigger className="w-full group" asChild>
                <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 shrink-0" />
                    <Factory className="h-4 w-4 text-primary shrink-0" />
                    <CardTitle className="text-sm font-semibold truncate">{client.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span>NFs: <span className="font-semibold text-foreground">{client.nfs.length}</span></span>
                    <span>Paletes: <span className="font-semibold text-foreground">{totalPallets}</span></span>
                    <span>Caixas: <span className="font-semibold text-success">{totalBoxes}</span><span className="opacity-60"> / {totalCapacity}</span></span>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-0 divide-y border-t">
                {client.nfs.map(nf => {
                  const nfKey = `${client.key}::${nf.key}`;
                  const nOpen = openNfs[nfKey] !== false;
                  const nfBoxes = nf.items.reduce((s: number, it: any) => s + (it.remaining_boxes || 0), 0);
                  const nfTotalBoxes = nf.items.reduce((s: number, it: any) => s + (it.total_boxes || 0), 0);
                  const consumedPct = nfTotalBoxes > 0 ? Math.round(((nfTotalBoxes - nfBoxes) / nfTotalBoxes) * 100) : 0;
                  const yarnList = Array.from(nf.yarnNames).join(', ') || '—';
                  const supplierList = Array.from(nf.supplierNames).join(', ');
                  return (
                    <div key={nfKey}>
                      {/* NF HEADER — clean two-line layout */}
                      <div className="w-full px-3 sm:px-4 py-3 hover:bg-muted/30 transition">
                        <div className="flex items-start gap-2 sm:gap-3">
                          <button
                            type="button"
                            onClick={() => setOpenNfs(s => ({ ...s, [nfKey]: !nOpen }))}
                            className="flex-1 text-left min-w-0"
                          >
                            {/* Line 1: NF# + badges */}
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">NF</span>
                              <span className="font-mono font-bold text-base">{nf.invoice || '—'}</span>
                              <Badge variant="secondary" className="text-[10px]">{nf.items.length} palete{nf.items.length !== 1 ? 's' : ''}</Badge>
                              <Badge variant="outline" className="text-[10px] font-mono">{nfBoxes}/{nfTotalBoxes} cx</Badge>
                            </div>
                            {/* Line 2: Fio + Fornecedor (truncated) */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <span className="font-semibold text-foreground/70">Fio:</span>
                                <span className="truncate max-w-[200px] sm:max-w-none">{yarnList}</span>
                              </span>
                              {supplierList && (
                                <span className="inline-flex items-center gap-1 min-w-0">
                                  <span className="font-semibold text-foreground/70">Fornecedor:</span>
                                  <span className="truncate max-w-[180px] sm:max-w-none">{supplierList}</span>
                                </span>
                              )}
                            </div>
                            {/* Progress bar (consumption) */}
                            {nfTotalBoxes > 0 && (
                              <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden max-w-md">
                                <div
                                  className="h-full bg-primary/70 transition-all"
                                  style={{ width: `${consumedPct}%` }}
                                  title={`${consumedPct}% consumido`}
                                />
                              </div>
                            )}
                          </button>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {canEdit && nf.entryId && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onEditEntry(nf.entryId!); }}>
                                <Edit3 className="h-3 w-3 sm:mr-1" />
                                <span className="hidden sm:inline">Editar</span>
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => setOpenNfs(s => ({ ...s, [nfKey]: !nOpen }))}
                              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground px-1"
                            >
                              {nOpen ? '− Recolher' : '+ Abrir'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {nOpen && (
                        <div className="bg-muted/10 border-t">
                          {nf.items.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              Nenhum palete nesta NF. Use "Editar" para adicionar.
                            </div>
                          ) : (
                            <>
                              {/* DESKTOP TABLE */}
                              <div className="hidden md:block">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[110px]">CÓDIGO</TableHead>
                                      <TableHead className="w-[180px]">CAIXAS</TableHead>
                                      <TableHead className="w-[130px]">STATUS</TableHead>
                                      <TableHead>MÁQUINA</TableHead>
                                      <TableHead className="w-[160px]">ENTRADA</TableHead>
                                      <TableHead className="text-right w-[100px]">AÇÕES</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {nf.items.map((p: any) => {
                                      const st = STATUS_BADGE[p.status] || STATUS_BADGE.available;
                                      const norm = (s: any) => (s || '').toString().trim().toLowerCase();
                                      const assigned = machineCurrent.find(mc =>
                                        norm(mc.yarn_type_name) === norm(p.yarn_type_name) &&
                                        (mc.client_id || null) === (p.client_id || null)
                                      );
                                      const machine = (assigned && machines.find(m => m.id === assigned.machine_id))
                                        || machines.find(m => m.id === p.current_machine_id);
                                      const pct = p.total_boxes > 0 ? Math.round((p.remaining_boxes / p.total_boxes) * 100) : 0;
                                      return (
                                        <TableRow key={p.id}>
                                          <TableCell>
                                            <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded">{p.code}</span>
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex items-center gap-2">
                                              <span className="font-semibold tabular-nums">{p.remaining_boxes}</span>
                                              <span className="text-xs text-muted-foreground tabular-nums">/ {p.total_boxes}</span>
                                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
                                                <div className="h-full bg-emerald-500/80" style={{ width: `${pct}%` }} />
                                              </div>
                                            </div>
                                          </TableCell>
                                          <TableCell><Badge className={st.className} variant="secondary">{st.label}</Badge></TableCell>
                                          <TableCell className="text-sm">{machine?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                                          <TableCell className="text-xs">
                                            <div>{formatDateTime(p.created_at)}</div>
                                            <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                              {p.created_by_name ? `${p.created_by_name} #${p.created_by_code || '-'}` : ''}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                              <Button size="icon" variant="ghost" title="Ver / Baixa" onClick={() => onOpenPallet(p.id)}>
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                              <Button size="icon" variant="ghost" title="Baixar QR (PDF)" onClick={() => generatePalletQrPdf(p, companyId)}>
                                                <Download className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>

                              {/* MOBILE CARDS */}
                              <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                                {nf.items.map((p: any) => {
                                  const st = STATUS_BADGE[p.status] || STATUS_BADGE.available;
                                  const norm = (s: any) => (s || '').toString().trim().toLowerCase();
                                  const assigned = machineCurrent.find(mc =>
                                    norm(mc.yarn_type_name) === norm(p.yarn_type_name) &&
                                    (mc.client_id || null) === (p.client_id || null)
                                  );
                                  const machine = (assigned && machines.find(m => m.id === assigned.machine_id))
                                    || machines.find(m => m.id === p.current_machine_id);
                                  const pct = p.total_boxes > 0 ? Math.round((p.remaining_boxes / p.total_boxes) * 100) : 0;
                                  return (
                                    <Card key={p.id} className="p-3 bg-card shadow-sm">
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <span className="font-mono font-bold text-sm bg-muted px-2 py-1 rounded">{p.code}</span>
                                        <Badge className={st.className} variant="secondary">{st.label}</Badge>
                                      </div>
                                      <div className="space-y-1.5 text-xs">
                                        <div>
                                          <div className="flex justify-between mb-0.5">
                                            <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Caixas</span>
                                            <span className="font-semibold tabular-nums">{p.remaining_boxes} / {p.total_boxes}</span>
                                          </div>
                                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500/80" style={{ width: `${pct}%` }} />
                                          </div>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Máquina</span>
                                          <span className="font-medium truncate max-w-[140px]">{machine?.name || '—'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Entrada</span>
                                          <span>{formatDateTime(p.created_at)}</span>
                                        </div>
                                      </div>
                                      <div className="flex gap-1 mt-3 pt-2 border-t">
                                        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => onOpenPallet(p.id)}>
                                          <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                                        </Button>
                                        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => generatePalletQrPdf(p, companyId)}>
                                          <Download className="h-3.5 w-3.5 mr-1" /> QR
                                        </Button>
                                      </div>
                                    </Card>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

interface NewEntryProps {
  open: boolean; onClose: () => void;
  yarnTypes: YarnType[]; clients: YarnClient[];
  existingPalletCodes: string[];
  editingEntry: YarnEntry | null;
  editingPallets: Pallet[];
  companyId: string; userId: string;
  userInfo: { name: string | null; code: string | null; role: string };
  onSaved: () => void;
  onCloseAfterSave: () => void;
  onYarnTypeCreated: () => void;
  onClientCreated: () => void;
}
function NewEntryModal({
  open, onClose, clients, existingPalletCodes, editingEntry, editingPallets,
  companyId, userId, userInfo, onSaved, onCloseAfterSave,
}: NewEntryProps) {
  // Header state
  const [entryId, setEntryId] = useState<string | null>(editingEntry?.id || null);
  const [yarnTypeName, setYarnTypeName] = useState(editingEntry?.yarn_type_name || '');
  const [clientId, setClientId] = useState(editingEntry?.client_id || '');
  const [supplier, setSupplier] = useState(editingEntry?.supplier_name || '');
  const [invoiceNumber, setInvoiceNumber] = useState(editingEntry?.invoice_number || '');
  const [savingHeader, setSavingHeader] = useState(false);

  // Pallet form state (one at a time)
  const [palletBoxes, setPalletBoxes] = useState('');
  const [palletNotes, setPalletNotes] = useState('');
  const [savingPallet, setSavingPallet] = useState(false);
  const [autoCode, setAutoCode] = useState<string>('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; code: string } | null>(null);

  // Generate an auto-code once when header is saved.
  // Subsequent codes are regenerated inside addPallet, so we avoid flicker on realtime refreshes.
  useEffect(() => {
    if (entryId && !autoCode) {
      const used = new Set(existingPalletCodes);
      setAutoCode(generateUniquePalletCode(used));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const headerLocked = !!entryId;

  const saveHeader = async () => {
    if (!clientId) { toast.error('Selecione o cliente.'); return; }
    if (!yarnTypeName.trim()) { toast.error('Informe o tipo de fio.'); return; }
    setSavingHeader(true);
    const cl = clients.find(c => c.id === clientId);
    const payload: any = {
      company_id: companyId,
      client_id: clientId,
      client_name: cl?.name || null,
      yarn_type_name: yarnTypeName.trim(),
      supplier_name: supplier.trim() || null,
      invoice_number: invoiceNumber.trim() || null,
      created_by_name: userInfo.name,
      created_by_code: userInfo.code,
    };
    const { data, error } = await (supabase.from as any)('yarn_stock_entries')
      .insert(payload).select().single();
    setSavingHeader(false);
    if (error) { toast.error('Erro ao salvar cabeçalho: ' + error.message); return; }
    setEntryId(data.id);
    toast.success('Cabeçalho salvo. Agora adicione os paletes.');
    onSaved();
  };

  const updateHeader = async () => {
    if (!entryId) return;
    const cl = clients.find(c => c.id === clientId);
    const { error } = await (supabase.from as any)('yarn_stock_entries')
      .update({
        client_id: clientId,
        client_name: cl?.name || null,
        yarn_type_name: yarnTypeName.trim(),
        supplier_name: supplier.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
      })
      .eq('id', entryId);
    if (error) { toast.error('Erro ao atualizar: ' + error.message); return; }
    // Propagate to existing pallets
    await (supabase.from as any)('yarn_stock_pallets')
      .update({
        client_id: clientId,
        client_name: cl?.name || null,
        yarn_type_name: yarnTypeName.trim(),
        supplier_name: supplier.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
      })
      .eq('entry_id', entryId);
    toast.success('Dados da entrada atualizados.');
    onSaved();
  };

  const addPallet = async () => {
    if (!entryId) { toast.error('Salve o cabeçalho primeiro.'); return; }
    const boxes = parseInt(palletBoxes, 10);
    if (!boxes || boxes <= 0) { toast.error('Informe a quantidade de caixas.'); return; }
    if (!autoCode) { toast.error('Gerando código...'); return; }
    setSavingPallet(true);
    const cl = clients.find(c => c.id === clientId);
    const row = {
      company_id: companyId,
      entry_id: entryId,
      code: autoCode,
      yarn_type_id: null,
      yarn_type_name: yarnTypeName.trim(),
      client_id: clientId,
      client_name: cl?.name || null,
      supplier_name: supplier.trim() || null,
      invoice_number: invoiceNumber.trim() || null,
      total_boxes: boxes,
      remaining_boxes: boxes,
      status: 'available',
      notes: palletNotes.trim() || null,
      created_by_name: userInfo.name,
      created_by_code: userInfo.code,
    };
    let { data: inserted, error } = await (supabase.from as any)('yarn_stock_pallets')
      .insert(row).select().single();
    // Retry once on unique conflict
    if (error && /yarn_stock_pallets_company_code_unique/i.test(error.message || '')) {
      row.code = generateUniquePalletCode(new Set([...existingPalletCodes, autoCode]));
      const r2 = await (supabase.from as any)('yarn_stock_pallets').insert(row).select().single();
      inserted = r2.data; error = r2.error;
    }
    if (error) { toast.error('Erro: ' + error.message); setSavingPallet(false); return; }
    await logYarnMovement(
      { companyId, userId, userName: userInfo.name, userCode: userInfo.code, userRole: userInfo.role },
      { pallet_id: inserted.id, pallet_code: inserted.code, type: 'entry', boxes: inserted.total_boxes,
        notes: `Entrada de ${inserted.total_boxes} caixas` },
    );
    toast.success(`Palete ${inserted.code} adicionado (${boxes} cx).`);
    setPalletBoxes('');
    setPalletNotes('');
    setAutoCode(generateUniquePalletCode(new Set([...existingPalletCodes, inserted.code])));
    setSavingPallet(false);
    onSaved();
  };

  const removePallet = async (id: string) => {
    const { error } = await (supabase.from as any)('yarn_stock_pallets').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Palete removido.');
    onSaved();
  };

  const entryPallets = editingPallets;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> {editingEntry ? 'Editar Entrada de Fio' : 'Nova Entrada de Fio'}
          </DialogTitle>
          <DialogDescription>
            {headerLocked
              ? 'Cabeçalho salvo. Adicione os paletes — cada um é salvo individualmente.'
              : 'Passo 1 — Salve os dados do fio (cliente, tipo, NF, fornecedor). Em seguida você poderá adicionar paletes.'}
          </DialogDescription>
        </DialogHeader>

        {/* ===== STEP 1: HEADER ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Cliente *</Label>
            <SearchableSelect value={clientId} onValueChange={setClientId}
              options={clients.map(c => ({ value: c.id, label: c.name }))}
              placeholder="Selecionar cliente" />
          </div>
          <div>
            <Label>Tipo de Fio *</Label>
            <Input value={yarnTypeName} onChange={(e) => setYarnTypeName(e.target.value)}
              placeholder="Ex.: Algodão 30/1 penteado" />
          </div>
          <div>
            <Label>NF</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Número da NF" />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do fornecedor" />
          </div>
        </div>

        {!headerLocked ? (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={savingHeader}>Cancelar</Button>
            <Button onClick={saveHeader} disabled={savingHeader}>
              {savingHeader ? 'Salvando...' : 'Salvar e adicionar paletes'}
            </Button>
          </DialogFooter>
        ) : (
          <>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={updateHeader}>
                <Edit3 className="h-3 w-3 mr-1" /> Atualizar cabeçalho
              </Button>
            </div>

            {/* ===== STEP 2: PALLETS ===== */}
            <div className="border-t pt-3 space-y-3">
              <h4 className="font-semibold">Adicionar palete</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-xs">Código (auto)</Label>
                  <Input value={autoCode} readOnly disabled className="font-mono uppercase text-center" />
                </div>
                <div>
                  <Label className="text-xs">Caixas *</Label>
                  <Input type="number" inputMode="numeric" min={1} value={palletBoxes}
                    onChange={(e) => setPalletBoxes(e.target.value)} placeholder="0" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Observação</Label>
                  <Input value={palletNotes} onChange={(e) => setPalletNotes(e.target.value)} />
                </div>
              </div>
              <Button onClick={addPallet} disabled={savingPallet} className="w-full">
                <Plus className="h-4 w-4 mr-1" />
                {savingPallet ? 'Salvando...' : 'Adicionar palete'}
              </Button>
            </div>

            {/* ===== LIST OF PALLETS ALREADY ADDED ===== */}
            <div className="border-t pt-3">
              <h4 className="font-semibold mb-2">Paletes desta entrada ({entryPallets.length})</h4>
              {entryPallets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum palete cadastrado ainda.</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {entryPallets.map(p => (
                    <div key={p.id} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{p.code}</span>
                        <Badge variant="secondary">{p.remaining_boxes}/{p.total_boxes} cx</Badge>
                        {p.notes && <span className="text-xs text-muted-foreground">· {p.notes}</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" title="Baixar QR (PDF)"
                          onClick={() => generatePalletQrPdf(p as any, companyId)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Remover"
                          onClick={() => setConfirmRemove({ id: p.id, code: p.code })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={onCloseAfterSave}>Concluir</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover palete?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o palete <span className="font-mono font-semibold">{confirmRemove?.code}</span>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (confirmRemove) await removePallet(confirmRemove.id);
                setConfirmRemove(null);
              }}
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}