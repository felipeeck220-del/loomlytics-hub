import React, { useState, useMemo, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/SearchableSelect';
import { formatWeight } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { 
  Package, Scale, Warehouse, Plus, Search, CalendarDays, Loader2, History, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ManualStockEntryModal } from '@/components/ManualStockEntryModal';

export default function StockMalhaManual() {
  const { getClients, getArticles, getMachines } = useSharedCompanyData();
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'estoque' | 'movimentacoes'>('estoque');
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  
  const [filterClient, setFilterClient] = useState('all');
  const [filterArticle, setFilterArticle] = useState('all');
  const [searchMov, setSearchMov] = useState('');
  
  const clients = getClients();
  const articles = getArticles();
  const machines = getMachines();

  // 1. Fetch Estudo Agregado
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['manual_stock_estoque_independent', companyId, filterClient, filterArticle],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_estoque_independent', {
        p_company_id: companyId,
        p_client_id: filterClient === 'all' ? null : filterClient,
        p_article_id: filterArticle === 'all' ? null : filterArticle
      });
      if (error) throw error;
      return data as {
        groups: any[];
        kpis: { stockKg: number; stockRolls: number };
      };
    },
    enabled: !!companyId
  });

  // 2. Fetch Movimentações (simplificado sem paginação complexa por agora)
  const { data: movementsData, isLoading: movLoading } = useQuery({
    queryKey: ['manual_stock_movements_independent', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_movements_independent', {
        p_company_id: companyId,
        p_page: 1,
        p_page_size: 50
      });
      if (error) throw error;
      return data as { rows: any[]; total_count: number };
    },
    enabled: !!companyId && activeTab === 'movimentacoes'
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['manual_stock_estoque_independent'] });
    queryClient.invalidateQueries({ queryKey: ['manual_stock_movements_independent'] });
  };

  const filteredMovements = useMemo(() => {
    if (!movementsData?.rows) return [];
    const s = searchMov.toLowerCase();
    return movementsData.rows.filter(m => 
      m.client?.toLowerCase().includes(s) || 
      m.article?.toLowerCase().includes(s) || 
      m.reason?.toLowerCase().includes(s)
    );
  }, [movementsData, searchMov]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Estoque Malha (Manual)</h1>
          <p className="text-muted-foreground text-sm">Controle logístico independente de faturamento e produção</p>
        </div>
        <Button onClick={() => setEntryModalOpen(true)} className="btn-gradient w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-glass overflow-hidden relative">
          <CardContent className="p-4 flex flex-col justify-between min-h-[90px]">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Scale className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Total em Peso</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-bold text-foreground leading-none">
                {formatWeight(stockData?.kpis.stockKg || 0)}
              </span>
              <span className="text-[10px] text-muted-foreground mt-1">Quilos em estoque</span>
            </div>
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Scale className="h-10 w-10" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-glass overflow-hidden relative">
          <CardContent className="p-4 flex flex-col justify-between min-h-[90px]">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Total em Peças</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-bold text-foreground leading-none">
                {stockData?.kpis.stockRolls || 0}
              </span>
              <span className="text-[10px] text-muted-foreground mt-1">Rolos em estoque</span>
            </div>
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Package className="h-10 w-10" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-auto">
          <TabsTrigger value="estoque" className="py-2.5">
            <Warehouse className="h-4 w-4 mr-2" /> Estoque Atual
          </TabsTrigger>
          <TabsTrigger value="movimentacoes" className="py-2.5">
            <History className="h-4 w-4 mr-2" /> Movimentações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estoque" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SearchableSelect
              value={filterClient}
              onValueChange={setFilterClient}
              options={[{ value: 'all', label: 'Todos os Clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
              placeholder="Filtrar por cliente"
            />
            <SearchableSelect
              value={filterArticle}
              onValueChange={setFilterArticle}
              options={[{ value: 'all', label: 'Todos os Artigos' }, ...articles.map(a => ({ value: a.id, label: a.name }))]}
              placeholder="Filtrar por artigo"
            />
          </div>

          {stockLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Calculando saldos...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stockData?.groups.map(group => (
                <Card key={group.clientId} className="card-glass border-l-4 border-l-primary/30">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-bold">{group.clientName}</CardTitle>
                      <div className="flex gap-3 text-xs">
                        <span className="text-muted-foreground">Total: <b className="text-foreground">{formatWeight(group.totalStockKg)}</b></span>
                        <span className="text-muted-foreground">Peças: <b className="text-foreground">{group.totalStockRolls}</b></span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.articles.map((art: any) => (
                        <div key={art.articleId} className="p-3 rounded-lg bg-background/50 border border-border/50 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">{art.articleName}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Saldo Disponível</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-primary">{formatWeight(art.stockKg)}</p>
                            <p className="text-[10px] text-muted-foreground">{art.stockRolls} peças</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!stockLoading && stockData?.groups.length === 0 && (
                <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground">Nenhum saldo em estoque encontrado.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movimentacoes" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por cliente, artigo ou motivo..." 
              value={searchMov}
              onChange={e => setSearchMov(e.target.value)}
              className="pl-9"
            />
          </div>

          {movLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando histórico...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMovements.map((mov: any) => (
                <div key={mov.id} className="p-4 card-glass flex flex-col gap-2 relative overflow-hidden">
                  <div className="flex items-start justify-between z-10">
                    <div className="flex gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                        mov.type === 'in' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      )}>
                        {mov.type === 'in' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{mov.article}</p>
                        <p className="text-xs text-muted-foreground">{mov.client}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-bold", mov.type === 'in' ? "text-success" : "text-destructive")}>
                        {mov.type === 'in' ? '+' : '-'}{formatWeight(mov.weight_kg)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{mov.pieces} peças</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1 pt-2 border-t border-border/50 text-[10px] sm:text-xs z-10">
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {new Date(mov.created_at).toLocaleString('pt-BR')}</span>
                      <span className="bg-muted/50 px-2 py-0.5 rounded italic">Por: {mov.author || 'Sistema'}</span>
                    </div>
                    {mov.reason && <p className="text-foreground/70 line-clamp-1 italic text-right flex-1 ml-4">"{mov.reason}"</p>}
                  </div>
                </div>
              ))}
              {filteredMovements.length === 0 && (
                <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed">
                  <p className="text-muted-foreground">Nenhuma movimentação encontrada.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ManualStockEntryModal 
        open={entryModalOpen}
        onOpenChange={setEntryModalOpen}
        clients={clients}
        articles={articles}
        machines={machines}
        onSaved={refreshAll}
      />
    </div>
  );
}
