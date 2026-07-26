import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/SearchableSelect';
import { BrazilianWeightInput } from '@/components/BrazilianWeightInput';
import { formatWeight, formatNumber } from '@/lib/formatters';
import { logAudit } from '@/lib/auditLog';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import { Warehouse, Plus, ChevronDown, Info } from 'lucide-react';

type EstoqueKPIs = {
  entradaKg: number; deliveredKg: number;
  stockKg: number; stockRolls: number;
  reservedKg: number; availableKg: number;
};
type MachineNode = {
  machineId: string | null; machineName: string;
  entradaKg: number; entradaRolls: number;
  deliveredKg: number; deliveredRolls: number;
  reservedKg: number; reservedRolls: number;
  stockKg: number; stockRolls: number;
  availableKg: number; availableRolls: number;
};
type ArticleNode = MachineNode & {
  articleId: string; articleName: string; byMachine: MachineNode[];
};
type ClientGroup = {
  clientId: string; clientName: string; articles: ArticleNode[];
  totalEntradaKg: number; totalDeliveredKg: number;
  totalStockKg: number; totalStockRolls: number;
  totalReservedKg: number; totalAvailableKg: number;
};
type EstoqueResp = { groups: ClientGroup[]; kpis: EstoqueKPIs };

const TYPE_LABEL: Record<string, string> = {
  adjust_in: 'Entrada manual',
  adjust_out: 'Saída manual',
  in: 'Estorno OF',
  out: 'Saída OF',
  reserve: 'Reserva OF',
  release: 'Liberação OF',
};
const TYPE_COLOR: Record<string, string> = {
  adjust_in: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  adjust_out: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  in: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  out: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  reserve: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  release: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

function ManualEntryModal({
  open, onOpenChange, clients, articles, machines, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  clients: any[]; articles: any[]; machines: any[]; onSaved: () => void;
}) {
  const { user, profile } = useAuth();
  const [type, setType] = useState<'adjust_in' | 'adjust_out'>('adjust_in');
  const [clientId, setClientId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType('adjust_in'); setClientId(''); setArticleId(''); setMachineId('');
      setPieces(''); setWeight(''); setReason('');
    }
  }, [open]);

  const filteredArticles = useMemo(
    () => articles.filter((a: any) => a.client_id === clientId).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [articles, clientId]
  );

  const handleSave = async () => {
    const piecesNum = parseInt(pieces || '0', 10);
    const weightNum = parseFloat(weight || '0');
    if (!clientId) return toast.error('Cliente obrigatório');
    if (!articleId) return toast.error('Artigo obrigatório');
    if (!machineId) return toast.error('Máquina obrigatória');
    if (!(weightNum > 0) && !(piecesNum > 0)) return toast.error('Informe peças ou peso');
    if (reason.trim().length < 5) return toast.error('Motivo mínimo 5 caracteres');
    if (!user?.company_id) return;

    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)('save_manual_stock_manual_entry', {
        p_payload: {
          company_id: user.company_id,
          article_id: articleId,
          client_id: clientId,
          machine_id: machineId,
          type,
          pieces: piecesNum,
          weight_kg: weightNum,
          reason: reason.trim(),
        },
      });
      if (error) throw error;

      await logAudit({
        action: 'STOCK_MANUAL_ADJUST',
        companyId: user.company_id,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userCode: (user as any).code,
        details: {
          scope: 'manual_stock_movements',
          movement_id: data,
          type, client_id: clientId, article_id: articleId, machine_id: machineId,
          pieces: piecesNum, weight_kg: weightNum, reason: reason.trim(),
        },
      });

      toast.success(type === 'adjust_in' ? 'Entrada manual registrada' : 'Saída manual registrada');
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" />
            Lançamento Manual — Estoque Malha (Manual)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Tipo</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="adjust_in" /> Entrada
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="adjust_out" /> Saída
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Cliente *</Label>
            <SearchableSelect
              value={clientId}
              onValueChange={(v) => { setClientId(v); setArticleId(''); }}
              options={clients.map((c: any) => ({ value: c.id, label: c.name }))}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Artigo *</Label>
            <SearchableSelect
              value={articleId}
              onValueChange={setArticleId}
              options={filteredArticles.map((a: any) => ({ value: a.id, label: a.name }))}
              placeholder={clientId ? 'Selecione o artigo' : 'Escolha um cliente primeiro'}
              searchPlaceholder="Buscar artigo..."
              disabled={!clientId}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Máquina *</Label>
            <SearchableSelect
              value={machineId}
              onValueChange={setMachineId}
              options={machines.map((m: any) => ({ value: m.id, label: m.name }))}
              placeholder="Selecione a máquina"
              searchPlaceholder="Buscar máquina..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Peças</Label>
              <Input
                type="number" min={0}
                value={pieces}
                onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0" className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Peso (kg)</Label>
              <BrazilianWeightInput value={weight} onChange={setWeight} placeholder="0,00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Motivo *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder='Ex.: "Saldo inicial", "Ajuste de contagem"'
              className="text-xs min-h-[70px]" maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StockMalhaManual() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const companyId = user?.company_id || '';
  const { getClients, getArticles, getMachines, refreshData } = useSharedCompanyData();
  const clients = getClients();
  const articles = getArticles();
  const machines = getMachines();
  const queryClient = useQueryClient();

  const canEdit = role === 'admin' || (role as any) === 'expedicao';

  const [tab, setTab] = useState<'estoque' | 'movimentos'>('estoque');
  const [openManual, setOpenManual] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // Estoque filters
  const [fClient, setFClient] = useState<string>('all');
  const [fArticle, setFArticle] = useState<string>('all');
  const [fMonth, setFMonth] = useState<string>('all');

  // Movements filters
  const [mType, setMType] = useState<string>('all');
  const [mFrom, setMFrom] = useState<string>('');
  const [mTo, setMTo] = useState<string>('');
  const [mClient, setMClient] = useState<string>('all');
  const [mArticle, setMArticle] = useState<string>('all');
  const [mOfSearch, setMOfSearch] = useState<string>('');
  const [mPage, setMPage] = useState<number>(1);
  const pageSize = 20;

  // Bootstrap (available months)
  const { data: bootstrap } = useQuery({
    queryKey: ['manual-stock-bootstrap', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_bootstrap', { p_company_id: companyId });
      if (error) throw error;
      return data as { company: any; available_months: string[] };
    },
    enabled: !!companyId,
  });

  const { data: estoque, isLoading: loadingEstoque } = useQuery({
    queryKey: ['manual-stock-estoque', companyId, fClient, fArticle, fMonth],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_estoque', {
        p_company_id: companyId,
        p_client_id: fClient === 'all' ? null : fClient,
        p_article_id: fArticle === 'all' ? null : fArticle,
        p_month: fMonth || 'all',
      });
      if (error) throw error;
      return data as EstoqueResp;
    },
    enabled: !!companyId && tab === 'estoque',
  });

  const { data: mvData, isLoading: loadingMv } = useQuery({
    queryKey: ['manual-stock-mv', companyId, mType, mFrom, mTo, mClient, mArticle, mOfSearch, mPage],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_movements', {
        p_company_id: companyId,
        p_type: mType,
        p_from: mFrom || null,
        p_to: mTo || null,
        p_page: mPage,
        p_page_size: pageSize,
        p_client_id: mClient === 'all' ? null : mClient,
        p_article_id: mArticle === 'all' ? null : mArticle,
        p_of_search: mOfSearch.trim() || null,
      });
      if (error) throw error;
      return data as { rows: any[]; total_count: number };
    },
    enabled: !!companyId && tab === 'movimentos',
  });

  // Realtime: refetch on any change (per OFR-realtime memory pattern)
  useEffect(() => {
    if (!companyId) return;
    const ch = (supabase as any)
      .channel(`manual-stock-${companyId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'manual_stock_movements', filter: `company_id=eq.${companyId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['manual-stock-estoque', companyId] });
          queryClient.invalidateQueries({ queryKey: ['manual-stock-mv', companyId] });
          queryClient.invalidateQueries({ queryKey: ['manual-stock-bootstrap', companyId] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, queryClient]);

  const clientOpts = useMemo(
    () => [{ value: 'all', label: 'Todos' }, ...clients.map((c: any) => ({ value: c.id, label: c.name }))],
    [clients]
  );
  const articleOpts = useMemo(() => {
    const scope = fClient === 'all' ? articles : articles.filter((a: any) => a.client_id === fClient);
    return [{ value: 'all', label: 'Todos' }, ...scope.map((a: any) => ({ value: a.id, label: a.name }))];
  }, [articles, fClient]);
  const mArticleOpts = useMemo(() => {
    const scope = mClient === 'all' ? articles : articles.filter((a: any) => a.client_id === mClient);
    return [{ value: 'all', label: 'Todos' }, ...scope.map((a: any) => ({ value: a.id, label: a.name }))];
  }, [articles, mClient]);

  const totalPages = Math.max(1, Math.ceil((mvData?.total_count || 0) / pageSize));

  const kpis = estoque?.kpis;
  const groups = estoque?.groups || [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            Estoque Malha (Manual)
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Armazém paralelo — entradas somente manuais. Saídas espelham automaticamente as OFs (reserva, liberação e coleta).
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setOpenManual(true)}>
            <Plus className="h-4 w-4 mr-1" /> Lançamento manual
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentações</TabsTrigger>
        </TabsList>

        {/* ============= ESTOQUE ============= */}
        <TabsContent value="estoque" className="space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <SearchableSelect value={fClient} onValueChange={(v) => { setFClient(v); setFArticle('all'); }}
                    options={clientOpts} placeholder="Todos" searchPlaceholder="Buscar cliente..." />
                </div>
                <div>
                  <Label className="text-xs">Artigo</Label>
                  <SearchableSelect value={fArticle} onValueChange={setFArticle}
                    options={articleOpts} placeholder="Todos" searchPlaceholder="Buscar artigo..." />
                </div>
                <div>
                  <Label className="text-xs">Mês</Label>
                  <Select value={fMonth} onValueChange={setFMonth}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os meses</SelectItem>
                      {(bootstrap?.available_months || []).map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" size="sm" className="w-full"
                    onClick={() => { setFClient('all'); setFArticle('all'); setFMonth('all'); }}>
                    Limpar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KpiCard title="Entradas (Kg)" value={formatWeight(kpis?.entradaKg || 0)} />
            <KpiCard title="Saídas OF (Kg)" value={formatWeight(kpis?.deliveredKg || 0)} />
            <KpiCard title="Reservado (Kg)" value={formatWeight(kpis?.reservedKg || 0)} />
            <KpiCard title="Disponível (Kg)" value={formatWeight(kpis?.availableKg || 0)} highlight />
          </div>

          {loadingEstoque ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando estoque…</CardContent></Card>
          ) : groups.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Info className="h-6 w-6" />
              Nenhum saldo. Adicione uma entrada manual para começar.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <Card key={g.clientId}>
                  <CardHeader className="p-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">{g.clientName}</CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">Estoque {formatWeight(g.totalStockKg)}</Badge>
                      <Badge variant="secondary" className="text-[10px]">Reservado {formatWeight(g.totalReservedKg)}</Badge>
                      <Badge className="text-[10px]">Disponível {formatWeight(g.totalAvailableKg)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-border">
                      {g.articles.map((a) => (
                        <ArticleRowMobile key={a.articleId} article={a}
                          expanded={expandedArticle === a.articleId}
                          onToggle={() => setExpandedArticle(expandedArticle === a.articleId ? null : a.articleId)} />
                      ))}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Artigo</TableHead>
                            <TableHead className="text-right">Entradas Kg</TableHead>
                            <TableHead className="text-right">Saídas OF Kg</TableHead>
                            <TableHead className="text-right">Reservado Kg</TableHead>
                            <TableHead className="text-right">Estoque Kg</TableHead>
                            <TableHead className="text-right">Estoque Rolos</TableHead>
                            <TableHead className="text-right">Disponível Kg</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.articles.map((a) => (
                            <React.Fragment key={a.articleId}>
                              <TableRow className="cursor-pointer" onClick={() => setExpandedArticle(expandedArticle === a.articleId ? null : a.articleId)}>
                                <TableCell className="font-medium flex items-center gap-2">
                                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedArticle === a.articleId ? 'rotate-0' : '-rotate-90'}`} />
                                  {a.articleName}
                                </TableCell>
                                <TableCell className="text-right">{formatWeight(a.entradaKg)}</TableCell>
                                <TableCell className="text-right">{formatWeight(a.deliveredKg)}</TableCell>
                                <TableCell className="text-right">{formatWeight(a.reservedKg)}</TableCell>
                                <TableCell className="text-right">{formatWeight(a.stockKg)}</TableCell>
                                <TableCell className="text-right">{formatNumber(a.stockRolls)}</TableCell>
                                <TableCell className="text-right font-semibold">{formatWeight(a.availableKg)}</TableCell>
                              </TableRow>
                              {expandedArticle === a.articleId && (
                                <TableRow>
                                  <TableCell colSpan={7} className="bg-muted/40 p-3">
                                    <div className="text-[11px] font-medium mb-2 text-muted-foreground">Por máquina</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {a.byMachine.map((m, i) => (
                                        <div key={`${m.machineId || 'na'}-${i}`} className="border rounded-md p-2 text-xs bg-background">
                                          <div className="font-medium">{m.machineName}</div>
                                          <div className="flex justify-between text-[11px] mt-1"><span>Entradas</span><span>{formatWeight(m.entradaKg)}</span></div>
                                          <div className="flex justify-between text-[11px]"><span>Saídas OF</span><span>{formatWeight(m.deliveredKg)}</span></div>
                                          <div className="flex justify-between text-[11px]"><span>Reservado</span><span>{formatWeight(m.reservedKg)}</span></div>
                                          <div className="flex justify-between text-[11px] font-semibold"><span>Disponível</span><span>{formatWeight(m.availableKg)}</span></div>
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============= MOVIMENTAÇÕES ============= */}
        <TabsContent value="movimentos" className="space-y-3">
          <Card>
            <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={mType} onValueChange={(v) => { setMType(v); setMPage(1); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" className="h-9" value={mFrom} onChange={(e) => { setMFrom(e.target.value); setMPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" className="h-9" value={mTo} onChange={(e) => { setMTo(e.target.value); setMPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <SearchableSelect value={mClient} onValueChange={(v) => { setMClient(v); setMArticle('all'); setMPage(1); }}
                  options={clientOpts} placeholder="Todos" searchPlaceholder="Buscar..." />
              </div>
              <div>
                <Label className="text-xs">Artigo</Label>
                <SearchableSelect value={mArticle} onValueChange={(v) => { setMArticle(v); setMPage(1); }}
                  options={mArticleOpts} placeholder="Todos" searchPlaceholder="Buscar..." />
              </div>
              <div>
                <Label className="text-xs">Buscar OF</Label>
                <Input className="h-9" placeholder="nº OF" value={mOfSearch}
                  onChange={(e) => { setMOfSearch(e.target.value); setMPage(1); }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingMv ? (
                <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              ) : (mvData?.rows || []).length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma movimentação.</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-border">
                    {mvData!.rows.map((r) => (
                      <MvCardMobile key={r.id} row={r} />
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Cliente / Artigo</TableHead>
                          <TableHead>Máquina</TableHead>
                          <TableHead>OF</TableHead>
                          <TableHead className="text-right">Peças</TableHead>
                          <TableHead className="text-right">Kg</TableHead>
                          <TableHead>Autor / Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mvData!.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            </TableCell>
                            <TableCell><span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLOR[r.type] || ''}`}>{TYPE_LABEL[r.type] || r.type}</span></TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium">{r.client?.name || '—'}</div>
                              <div className="text-muted-foreground">{r.article?.name || '—'}</div>
                            </TableCell>
                            <TableCell className="text-xs">{r.machine?.name || '—'}</TableCell>
                            <TableCell className="text-xs">{r.billing_order?.of_number ? `#${r.billing_order.of_number}` : '—'}</TableCell>
                            <TableCell className="text-right text-xs">{formatNumber(r.pieces || 0)}</TableCell>
                            <TableCell className="text-right text-xs">{formatWeight(r.weight_kg || 0)}</TableCell>
                            <TableCell className="text-xs">
                              <div>{r.author ? `${r.author.name}${r.author.code ? ` #${r.author.code}` : ''}` : '—'}</div>
                              {r.reason && <div className="text-muted-foreground text-[10px] italic">{r.reason}</div>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              {/* Pagination */}
              {(mvData?.total_count || 0) > pageSize && (
                <div className="flex items-center justify-between p-3 border-t">
                  <div className="text-xs text-muted-foreground">
                    Página {mPage} de {totalPages} — {mvData?.total_count} registros
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={mPage <= 1} onClick={() => setMPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={mPage >= totalPages} onClick={() => setMPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ManualEntryModal
        open={openManual} onOpenChange={setOpenManual}
        clients={clients} articles={articles} machines={machines}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['manual-stock-estoque', companyId] });
          queryClient.invalidateQueries({ queryKey: ['manual-stock-mv', companyId] });
          refreshData?.();
        }}
      />
    </div>
  );
}

function KpiCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/40' : ''}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ArticleRowMobile({ article, expanded, onToggle }: { article: ArticleNode; expanded: boolean; onToggle: () => void }) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left p-3 flex items-start justify-between gap-2 hover:bg-muted/40">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{article.articleName}</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px]">Est {formatWeight(article.stockKg)}</Badge>
              <Badge variant="outline" className="text-[10px]">Rsv {formatWeight(article.reservedKg)}</Badge>
              <Badge className="text-[10px]">Disp {formatWeight(article.availableKg)}</Badge>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 bg-muted/30 space-y-2">
          {article.byMachine.map((m, i) => (
            <div key={`${m.machineId || 'na'}-${i}`} className="border rounded-md p-2 text-xs bg-background">
              <div className="font-medium">{m.machineName}</div>
              <div className="flex justify-between text-[11px] mt-1"><span>Entradas</span><span>{formatWeight(m.entradaKg)}</span></div>
              <div className="flex justify-between text-[11px]"><span>Saídas OF</span><span>{formatWeight(m.deliveredKg)}</span></div>
              <div className="flex justify-between text-[11px]"><span>Reservado</span><span>{formatWeight(m.reservedKg)}</span></div>
              <div className="flex justify-between text-[11px] font-semibold"><span>Disponível</span><span>{formatWeight(m.availableKg)}</span></div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MvCardMobile({ row }: { row: any }) {
  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLOR[row.type] || ''}`}>{TYPE_LABEL[row.type] || row.type}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </span>
      </div>
      <div className="text-sm font-medium">{row.client?.name || '—'} · {row.article?.name || '—'}</div>
      <div className="text-[11px] text-muted-foreground">
        Máquina: {row.machine?.name || '—'} {row.billing_order?.of_number ? `· OF #${row.billing_order.of_number}` : ''}
      </div>
      <div className="flex justify-between text-xs">
        <span>{formatNumber(row.pieces || 0)} peças</span>
        <span className="font-semibold">{formatWeight(row.weight_kg || 0)}</span>
      </div>
      {(row.author || row.reason) && (
        <div className="text-[10px] text-muted-foreground border-t pt-1">
          {row.author ? `${row.author.name}${row.author.code ? ` #${row.author.code}` : ''}` : ''}
          {row.reason ? ` · ${row.reason}` : ''}
        </div>
      )}
    </div>
  );
}