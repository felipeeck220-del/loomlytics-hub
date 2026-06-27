import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Plus, Trash2, Download, QrCode, Eye, Package, ScanLine, Search, Factory, History, X, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { QrScannerModal } from '@/components/yarn/QrScannerModal';
import { generatePalletQrPdf } from '@/lib/yarnStockPdf';
import { logYarnMovement, generatePalletCode } from '@/lib/yarnStockAudit';

type YarnType = { id: string; name: string };
type YarnClient = { id: string; name: string };
type Machine = { id: string; name: string };
type Pallet = {
  id: string; code: string; yarn_type_id: string | null; yarn_type_name: string | null;
  client_id: string | null; client_name: string | null; supplier_name: string | null;
  total_boxes: number; remaining_boxes: number; status: string;
  current_machine_id: string | null; notes: string | null;
  created_by_name: string | null; created_by_code: string | null; created_at: string;
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
    const [yt, cl, mc, pl, mv, mcur] = await Promise.all([
      (supabase.from as any)('yarn_stock_types').select('*').eq('company_id', cid).order('name'),
      (supabase.from as any)('yarn_stock_clients').select('*').eq('company_id', cid).order('name'),
      (supabase.from as any)('machines').select('id,name').eq('company_id', cid).order('name'),
      (supabase.from as any)('yarn_stock_pallets').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      (supabase.from as any)('yarn_stock_movements').select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(500),
      (supabase.from as any)('yarn_stock_machine_current').select('*').eq('company_id', cid),
    ]);
    setYarnTypes(yt.data || []);
    setClients(cl.data || []);
    setMachines(mc.data || []);
    setPallets(pl.data || []);
    setMovements(mv.data || []);
    setMachineCurrent(mcur.data || []);
  };

  useEffect(() => { loadAll(); }, [user?.company_id]);

  const filteredPallets = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return pallets;
    return pallets.filter(p =>
      p.code.toLowerCase().includes(s) ||
      (p.client_name || '').toLowerCase().includes(s) ||
      (p.yarn_type_name || '').toLowerCase().includes(s) ||
      (p.supplier_name || '').toLowerCase().includes(s),
    );
  }, [pallets, search]);

  const palletViewing = pallets.find(p => p.id === palletViewId);
  const machineCurrentMap = useMemo(() => {
    const m = new Map<string, MachineCurrent>();
    machineCurrent.forEach(mc => m.set(mc.machine_id, mc));
    return m;
  }, [machineCurrent]);

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
    const newStatus = newRemaining <= 0 ? 'empty' : (exitMachineId ? 'in_machine' : palletViewing.status);
    const machine = machines.find(m => m.id === exitMachineId);

    const { error } = await (supabase.from as any)('yarn_stock_pallets')
      .update({
        remaining_boxes: newRemaining,
        status: newStatus,
        current_machine_id: exitMachineId || null,
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
        machine_id: exitMachineId || null,
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
  const setMachineYarn = async (machineId: string, yarnTypeId: string | null, clientId: string | null) => {
    const yt = yarnTypes.find(y => y.id === yarnTypeId);
    const cl = clients.find(c => c.id === clientId);
    const machine = machines.find(m => m.id === machineId);
    const payload = {
      company_id: user!.company_id,
      machine_id: machineId,
      yarn_type_id: yarnTypeId,
      yarn_type_name: yt?.name || null,
      client_id: clientId,
      client_name: cl?.name || null,
      set_by_name: userTrackingInfo.created_by_name,
      set_by_code: userTrackingInfo.created_by_code,
    };
    const { error } = await (supabase.from as any)('yarn_stock_machine_current')
      .upsert(payload, { onConflict: 'machine_id' });
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    try {
      await (supabase.from as any)('audit_logs').insert({
        company_id: user!.company_id, user_id: user!.id,
        user_name: userTrackingInfo.created_by_name, user_role: role, user_code: userTrackingInfo.created_by_code,
        action: 'yarn_machine_set_current',
        details: { machine_id: machineId, machine_name: machine?.name, yarn_type_name: yt?.name, client_name: cl?.name },
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
            <Package className="h-6 w-6 text-primary" /> Estoque Fio
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle de paletes de fio por entrada, leitura de QR Code e baixa por máquina.
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

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CÓDIGO</TableHead>
                  <TableHead>FIO</TableHead>
                  <TableHead>CLIENTE</TableHead>
                  <TableHead>FORNECEDOR</TableHead>
                  <TableHead className="text-center">CAIXAS</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>MÁQUINA</TableHead>
                  <TableHead>ENTRADA</TableHead>
                  <TableHead className="text-right">AÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPallets.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Nenhum palete cadastrado.
                  </TableCell></TableRow>
                )}
                {filteredPallets.map(p => {
                  const st = STATUS_BADGE[p.status] || STATUS_BADGE.available;
                  const machine = machines.find(m => m.id === p.current_machine_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell>{p.yarn_type_name || '—'}</TableCell>
                      <TableCell>{p.client_name || '—'}</TableCell>
                      <TableCell>{p.supplier_name || '—'}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold">{p.remaining_boxes}</span>
                        <span className="text-xs text-muted-foreground"> / {p.total_boxes}</span>
                      </TableCell>
                      <TableCell><Badge className={st.className} variant="secondary">{st.label}</Badge></TableCell>
                      <TableCell>{machine?.name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        <div>{formatDateTime(p.created_at)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.created_by_name ? `${p.created_by_name} #${p.created_by_code || '-'}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Ver / Baixa"
                            onClick={() => { setPalletViewError(null); setPalletViewId(p.id); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Baixar QR (PDF)"
                            onClick={() => generatePalletQrPdf(p, user!.company_id)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ============ MÁQUINAS ============ */}
        <TabsContent value="maquinas" className="space-y-3 mt-3">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MÁQUINA</TableHead>
                  <TableHead>FIO ATUAL</TableHead>
                  <TableHead>CLIENTE</TableHead>
                  <TableHead>PALETES NA MÁQUINA</TableHead>
                  <TableHead>ATUALIZADO</TableHead>
                  <TableHead className="text-right">AÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {machines.map(m => {
                  const cur = machineCurrentMap.get(m.id);
                  const palletsOnMachine = pallets.filter(p => p.current_machine_id === m.id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-semibold">{m.name}</TableCell>
                      <TableCell>
                        <SearchableSelect
                          value={cur?.yarn_type_id || ''}
                          onValueChange={(v) => setMachineYarn(m.id, v || null, cur?.client_id || null)}
                          options={[{ value: '', label: '— Nenhum —' }, ...yarnTypes.map(y => ({ value: y.id, label: y.name }))]}
                          placeholder="Selecionar fio"
                          disabled={!canEntry && role !== 'lider'}
                        />
                      </TableCell>
                      <TableCell>
                        <SearchableSelect
                          value={cur?.client_id || ''}
                          onValueChange={(v) => setMachineYarn(m.id, cur?.yarn_type_id || null, v || null)}
                          options={[{ value: '', label: '— Nenhum —' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
                          placeholder="Selecionar cliente"
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
                          <Button size="sm" variant="ghost" onClick={() => setMachineYarn(m.id, null, null)}>
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
          onClose={() => setEntryOpen(false)}
          yarnTypes={yarnTypes}
          clients={clients}
          companyId={user!.company_id}
          userId={user!.id}
          userInfo={{ name: userTrackingInfo.created_by_name, code: userTrackingInfo.created_by_code, role }}
          onCreated={async () => { await loadAll(); setEntryOpen(false); }}
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
interface NewEntryProps {
  open: boolean; onClose: () => void;
  yarnTypes: YarnType[]; clients: YarnClient[];
  companyId: string; userId: string;
  userInfo: { name: string | null; code: string | null; role: string };
  onCreated: () => void;
  onYarnTypeCreated: () => void;
  onClientCreated: () => void;
}
function NewEntryModal({ open, onClose, yarnTypes, clients, companyId, userId, userInfo, onCreated, onYarnTypeCreated, onClientCreated }: NewEntryProps) {
  const [yarnTypeId, setYarnTypeId] = useState('');
  const [clientId, setClientId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [palletsData, setPalletsData] = useState<{ code: string; boxes: string; notes: string }[]>([
    { code: generatePalletCode(1), boxes: '', notes: '' },
  ]);
  const [newTypeName, setNewTypeName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [saving, setSaving] = useState(false);

  const addPallet = () => setPalletsData(p => [...p, { code: generatePalletCode(p.length + 1), boxes: '', notes: '' }]);
  const removePallet = (i: number) => setPalletsData(p => p.filter((_, idx) => idx !== i));
  const updatePallet = (i: number, k: 'code' | 'boxes' | 'notes', v: string) =>
    setPalletsData(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const quickAddType = async () => {
    if (!newTypeName.trim()) return;
    const { data, error } = await (supabase.from as any)('yarn_stock_types')
      .insert({ company_id: companyId, name: newTypeName.trim() })
      .select().single();
    if (error) { toast.error(error.message); return; }
    setNewTypeName(''); setYarnTypeId(data.id);
    await onYarnTypeCreated();
  };
  const quickAddClient = async () => {
    if (!newClientName.trim()) return;
    const { data, error } = await (supabase.from as any)('yarn_stock_clients')
      .insert({ company_id: companyId, name: newClientName.trim() })
      .select().single();
    if (error) { toast.error(error.message); return; }
    setNewClientName(''); setClientId(data.id);
    await onClientCreated();
  };

  const submit = async () => {
    if (!yarnTypeId) { toast.error('Selecione o tipo de fio.'); return; }
    if (!clientId) { toast.error('Selecione o cliente.'); return; }
    const valid = palletsData.filter(p => p.code.trim() && parseInt(p.boxes, 10) > 0);
    if (valid.length === 0) { toast.error('Adicione ao menos um palete com código e caixas > 0.'); return; }
    setSaving(true);

    const yt = yarnTypes.find(y => y.id === yarnTypeId);
    const cl = clients.find(c => c.id === clientId);
    const rows = valid.map(p => ({
      company_id: companyId,
      code: p.code.trim(),
      yarn_type_id: yarnTypeId,
      yarn_type_name: yt?.name || null,
      client_id: clientId,
      client_name: cl?.name || null,
      supplier_name: supplier.trim() || null,
      total_boxes: parseInt(p.boxes, 10),
      remaining_boxes: parseInt(p.boxes, 10),
      status: 'available',
      notes: p.notes.trim() || null,
      created_by_name: userInfo.name,
      created_by_code: userInfo.code,
    }));

    const { data: inserted, error } = await (supabase.from as any)('yarn_stock_pallets')
      .insert(rows).select();
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      setSaving(false); return;
    }
    for (const ins of inserted || []) {
      await logYarnMovement(
        { companyId, userId, userName: userInfo.name, userCode: userInfo.code, userRole: userInfo.role },
        { pallet_id: ins.id, pallet_code: ins.code, type: 'entry', boxes: ins.total_boxes,
          notes: `Entrada de ${ins.total_boxes} caixas` },
      );
    }
    toast.success(`${rows.length} palete(s) cadastrado(s).`);
    setSaving(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Nova Entrada de Fio</DialogTitle>
          <DialogDescription>Cadastre cliente, tipo de fio e os paletes recebidos (com suas caixas).</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Cliente *</Label>
            <SearchableSelect value={clientId} onValueChange={setClientId}
              options={clients.map(c => ({ value: c.id, label: c.name }))}
              placeholder="Selecionar cliente" />
            <div className="flex gap-1 mt-1">
              <Input placeholder="+ novo cliente" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className="h-8 text-xs" />
              <Button type="button" size="sm" variant="outline" onClick={quickAddClient}>+</Button>
            </div>
          </div>
          <div>
            <Label>Tipo de Fio *</Label>
            <SearchableSelect value={yarnTypeId} onValueChange={setYarnTypeId}
              options={yarnTypes.map(y => ({ value: y.id, label: y.name }))}
              placeholder="Selecionar fio" />
            <div className="flex gap-1 mt-1">
              <Input placeholder="+ novo fio" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} className="h-8 text-xs" />
              <Button type="button" size="sm" variant="outline" onClick={quickAddType}>+</Button>
            </div>
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do fornecedor" />
          </div>
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">Paletes ({palletsData.length})</h4>
            <Button type="button" size="sm" variant="outline" onClick={addPallet}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar palete
            </Button>
          </div>
          <div className="space-y-2">
            {palletsData.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start border rounded p-2">
                <div className="col-span-12 md:col-span-5">
                  <Label className="text-xs">Código *</Label>
                  <Input value={p.code} onChange={(e) => updatePallet(i, 'code', e.target.value)} className="font-mono text-xs" />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-xs">Caixas *</Label>
                  <Input type="number" inputMode="numeric" min={1} value={p.boxes}
                    onChange={(e) => updatePallet(i, 'boxes', e.target.value)} />
                </div>
                <div className="col-span-6 md:col-span-4">
                  <Label className="text-xs">Observação</Label>
                  <Input value={p.notes} onChange={(e) => updatePallet(i, 'notes', e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-1 flex md:justify-end md:pt-5">
                  {palletsData.length > 1 && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => removePallet(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : `Cadastrar ${palletsData.length} palete(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}