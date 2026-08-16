import React, { useState, useMemo, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SearchableSelect } from '@/components/SearchableSelect';
import { formatWeight, formatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Package, Scale, Warehouse, Truck, Layers, ChevronDown, Plus, Loader2, Info, CalendarDays, Download
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { ManualStockEntryModal } from '@/components/ManualStockEntryModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function StockMalhaManual() {
  const { 
    getClients, getArticles, refreshData
  } = useSharedCompanyData();
  
  const clients = getClients() || [];
  const articles = getArticles() || [];
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const { role } = usePermissions();
  const isAdmin = role === 'admin';
  const [manualOpen, setManualOpen] = useState(false);
  const [palletModalOpen, setPalletModalOpen] = useState(false);
  const [selectedPalletData, setSelectedPalletData] = useState<any>(null);
  const [activeStockTab, setActiveStockTab] = useState<'estoque' | 'movimentos'>('estoque');
  const queryClient = useQueryClient();

  // Filtros
  const [estoqueClient, setEstoqueClient] = useState('all');
  const [estoqueArticle, setEstoqueArticle] = useState('all');
  const [estoqueMonth, setEstoqueMonth] = useState('all');

  // Aba Estoque (get_manual_stock_estoque_independent)
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['manual_stock_estoque_independent', companyId, estoqueClient, estoqueArticle, estoqueMonth],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_estoque_independent', {
        p_company_id: companyId,
        p_client_id: estoqueClient === 'all' ? null : estoqueClient,
        p_article_id: estoqueArticle === 'all' ? null : estoqueArticle,
        p_month: estoqueMonth
      });
      if (error) throw error;
      return (data || { groups: [], kpis: {} }) as {
        groups: any[];
        kpis: { inKg: number; inPc: number; outKg: number; outPc: number; onMachineKg: number; onMachinePc: number; stockKg: number; stockRolls: number };
      };
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const malhaEstoque = stockData?.groups || [];
  const kpis = stockData?.kpis || { inKg: 0, inPc: 0, outKg: 0, outPc: 0, onMachineKg: 0, onMachinePc: 0, stockKg: 0, stockRolls: 0 };

  // Aba Movimentações (get_manual_stock_movements_independent)
  const [movPage, setMovPage] = useState(1);
  const MOV_PAGE_SIZE = 15;
  const { data: movementsData, isLoading: movementsLoading } = useQuery({
    queryKey: ['manual_stock_movements_independent', companyId, movPage],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_movements_independent', {
        p_company_id: companyId,
        p_page: movPage,
        p_page_size: MOV_PAGE_SIZE
      });
      if (error) throw error;
      return (data || { rows: [], total_count: 0 }) as { rows: any[]; total_count: number };
    },
    enabled: !!companyId && activeStockTab === 'movimentos',
    staleTime: 30 * 1000,
  });

  const paginatedMovements = movementsData?.rows || [];
  const movTotalCount = movementsData?.total_count || 0;
  const movTotalPages = Math.max(1, Math.ceil(movTotalCount / MOV_PAGE_SIZE));

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(format(new Date(), 'yyyy-MM'));
    // Aqui poderíamos buscar meses com dados se a RPC suportasse, por hora fixamos o atual.
    return Array.from(months).sort().reverse();
  }, []);

  const refreshManualStock = () => {
    queryClient.invalidateQueries({ queryKey: ['manual_stock_estoque_independent', companyId] });
    queryClient.invalidateQueries({ queryKey: ['manual_stock_movements_independent', companyId] });
  };

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`manual-stock-realtime-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manual_stock_movements', filter: `company_id=eq.${companyId}` }, () => {
        refreshManualStock();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* leia o arquivo mestre.md (OBRIGATÓRIO LER ANTES DE ATUALIZAR O PROJETO) e prossiga -> em Estoque Malha (Manual) design 100% igual StockMalha.tsx */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" />
            Estoque de Malha (Manual)
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada do saldo manual de artigos por cliente — Independente
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setManualOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Lançamento Manual
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Produzido (Manual)</div>
          {stockLoading ? (<Skeleton className="h-6 w-24" />) : (
            <div className="flex flex-col">
              <p className="text-xl font-bold text-foreground">{kpis.inPc} peças</p>
              <p className="text-[10px] text-muted-foreground">{formatWeight(kpis.inKg)}</p>
            </div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Saída (Manual)</div>
          {stockLoading ? (<Skeleton className="h-6 w-24" />) : (
            <div className="flex flex-col">
              <p className="text-xl font-bold text-foreground">{kpis.outPc} peças</p>
              <p className="text-[10px] text-muted-foreground">{formatWeight(kpis.outKg)}</p>
            </div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-indigo-500 text-xs mb-1"><Layers className="h-3.5 w-3.5" />Em maq.</div>
          {stockLoading ? (<Skeleton className="h-6 w-24" />) : (
            <div className="flex flex-col">
              <p className="text-xl font-bold text-indigo-600">{kpis.onMachinePc} peças</p>
              <p className="text-[10px] text-indigo-400">{formatWeight(kpis.onMachineKg)}</p>
            </div>
          )}
        </CardContent></Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Disponível</div>
            {stockLoading ? (<Skeleton className="h-6 w-24" />) : (
              <div className="flex flex-col">
                <p className={cn('text-xl font-bold', kpis.stockRolls < 0 ? 'text-destructive' : 'text-primary')}>{kpis.stockRolls} peças</p>
                <p className="text-[10px] text-primary/80">{formatWeight(kpis.stockKg)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs text-primary/80">
          Este estoque é <strong>100% independente</strong>. Entradas e saídas são registradas apenas manualmente aqui, sem ligação com Produção ou Ordens de Faturamento (OF).
        </AlertDescription>
      </Alert>

      <Tabs value={activeStockTab} onValueChange={(v) => setActiveStockTab(v as any)} className="w-full">
        <TabsList className="flex flex-wrap justify-start h-auto gap-1 w-fit">
          <TabsTrigger value="estoque">Estoque (Manual)</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="estoque" className="space-y-3 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={estoqueMonth} onValueChange={setEstoqueMonth}>
                  <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo período</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>
                        {format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SearchableSelect
                  value={estoqueClient === 'all' ? '' : estoqueClient}
                  onValueChange={v => setEstoqueClient(v || 'all')}
                  options={[{ value: 'all', label: 'Todos clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="Todos clientes"
                  searchPlaceholder="Buscar cliente..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                <SearchableSelect
                  value={estoqueArticle === 'all' ? '' : estoqueArticle}
                  onValueChange={v => setEstoqueArticle(v || 'all')}
                  options={[{ value: 'all', label: 'Todos artigos' }, ...articles.map(a => ({ value: a.id, label: a.name }))]}
                  placeholder="Todos artigos"
                  searchPlaceholder="Buscar artigo..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(estoqueClient !== 'all' || estoqueArticle !== 'all' || estoqueMonth !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setEstoqueClient('all'); setEstoqueArticle('all'); setEstoqueMonth('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {stockLoading ? (
            <Card><CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando estoque manual...
            </CardContent></Card>
          ) : malhaEstoque.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum saldo manual encontrado.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {malhaEstoque.map(group => (
                <Collapsible 
                  key={group.clientId}
                  open={expandedClient === group.clientId}
                  onOpenChange={() => setExpandedClient(expandedClient === group.clientId ? null : group.clientId)}
                >
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedClient === group.clientId ? "" : "-rotate-90")} />
                          <CardTitle className="text-sm font-semibold">{group.clientName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Produzido: <span className="font-semibold text-foreground">{group.totalInPc} pç</span></span>
                          <span className="text-indigo-600">Em maq.: <span className="font-semibold">{group.totalOnMachinePc} pç</span></span>
                          <span>Disponível: <span className={cn('font-semibold', group.totalStockRolls < 0 ? 'text-destructive' : 'text-primary')}>{group.totalStockRolls} pç</span></span>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0 overflow-hidden">
                        <div className="hidden md:block overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Artigo</TableHead>
                                <TableHead className="text-xs text-right">Produzido (kg)</TableHead>
                                <TableHead className="text-xs text-right">Produzido (pç)</TableHead>
                                <TableHead className="text-xs text-right">Saída (kg)</TableHead>
                                <TableHead className="text-xs text-right">Saída (pç)</TableHead>
                                <TableHead className="text-xs text-right font-bold text-primary">Disp. Peças</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.articles.map((a: any) => (
                                <React.Fragment key={a.articleId}>
                                  <TableRow 
                                    className="cursor-pointer hover:bg-muted/50" 
                                    onClick={() => setExpandedArticle(expandedArticle === `${group.clientId}::${a.articleId}` ? null : `${group.clientId}::${a.articleId}`)}
                                  >
                                    <TableCell className="text-xs">
                                      <div className="flex items-center gap-1.5">
                                        <ChevronDown className={cn('h-3 w-3 transition-transform', expandedArticle === `${group.clientId}::${a.articleId}` ? '' : '-rotate-90')} />
                                        <span className="flex-1">{a.articleName}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-right">{formatWeight(a.inKg)}</TableCell>
                                    <TableCell className="text-xs text-right">{a.inPc}</TableCell>
                                    <TableCell className="text-xs text-right">{formatWeight(a.outKg)}</TableCell>
                                    <TableCell className="text-xs text-right">{a.outPc}</TableCell>
                                    <TableCell className="text-xs text-right font-bold text-indigo-600">{a.onMachinePc}</TableCell>
                                    <TableCell className={cn('text-xs text-right font-bold', a.stockRolls < 0 ? 'text-destructive' : 'text-primary')}>
                                      {a.stockRolls}
                                    </TableCell>
                                  </TableRow>
                                  {expandedArticle === `${group.clientId}::${a.articleId}` && (
                                    <React.Fragment>
                                      {a.byMachine.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={6} className="text-[11px] text-muted-foreground italic bg-muted/30 py-2 pl-8">
                                            Sem quebra por máquina registrada.
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        a.byMachine.map((m: any) => (
                                          <TableRow key={`${a.articleId}-${m.machineId}`} className="bg-muted/30">
                                            <TableCell className="text-[11px] pl-8 text-muted-foreground">↳ {m.machineName}</TableCell>
                                            <TableCell className="text-[11px] text-right text-muted-foreground">{formatWeight(m.inKg)}</TableCell>
                                            <TableCell className="text-[11px] text-right text-muted-foreground">{m.inPc}</TableCell>
                                            <TableCell className="text-[11px] text-right text-muted-foreground">{formatWeight(m.outKg)}</TableCell>
                                            <TableCell className="text-[11px] text-right text-muted-foreground">{m.outPc}</TableCell>
                                            <TableCell className="text-[11px] text-right font-bold text-indigo-600/70">{m.onMachinePc}</TableCell>
                                            <TableCell className="text-[11px] text-right font-bold text-primary/70">{m.stockRolls}</TableCell>
                                            <TableCell className="text-[11px] text-right pr-4">
                                              {isAdmin && (
                                                <Button 
                                                  variant="outline" 
                                                  size="sm" 
                                                  className="h-6 text-[9px] px-2 font-normal"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPalletData({
                                                      clientId: group.clientId,
                                                      clientName: group.clientName,
                                                      articleId: a.articleId,
                                                      articleName: a.articleName,
                                                      machineId: m.machineId,
                                                      machineName: m.machineName,
                                                      currentPc: m.onMachinePc,
                                                      currentKg: m.onMachineKg
                                                    });
                                                    setPalletModalOpen(true);
                                                  }}
                                                >
                                                  Palete
                                                </Button>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </React.Fragment>
                                  )}
                                </React.Fragment>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden divide-y">
                          {group.articles.map((a: any) => (
                            <div key={a.articleId} className="p-3 space-y-2">
                              <div 
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedArticle(expandedArticle === `${group.clientId}::${a.articleId}` ? null : `${group.clientId}::${a.articleId}`)}
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expandedArticle === `${group.clientId}::${a.articleId}` ? '' : '-rotate-90')} />
                                  <span className="text-xs font-medium">{a.articleName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-indigo-600 font-medium">{a.onMachinePc} maq.</span>
                                  <div className={cn('text-xs font-bold', a.stockRolls < 0 ? 'text-destructive' : 'text-primary')}>
                                    {a.stockRolls} peças
                                  </div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="bg-muted/30 p-1.5 rounded">
                                  <div className="text-muted-foreground mb-0.5 uppercase tracking-tighter font-semibold">Produzido</div>
                                  <div className="flex justify-between">
                                    <span>{formatWeight(a.inKg)}</span>
                                    <span>{a.inPc} pç</span>
                                  </div>
                                </div>
                                <div className="bg-muted/30 p-1.5 rounded">
                                  <div className="text-muted-foreground mb-0.5 uppercase tracking-tighter font-semibold">Saída</div>
                                  <div className="flex justify-between">
                                    <span>{formatWeight(a.outKg)}</span>
                                    <span>{a.outPc} pç</span>
                                  </div>
                                </div>
                              </div>

                              {expandedArticle === `${group.clientId}::${a.articleId}` && (
                                <div className="mt-2 space-y-2 pl-4 border-l-2 border-primary/20">
                                  {a.byMachine.length === 0 ? (
                                    <div className="text-[10px] text-muted-foreground italic">Sem quebra por máquina.</div>
                                  ) : (
                                    a.byMachine.map((m: any) => (
                                      <div key={`${a.articleId}-${m.machineId}`} className="space-y-1 bg-muted/20 p-2 rounded">
                                        <div className="flex justify-between items-center text-[10px] font-medium text-muted-foreground">
                                          <span>↳ {m.machineName}</span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-indigo-600">{m.onMachinePc} maq.</span>
                                            <span className="text-primary/70">{m.stockRolls} pç</span>
                                            {isAdmin && (
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-5 text-[8px] px-1 font-normal"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedPalletData({
                                                    clientId: group.clientId,
                                                    clientName: group.clientName,
                                                    articleId: a.articleId,
                                                    articleName: a.articleName,
                                                    machineId: m.machineId,
                                                    machineName: m.machineName,
                                                    currentPc: m.onMachinePc,
                                                    currentKg: m.onMachineKg
                                                  });
                                                  setPalletModalOpen(true);
                                                }}
                                              >
                                                Palete
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-[9px] opacity-80">
                                          <div className="flex justify-between px-1">
                                            <span>Ent: {formatWeight(m.inKg)}</span>
                                            <span>{m.inPc} pç</span>
                                          </div>
                                          <div className="flex justify-between px-1 border-l border-muted-foreground/20">
                                            <span>Saí: {formatWeight(m.outKg)}</span>
                                            <span>{m.outPc} pç</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movimentos" className="mt-4">
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold">Histórico de Movimentações Manuais</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {movementsLoading ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : paginatedMovements.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</div>
              ) : (
                <div className="overflow-hidden">
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs">Cliente / Artigo</TableHead>
                          <TableHead className="text-xs text-right">Peso (kg)</TableHead>
                          <TableHead className="text-xs text-right">Peças</TableHead>
                          <TableHead className="text-xs">Autor / Obs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedMovements.map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-[11px] whitespace-nowrap">
                              {format(new Date(m.created_at), 'dd/MM/yy HH:mm')}
                            </TableCell>
                            <TableCell className="text-[11px]">
                              <Badge variant={m.type === 'in' ? 'default' : 'destructive'} className="text-[9px] px-1 py-0 uppercase">
                                {m.type === 'in' ? 'Entrada' : 'Saída'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px]">
                              <div className="font-medium">{m.client}</div>
                              <div className="text-muted-foreground">{m.article} {m.machine && `(${m.machine})`}</div>
                            </TableCell>
                            <TableCell className="text-[11px] text-right">{formatWeight(m.weight_kg)}</TableCell>
                            <TableCell className="text-[11px] text-right">{m.pieces}</TableCell>
                            <TableCell className="text-[11px]">
                              <div className="font-medium text-[10px]">{m.author}</div>
                              {m.description && <div className="text-muted-foreground italic truncate max-w-[150px]">{m.description}</div>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards for Movements */}
                  <div className="md:hidden divide-y">
                    {paginatedMovements.map(m => (
                      <div key={m.id} className="p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="space-y-0.5">
                            <div className="text-[10px] text-muted-foreground">
                              {format(new Date(m.created_at), 'dd/MM/yy HH:mm')}
                            </div>
                            <div className="text-xs font-bold">{m.client}</div>
                            <div className="text-[10px] text-muted-foreground">{m.article} {m.machine && `(${m.machine})`}</div>
                          </div>
                          <Badge variant={m.type === 'in' ? 'default' : 'destructive'} className="text-[9px] px-1 py-0 uppercase">
                            {m.type === 'in' ? 'Entrada' : 'Saída'}
                          </Badge>
                        </div>
                        
                        <div className="flex justify-between items-center text-[11px] bg-muted/30 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground uppercase text-[9px] font-semibold">Peso:</span>
                            <span className="font-medium">{formatWeight(m.weight_kg)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground uppercase text-[9px] font-semibold">Peças:</span>
                            <span className="font-medium">{m.pieces} pç</span>
                          </div>
                        </div>

                        <div className="text-[10px] flex items-center justify-between">
                          <span className="font-medium">{m.author}</span>
                          {m.description && <span className="text-muted-foreground italic truncate max-w-[180px]">{m.description}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
            {movTotalPages > 1 && (
              <div className="p-4 border-t flex justify-between items-center bg-muted/20">
                <span className="text-xs text-muted-foreground">Página {movPage} de {movTotalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMovPage(p => Math.max(1, p - 1))} disabled={movPage === 1}>Anterior</Button>
                  <Button variant="outline" size="sm" onClick={() => setMovPage(p => Math.min(movTotalPages, p + 1))} disabled={movPage === movTotalPages}>Próxima</Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ManualStockEntryModal 
        open={manualOpen} 
        onOpenChange={setManualOpen}
        onSuccess={() => {
          refreshManualStock();
        }}
      />

      <ManualStockEntryModal 
        open={palletModalOpen} 
        onOpenChange={setPalletModalOpen}
        palletMode={true}
        initialData={selectedPalletData}
        onSuccess={() => {
          refreshManualStock();
          setSelectedPalletData(null);
        }}
      />
    </div>
  );
}
