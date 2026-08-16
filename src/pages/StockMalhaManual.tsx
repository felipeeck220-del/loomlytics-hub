import React, { useState, useMemo, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/SearchableSelect';
import { formatWeight } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { 
  Package, Scale, Warehouse, Plus, Search, Loader2, History, ArrowUpRight, ChevronDown
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ManualStockEntryModal } from '@/components/ManualStockEntryModal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function StockMalhaManual() {
  const { getClients, getArticles, getMachines } = useSharedCompanyData();
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'estoque' | 'movimentacoes'>('estoque');
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  
  const [filterClient, setFilterClient] = useState('all');
  const [filterArticle, setFilterArticle] = useState('all');
  const [searchMov, setSearchMov] = useState('');
  
  const clients = getClients() || [];
  const articles = getArticles() || [];
  const machines = getMachines() || [];

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
        kpis: { stockKg: number; stockRolls: number; inKg: number; inPc: number; outKg: number; outPc: number };
      };
    },
    enabled: !!companyId
  });

  const { data: movementsData, isLoading: movLoading } = useQuery({
    queryKey: ['manual_stock_movements_independent', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_movements_independent', {
        p_company_id: companyId,
        p_page: 1,
        p_page_size: 100
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

  const kpis = stockData?.kpis || { stockKg: 0, stockRolls: 0, inKg: 0, inPc: 0, outKg: 0, outPc: 0 };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground">Estoque de Malha (Manual)</h1>
          </div>
          <p className="text-muted-foreground text-sm">Visão consolidada do saldo de artigos por cliente (Manual e Independente)</p>
        </div>
        <Button onClick={() => setEntryModalOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white w-full sm:w-auto h-11 px-6 shadow-lg shadow-emerald-500/20 rounded-md">
          <Plus className="h-5 w-5 mr-2" /> Lançamento Manual
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-glass border-none bg-background/40">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Entradas</span>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-foreground leading-none">{kpis.inPc} pç</span>
              <p className="text-[10px] text-muted-foreground mt-1">{formatWeight(kpis.inKg)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-glass border-none bg-background/40">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <History className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Entregue (Saídas)</span>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-foreground leading-none">{kpis.outPc} pç</span>
              <p className="text-[10px] text-muted-foreground mt-1">{formatWeight(kpis.outKg)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-glass border-none bg-background/40">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Warehouse className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-amber-500">Reservado</span>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-amber-500 leading-none">0 pç</span>
              <p className="text-[10px] text-muted-foreground mt-1">0,00 kg</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-glass border-none bg-background/40">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Scale className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-primary">Disponível</span>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-primary leading-none">{kpis.stockRolls} pç</span>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                <span>{formatWeight(kpis.stockKg)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <TabsList className="bg-[#1A1F2C] border border-white/5 p-1 h-12 inline-flex">
          <TabsTrigger 
            value="estoque" 
            className="px-8 data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-md transition-all text-muted-foreground"
          >
            Estoque
          </TabsTrigger>
          <TabsTrigger 
            value="movimentacoes" 
            className="px-8 data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-md transition-all text-muted-foreground"
          >
            Movimentações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estoque" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SearchableSelect
              value="Todo período"
              onValueChange={() => {}}
              options={[{ value: 'Todo período', label: 'Todo período' }]}
              placeholder="Período"
            />
            <SearchableSelect
              value={filterClient}
              onValueChange={setFilterClient}
              options={[{ value: 'all', label: 'Todos clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
              placeholder="Todos clientes"
            />
            <SearchableSelect
              value={filterArticle}
              onValueChange={setFilterArticle}
              options={[{ value: 'all', label: 'Todos artigos' }, ...articles.map(a => ({ value: a.id, label: a.name }))]}
              placeholder="Todos artigos"
            />
          </div>

          {stockLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando estoque...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stockData?.groups.map(group => (
                <Collapsible 
                  key={group.clientId} 
                  open={expandedClient === group.clientId} 
                  onOpenChange={() => setExpandedClient(expandedClient === group.clientId ? null : group.clientId)}
                  className="card-glass border-none bg-background/40 overflow-hidden"
                >
                  <CollapsibleTrigger asChild>
                    <div className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", expandedClient === group.clientId && "rotate-180")} />
                        <span className="font-bold text-lg">{group.clientName}</span>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-50" />
                      </div>
                      <div className="hidden sm:flex items-center gap-6 text-xs text-muted-foreground">
                        <span>Entradas: <b className="text-foreground">{group.totalInPc} pç</b></span>
                        <span>Disponível: <b className="text-primary">{group.totalStockRolls} pç</b></span>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="px-4 pb-4 overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                          <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <th className="py-3 font-medium">Artigo</th>
                            <th className="py-3 font-medium text-center">Produzido kg</th>
                            <th className="py-3 font-medium text-center">Entregue kg</th>
                            <th className="py-3 font-medium text-center">Físico kg</th>
                            <th className="py-3 font-medium text-center">Reservado kg</th>
                            <th className="py-3 font-medium text-center text-primary">Disponível kg</th>
                            <th className="py-3 font-medium text-center">Rolos prod.</th>
                            <th className="py-3 font-medium text-center">Rolos ent.</th>
                            <th className="py-3 font-medium text-center">Rolos físicos</th>
                            <th className="py-3 font-medium text-center">Reservado</th>
                            <th className="py-3 font-medium text-center text-primary">Disponível</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.articles.map((art: any) => (
                            <React.Fragment key={art.articleId}>
                              <tr className="border-b border-border/30 group">
                                <td className="py-4">
                                  <div className="flex items-center gap-2">
                                    <ChevronDown 
                                      className={cn("h-4 w-4 text-muted-foreground cursor-pointer transition-transform", expandedArticle === art.articleId && "rotate-180")} 
                                      onClick={() => setExpandedArticle(expandedArticle === art.articleId ? null : art.articleId)}
                                    />
                                    <span className="font-semibold text-sm">{art.articleName}</span>
                                    <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </td>
                                <td className="py-4 text-center text-sm font-medium">{formatWeight(art.inKg)}</td>
                                <td className="py-4 text-center text-sm font-medium">{formatWeight(art.outKg)}</td>
                                <td className="py-4 text-center text-sm font-bold">{formatWeight(art.stockKg)}</td>
                                <td className="py-4 text-center text-sm text-amber-500/70">0,00 kg</td>
                                <td className="py-4 text-center text-sm font-medium text-primary">{formatWeight(art.stockKg)}</td>
                                <td className="py-4 text-center text-sm font-bold">{art.inPc}</td>
                                <td className="py-4 text-center text-sm font-medium">{art.outPc}</td>
                                <td className="py-4 text-center text-sm font-bold">{art.stockRolls}</td>
                                <td className="py-4 text-center text-sm text-amber-500/70">0 pç</td>
                                <td className="py-4 text-center text-sm font-bold text-primary">{art.stockRolls}</td>
                              </tr>
                              
                              {expandedArticle === art.articleId && art.byMachine?.map((mac: any, idx: number) => (
                                <tr key={idx} className="bg-white/5 text-[11px] border-b border-border/10">
                                  <td className="py-3 pl-8">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <div className="w-3 h-3 border-l border-b border-muted-foreground/30 rounded-bl" />
                                      <span>{mac.machineName}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 text-center text-muted-foreground">{formatWeight(mac.inKg)}</td>
                                  <td className="py-3 text-center text-muted-foreground">{formatWeight(mac.outKg)}</td>
                                  <td className="py-3 text-center text-muted-foreground font-bold">{formatWeight(mac.stockKg)}</td>
                                  <td className="py-3 text-center text-muted-foreground/50">0,00 kg</td>
                                  <td className="py-3 text-center text-muted-foreground text-primary/70">{formatWeight(mac.stockKg)}</td>
                                  <td className="py-3 text-center text-muted-foreground font-bold">{mac.inPc}</td>
                                  <td className="py-3 text-center text-muted-foreground">{mac.outPc}</td>
                                  <td className="py-3 text-center text-muted-foreground font-bold">{mac.stockRolls}</td>
                                  <td className="py-3 text-center text-muted-foreground/50">0 pç</td>
                                  <td className="py-3 text-center text-muted-foreground font-bold text-primary/70">{mac.stockRolls}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              {stockData?.groups.length === 0 && (
                <div className="text-center py-20 bg-background/20 rounded-xl border border-dashed border-border/50">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground font-medium">Nenhum saldo disponível.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Realize um lançamento manual para iniciar o estoque.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movimentacoes" className="space-y-4 mt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por cliente, artigo ou motivo..." 
              value={searchMov}
              onChange={e => setSearchMov(e.target.value)}
              className="pl-10 h-11 bg-background/40 border-border/50"
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
                <div key={mov.id} className="p-4 card-glass border-none bg-background/40 flex flex-col gap-2 relative overflow-hidden group hover:bg-white/5 transition-all">
                  <div className="flex items-start justify-between z-10">
                    <div className="flex gap-4">
                      <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner",
                        mov.type === 'in' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {mov.type === 'in' ? <Plus className="h-6 w-6" /> : <History className="h-6 w-6" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-foreground">{mov.article}</h4>
                        <p className="text-sm text-muted-foreground">{mov.client} • {mov.machine}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{new Date(mov.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-lg font-bold", mov.type === 'in' ? "text-emerald-500" : "text-red-500")}>
                        {mov.type === 'in' ? '+' : '-'}{mov.pieces} pç
                      </div>
                      <div className="text-xs text-muted-foreground">{formatWeight(mov.weight_kg)}</div>
                      {mov.reason && (
                        <div className="mt-1 text-[10px] text-muted-foreground/80 italic">
                          "{mov.reason}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredMovements.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border/50 rounded-lg">
                  Nenhuma movimentação encontrada.
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
