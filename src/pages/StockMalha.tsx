import { useState, useMemo } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
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
  Package, Scale, Warehouse, Truck, Layers, ChevronDown
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { ManualStockEntryModal } from '@/components/ManualStockEntryModal';
import { Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Lock } from 'lucide-react';

export default function StockMalha() {
  const { 
    getProductions, getClients, getArticles, getYarnTypes 
  } = useSharedCompanyData();
  
  const productions = getProductions();
  const clients = getClients();
  const articles = getArticles();
  const yarnTypes = getYarnTypes();

  // No Invoices or InvoiceItems dependency as requested: "sem ligação com a aba Saida de malha"
  // Wait, if I don't use invoices, I can't calculate stock (produced - delivered).
  // The user says "sem ligação com a aba Saida de malha", but "apenas a listagem do estoque no momento".
  // This is contradictory if they want "estoque" (which is Production - Invoices).
  // I will interpret "sem ligação com a aba Saida de malha" as "don't let the user edit or see the NFs here",
  // but I still need the invoice data to CALCULATE the current stock.
  // Actually, looking at the Invoices.tsx code, "estoque" tab uses `malhaEstoque` useMemo.
  
  // To avoid circular or heavy dependencies, I'll fetch the invoices locally here just for calculation.
  const [estoqueClient, setEstoqueClient] = useState('all');
  const [estoqueArticle, setEstoqueArticle] = useState('all');
  const [estoqueMonth, setEstoqueMonth] = useState('all');

  // Hooks for data calculation
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const { role } = usePermissions();
  const isAdmin = role === 'admin';
  const [manualOpen, setManualOpen] = useState(false);
  const [manual2qOpen, setManual2qOpen] = useState(false);
  const [activeStockTab, setActiveStockTab] = useState<'estoque' | 'segunda' | 'movimentos'>('estoque');
  // Filtros independentes para 2ª qualidade
  const [segClient, setSegClient] = useState('all');
  const [segArticle, setSegArticle] = useState('all');
  const [segMonth, setSegMonth] = useState('all');

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices_for_stock', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: invoiceItems = [] } = useQuery({
    queryKey: ['invoice_items_for_stock', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoice_items').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: stockMovements = [], refetch: refetchMovements } = useQuery({
    queryKey: ['stock_movements_for_stock', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('stock_movements')
        .select('id, article_id, client_id, billing_order_id, type, pieces, weight_kg, is_second_quality, created_at')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Re-implementing the malhaEstoque logic from Invoices.tsx
  const malhaEstoque = useMemo(() => {
    const map = new Map<string, Map<string, { producedKg: number; producedRolls: number; deliveredKg: number; deliveredRolls: number; reservedKg: number; reservedRolls: number }>>();
    const matchMonth = (date: string) => estoqueMonth === 'all' || date.startsWith(estoqueMonth);

    // 1. Production
    for (const prod of productions) {
      if (!matchMonth(prod.date)) continue;
      const art = articles.find(a => a.id === prod.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(prod.article_id!)) artMap.set(prod.article_id!, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0, reservedKg: 0, reservedRolls: 0 });
      const entry = artMap.get(prod.article_id!)!;
      entry.producedKg += Number(prod.weight_kg);
      entry.producedRolls += Number(prod.rolls_produced);
    }

    // 2. NFs de Saída NÃO descontam mais estoque a partir do deploy de OF×Estoque.
    //    A baixa real ocorre via stock_movements.out gerado pela OF coletada (§9 do plano).

    // 3. Stock movements (manual adjustments) — add to producedKg/Rolls so it flows into Estoque
    const monthMatchesMovement = (createdAt: string) => estoqueMonth === 'all' || createdAt.startsWith(estoqueMonth);
    for (const mv of stockMovements as any[]) {
      if (!monthMatchesMovement(mv.created_at)) continue;
      // Movimentos de 2ª qualidade não afetam o estoque principal
      if (mv.is_second_quality) continue;
      if (!['adjust_in', 'adjust_out', 'out', 'in', 'reserve', 'release'].includes(mv.type)) continue;
      const art = articles.find(a => a.id === mv.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(mv.article_id)) artMap.set(mv.article_id, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0, reservedKg: 0, reservedRolls: 0 });
      const entry = artMap.get(mv.article_id)!;
      const kg = Number(mv.weight_kg);
      const pc = Number(mv.pieces);
      if (mv.type === 'adjust_in') {
        entry.producedKg += Number(mv.weight_kg);
        entry.producedRolls += Number(mv.pieces);
      } else if (mv.type === 'adjust_out') {
        entry.producedKg -= Number(mv.weight_kg);
        entry.producedRolls -= Number(mv.pieces);
      } else if (mv.type === 'in') {
        // Estorno 1ª qualidade: pç retornam ao estoque → desconta Entregue (libera Disponível)
        if (mv.billing_order_id) {
          entry.deliveredKg -= kg;
          entry.deliveredRolls -= pc;
        } else {
          entry.producedKg += kg;
          entry.producedRolls += pc;
        }
      } else if (mv.type === 'out') {
        // Saída por OF coletada — conta como entregue (não desconta o "Produzido" exibido).
        entry.deliveredKg += Number(mv.weight_kg);
        entry.deliveredRolls += Number(mv.pieces);
      } else if (mv.type === 'reserve') {
        entry.reservedKg += kg;
        entry.reservedRolls += pc;
      } else if (mv.type === 'release') {
        entry.reservedKg -= kg;
        entry.reservedRolls -= pc;
      }
    }

    const result: any[] = [];
    map.forEach((artMap, clientId) => {
      if (estoqueClient !== 'all' && clientId !== estoqueClient) return;
      const client = clients.find(c => c.id === clientId);
      const arts: any[] = [];
      let tPK = 0, tPR = 0, tDK = 0, tDR = 0, tRK = 0, tRR = 0;
      artMap.forEach((vals, articleId) => {
        if (estoqueArticle !== 'all' && articleId !== estoqueArticle) return;
        const article = articles.find(a => a.id === articleId);
        const stockKg = vals.producedKg - vals.deliveredKg;
        const stockRolls = vals.producedRolls - vals.deliveredRolls;
        arts.push({
          articleId,
          articleName: article?.name || 'Artigo removido',
          ...vals,
          stockKg,
          stockRolls,
          availableKg: stockKg - vals.reservedKg,
          availableRolls: stockRolls - vals.reservedRolls,
        });
        tPK += vals.producedKg; tPR += vals.producedRolls;
        tDK += vals.deliveredKg; tDR += vals.deliveredRolls;
        tRK += vals.reservedKg; tRR += vals.reservedRolls;
      });
      if (arts.length > 0) {
        result.push({
          clientId,
          clientName: client?.name || 'Cliente removido',
          articles: arts.sort((a, b) => a.articleName.localeCompare(b.articleName)),
          totalProducedKg: tPK, totalProducedRolls: tPR,
          totalDeliveredKg: tDK, totalDeliveredRolls: tDR,
          totalReservedKg: tRK, totalReservedRolls: tRR,
          totalStockKg: tPK - tDK, totalStockRolls: tPR - tDR,
          totalAvailableKg: (tPK - tDK) - tRK, totalAvailableRolls: (tPR - tDR) - tRR,
        });
      }
    });
    return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [productions, invoices, invoiceItems, stockMovements, articles, clients, estoqueClient, estoqueArticle, estoqueMonth]);

  const estoqueKpis = useMemo(() => malhaEstoque.reduce((acc, g) => ({
    producedKg: acc.producedKg + g.totalProducedKg,
    deliveredKg: acc.deliveredKg + g.totalDeliveredKg,
    stockKg: acc.stockKg + g.totalStockKg,
    stockRolls: acc.stockRolls + g.totalStockRolls,
    reservedKg: acc.reservedKg + g.totalReservedKg,
    availableKg: acc.availableKg + g.totalAvailableKg,
  }), { producedKg: 0, deliveredKg: 0, stockKg: 0, stockRolls: 0, reservedKg: 0, availableKg: 0 }), [malhaEstoque]);

  // 2ª QUALIDADE — agregação independente
  const segundaEstoque = useMemo(() => {
    const map = new Map<string, Map<string, { entradaKg: number; entradaRolls: number; saidaKg: number; saidaRolls: number }>>();
    const matchMonth = (createdAt: string) => segMonth === 'all' || createdAt.startsWith(segMonth);
    for (const mv of stockMovements as any[]) {
      if (!mv.is_second_quality) continue;
      if (!matchMonth(mv.created_at)) continue;
      const art = articles.find(a => a.id === mv.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(mv.article_id)) artMap.set(mv.article_id, { entradaKg: 0, entradaRolls: 0, saidaKg: 0, saidaRolls: 0 });
      const e = artMap.get(mv.article_id)!;
      const kg = Number(mv.weight_kg);
      const pc = Number(mv.pieces);
      if (mv.type === 'in' || mv.type === 'adjust_in') {
        e.entradaKg += kg; e.entradaRolls += pc;
      } else if (mv.type === 'out' || mv.type === 'adjust_out') {
        e.saidaKg += kg; e.saidaRolls += pc;
      }
    }
    const result: any[] = [];
    map.forEach((artMap, clientId) => {
      if (segClient !== 'all' && clientId !== segClient) return;
      const client = clients.find(c => c.id === clientId);
      const arts: any[] = [];
      let tEK = 0, tER = 0, tSK = 0, tSR = 0;
      artMap.forEach((vals, articleId) => {
        if (segArticle !== 'all' && articleId !== segArticle) return;
        const article = articles.find(a => a.id === articleId);
        const saldoKg = vals.entradaKg - vals.saidaKg;
        const saldoRolls = vals.entradaRolls - vals.saidaRolls;
        arts.push({
          articleId, articleName: article?.name || 'Artigo removido',
          ...vals, saldoKg, saldoRolls,
        });
        tEK += vals.entradaKg; tER += vals.entradaRolls;
        tSK += vals.saidaKg; tSR += vals.saidaRolls;
      });
      if (arts.length > 0) {
        result.push({
          clientId, clientName: client?.name || 'Cliente removido',
          articles: arts.sort((a, b) => a.articleName.localeCompare(b.articleName)),
          totalEntradaKg: tEK, totalEntradaRolls: tER,
          totalSaidaKg: tSK, totalSaidaRolls: tSR,
          totalSaldoKg: tEK - tSK, totalSaldoRolls: tER - tSR,
        });
      }
    });
    return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [stockMovements, articles, clients, segClient, segArticle, segMonth]);

  const segundaKpis = useMemo(() => segundaEstoque.reduce((acc, g) => ({
    entradaKg: acc.entradaKg + g.totalEntradaKg,
    entradaRolls: acc.entradaRolls + g.totalEntradaRolls,
    saidaKg: acc.saidaKg + g.totalSaidaKg,
    saidaRolls: acc.saidaRolls + g.totalSaidaRolls,
    saldoKg: acc.saldoKg + g.totalSaldoKg,
    saldoRolls: acc.saldoRolls + g.totalSaldoRolls,
  }), { entradaKg: 0, entradaRolls: 0, saidaKg: 0, saidaRolls: 0, saldoKg: 0, saldoRolls: 0 }), [segundaEstoque]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(format(new Date(), 'yyyy-MM'));
    invoices.forEach((inv: any) => {
      if (inv.issue_date) months.add(inv.issue_date.substring(0, 7));
    });
    return Array.from(months).sort().reverse();
  }, [invoices]);

  // Histórico completo de movimentos (tab Movimentações)
  const { data: movementsHistory = [] } = useQuery({
    queryKey: ['stock_movements_history', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('stock_movements')
        .select(`
          id, article_id, client_id, billing_order_id, type, pieces, weight_kg, reason, is_second_quality, created_at,
          article:articles(name),
          client:clients(name),
          author:profiles!stock_movements_created_by_fkey(name, code),
          billing_order:billing_orders(of_number)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const [movFilterType, setMovFilterType] = useState<string>('all');
  const filteredMovements = useMemo(() => {
    return (movementsHistory as any[]).filter(m => movFilterType === 'all' || m.type === movFilterType);
  }, [movementsHistory, movFilterType]);

  const movementLabel: Record<string, { label: string; color: string }> = {
    reserve: { label: 'Reserva', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    release: { label: 'Libera reserva', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    out: { label: 'Saída (OF coletada)', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    in: { label: 'Entrada (estorno)', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
    adjust_in: { label: 'Ajuste +', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
    adjust_out: { label: 'Ajuste -', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" />
            {activeStockTab === 'segunda' ? 'Estoque de 2ª Qualidade' : 'Estoque de Malha'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeStockTab === 'segunda'
              ? 'Peças retornadas como 2ª qualidade — saldo independente do estoque principal'
              : 'Visão consolidada do saldo de artigos por cliente'}
          </p>
        </div>
        {isAdmin && (
          activeStockTab === 'segunda' ? (
            <Button size="sm" onClick={() => setManual2qOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Lançamento Manual (2ª)
            </Button>
          ) : activeStockTab === 'estoque' ? (
            <Button size="sm" onClick={() => setManualOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Lançamento Manual
            </Button>
          ) : null
        )}
      </div>

      {activeStockTab === 'segunda' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Entradas 2ª</div>
            <p className="text-xl font-bold text-foreground">{formatWeight(segundaKpis.entradaKg)}</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(segundaKpis.entradaRolls)} pç</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Saídas 2ª</div>
            <p className="text-xl font-bold text-foreground">{formatWeight(segundaKpis.saidaKg)}</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(segundaKpis.saidaRolls)} pç</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Layers className="h-3.5 w-3.5" />Saldo 2ª (kg)</div>
            <p className={cn('text-xl font-bold', segundaKpis.saldoKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(segundaKpis.saldoKg)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Scale className="h-3.5 w-3.5" />Saldo 2ª (peças)</div>
            <p className={cn('text-xl font-bold', segundaKpis.saldoRolls < 0 ? 'text-destructive' : 'text-success')}>{formatNumber(segundaKpis.saldoRolls)}</p>
          </CardContent></Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Produzido</div>
            <p className="text-xl font-bold text-foreground">{formatWeight(estoqueKpis.producedKg)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Entregue (OF coletadas)</div>
            <p className="text-xl font-bold text-foreground">{formatWeight(estoqueKpis.deliveredKg)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Lock className="h-3.5 w-3.5" />Reservado (OFs Pronto)</div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatWeight(estoqueKpis.reservedKg)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Disponível</div>
            <p className={cn('text-xl font-bold', estoqueKpis.availableKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(estoqueKpis.availableKg)}</p>
          </CardContent></Card>
        </div>
      )}

      {activeStockTab !== 'segunda' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Estoque calculado por <strong>Produção + Ajustes − OF Coletadas</strong>. NFs de Saída deixaram de descontar o estoque — a baixa real ocorre quando a OF é marcada como <strong>Coletada</strong>.
            O saldo parte de zero a partir do deploy; use <strong>Lançamento Manual</strong> para registrar saldo inicial ou ajustes.
            Estornos de OF agora têm duas opções: <strong>1ª qualidade</strong> (volta para este estoque) ou <strong>2ª qualidade</strong> (vai para a aba ao lado).
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeStockTab} onValueChange={(v) => setActiveStockTab(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="segunda">Estoque de 2ª</TabsTrigger>
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

      {malhaEstoque.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhum dado de estoque encontrado.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {malhaEstoque.map(group => (
            <Collapsible key={group.clientId}>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                      <CardTitle className="text-sm font-semibold">{group.clientName}</CardTitle>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Produzido: <span className="font-semibold text-foreground">{formatWeight(group.totalProducedKg)}</span></span>
                      <span>Reservado: <span className="font-semibold text-amber-600 dark:text-amber-400">{formatWeight(group.totalReservedKg)}</span></span>
                      <span>Disponível: <span className={cn('font-semibold', group.totalAvailableKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalAvailableKg)}</span></span>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Artigo</TableHead>
                          <TableHead className="text-xs text-right">Produzido kg</TableHead>
                          <TableHead className="text-xs text-right">Rolos</TableHead>
                          <TableHead className="text-xs text-right">Entregue kg</TableHead>
                          <TableHead className="text-xs text-right">Rolos</TableHead>
                          <TableHead className="text-xs text-right">Físico kg</TableHead>
                          <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">Rolos reservados</TableHead>
                          <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">Reservado kg</TableHead>
                          <TableHead className="text-xs text-right font-bold">Disponível kg</TableHead>
                          <TableHead className="text-xs text-right font-bold">Disp. Rolos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.articles.map((a: any) => (
                          <TableRow key={a.articleId}>
                            <TableCell className="text-xs">{a.articleName}</TableCell>
                            <TableCell className="text-xs text-right">{formatWeight(a.producedKg)}</TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(a.producedRolls)}</TableCell>
                            <TableCell className="text-xs text-right">{formatWeight(a.deliveredKg)}</TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(a.deliveredRolls)}</TableCell>
                            <TableCell className={cn('text-xs text-right', a.stockKg < 0 ? 'text-destructive' : a.stockKg === 0 ? 'text-muted-foreground' : 'text-foreground')}>
                              {formatWeight(a.stockKg)}
                              {a.stockKg < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                            </TableCell>
                            <TableCell className="text-xs text-right text-amber-700 dark:text-amber-400">
                              {formatNumber(a.reservedRolls)}
                            </TableCell>
                            <TableCell className="text-xs text-right text-amber-700 dark:text-amber-400">
                              {formatWeight(a.reservedKg)}
                            </TableCell>
                            <TableCell className={cn('text-xs text-right font-bold', a.availableKg < 0 ? 'text-destructive' : a.availableKg === 0 ? 'text-muted-foreground' : 'text-success')}>
                              {formatWeight(a.availableKg)}
                            </TableCell>
                            <TableCell className={cn('text-xs text-right font-bold', a.availableRolls < 0 ? 'text-destructive' : a.availableRolls === 0 ? 'text-muted-foreground' : 'text-success')}>
                              {formatNumber(a.availableRolls)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="movimentos" className="space-y-3 mt-4">
        </TabsContent>

        <TabsContent value="segunda" className="space-y-3 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={segMonth} onValueChange={setSegMonth}>
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
                  value={segClient === 'all' ? '' : segClient}
                  onValueChange={v => setSegClient(v || 'all')}
                  options={[{ value: 'all', label: 'Todos clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="Todos clientes"
                  searchPlaceholder="Buscar cliente..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                <SearchableSelect
                  value={segArticle === 'all' ? '' : segArticle}
                  onValueChange={v => setSegArticle(v || 'all')}
                  options={[{ value: 'all', label: 'Todos artigos' }, ...articles.map(a => ({ value: a.id, label: a.name }))]}
                  placeholder="Todos artigos"
                  searchPlaceholder="Buscar artigo..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(segClient !== 'all' || segArticle !== 'all' || segMonth !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSegClient('all'); setSegArticle('all'); setSegMonth('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {segundaEstoque.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum saldo de 2ª qualidade. Use <strong>Lançamento Manual (2ª)</strong> ou faça um estorno de OF como <strong>2ª qualidade</strong> em /billing-orders.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {segundaEstoque.map(group => (
                <Collapsible key={group.clientId}>
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          <CardTitle className="text-sm font-semibold">{group.clientName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Entradas: <span className="font-semibold text-foreground">{formatWeight(group.totalEntradaKg)}</span></span>
                          <span>Saídas: <span className="font-semibold text-foreground">{formatWeight(group.totalSaidaKg)}</span></span>
                          <span>Saldo: <span className={cn('font-semibold', group.totalSaldoKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalSaldoKg)}</span></span>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Artigo</TableHead>
                              <TableHead className="text-xs text-right">Entradas kg</TableHead>
                              <TableHead className="text-xs text-right">Entradas pç</TableHead>
                              <TableHead className="text-xs text-right">Saídas kg</TableHead>
                              <TableHead className="text-xs text-right">Saídas pç</TableHead>
                              <TableHead className="text-xs text-right font-bold">Saldo kg</TableHead>
                              <TableHead className="text-xs text-right font-bold">Saldo pç</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.articles.map((a: any) => (
                              <TableRow key={a.articleId}>
                                <TableCell className="text-xs">{a.articleName}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(a.entradaKg)}</TableCell>
                                <TableCell className="text-xs text-right">{formatNumber(a.entradaRolls)}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(a.saidaKg)}</TableCell>
                                <TableCell className="text-xs text-right">{formatNumber(a.saidaRolls)}</TableCell>
                                <TableCell className={cn('text-xs text-right font-bold', a.saldoKg < 0 ? 'text-destructive' : a.saldoKg === 0 ? 'text-muted-foreground' : 'text-success')}>{formatWeight(a.saldoKg)}</TableCell>
                                <TableCell className={cn('text-xs text-right font-bold', a.saldoRolls < 0 ? 'text-destructive' : a.saldoRolls === 0 ? 'text-muted-foreground' : 'text-success')}>{formatNumber(a.saldoRolls)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movimentos_real" className="space-y-3 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={movFilterType} onValueChange={setMovFilterType}>
                  <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="reserve">Reserva (OF Pronta)</SelectItem>
                    <SelectItem value="release">Liberação de reserva</SelectItem>
                    <SelectItem value="out">Saída (OF coletada)</SelectItem>
                    <SelectItem value="in">Entrada (estorno)</SelectItem>
                    <SelectItem value="adjust_in">Ajuste manual +</SelectItem>
                    <SelectItem value="adjust_out">Ajuste manual -</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">Últimos 500 movimentos</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data/Hora</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Artigo</TableHead>
                    <TableHead className="text-xs">OF</TableHead>
                    <TableHead className="text-xs text-right">Peças</TableHead>
                    <TableHead className="text-xs text-right">Peso (kg)</TableHead>
                    <TableHead className="text-xs">Motivo</TableHead>
                    <TableHead className="text-xs">Autor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">Sem movimentos.</TableCell></TableRow>
                  )}
                  {filteredMovements.map((m: any) => {
                    const meta = movementLabel[m.type] || { label: m.type, color: 'bg-muted text-foreground' };
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={cn('text-[10px]', meta.color)}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{m.client?.name || '—'}</TableCell>
                        <TableCell className="text-xs">{m.article?.name || '—'}</TableCell>
                        <TableCell className="text-xs">{m.billing_order?.of_number ? `#${m.billing_order.of_number}` : '—'}</TableCell>
                        <TableCell className="text-xs text-right">{formatNumber(m.pieces)}</TableCell>
                        <TableCell className="text-xs text-right">{formatWeight(Number(m.weight_kg))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={m.reason || ''}>{m.reason || '—'}</TableCell>
                        <TableCell className="text-xs">{m.author?.name ? `${m.author.name} #${m.author.code}` : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <ManualStockEntryModal
          open={manualOpen}
          onOpenChange={setManualOpen}
          clients={clients}
          articles={articles as any}
          onSaved={() => refetchMovements()}
        />
      )}
    </div>
  );
}
