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
        .select('id, article_id, type, pieces, weight_kg, created_at')
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
      if (!['adjust_in', 'adjust_out', 'out', 'in', 'reserve', 'release'].includes(mv.type)) continue;
      const art = articles.find(a => a.id === mv.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(mv.article_id)) artMap.set(mv.article_id, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0, reservedKg: 0, reservedRolls: 0 });
      const entry = artMap.get(mv.article_id)!;
      const kg = Number(mv.weight_kg);
      const pc = Number(mv.pieces);
      if (mv.type === 'adjust_in' || mv.type === 'in') {
        entry.producedKg += Number(mv.weight_kg);
        entry.producedRolls += Number(mv.pieces);
      } else if (mv.type === 'adjust_out') {
        entry.producedKg -= Number(mv.weight_kg);
        entry.producedRolls -= Number(mv.pieces);
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
  }), { producedKg: 0, deliveredKg: 0, stockKg: 0, stockRolls: 0 }), [malhaEstoque]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(format(new Date(), 'yyyy-MM'));
    invoices.forEach((inv: any) => {
      if (inv.issue_date) months.add(inv.issue_date.substring(0, 7));
    });
    return Array.from(months).sort().reverse();
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" />
            Estoque de Malha
          </h1>
          <p className="text-sm text-muted-foreground">Visão consolidada do saldo de artigos por cliente</p>
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
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Produzido</div>
          <p className="text-xl font-bold text-foreground">{formatWeight(estoqueKpis.producedKg)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Entregue</div>
          <p className="text-xl font-bold text-foreground">{formatWeight(estoqueKpis.deliveredKg)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Em Estoque</div>
          <p className={cn('text-xl font-bold', estoqueKpis.stockKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(estoqueKpis.stockKg)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Layers className="h-3.5 w-3.5" />Rolos</div>
          <p className={cn('text-xl font-bold', estoqueKpis.stockRolls < 0 ? 'text-destructive' : 'text-success')}>{formatNumber(estoqueKpis.stockRolls)}</p>
        </CardContent></Card>
      </div>

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
                      <span>Estoque: <span className={cn('font-semibold', group.totalStockKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalStockKg)}</span></span>
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
                          <TableHead className="text-xs text-right font-bold">Estoque kg</TableHead>
                          <TableHead className="text-xs text-right font-bold">Rolos</TableHead>
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
                            <TableCell className={cn('text-xs text-right font-bold', a.stockKg < 0 ? 'text-destructive' : a.stockKg === 0 ? 'text-muted-foreground' : 'text-success')}>
                              {formatWeight(a.stockKg)}
                              {a.stockKg < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                            </TableCell>
                            <TableCell className={cn('text-xs text-right font-bold', a.stockRolls < 0 ? 'text-destructive' : a.stockRolls === 0 ? 'text-muted-foreground' : 'text-success')}>
                              {formatNumber(a.stockRolls)}
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
