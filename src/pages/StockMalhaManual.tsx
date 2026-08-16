import React, { useState } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { 
  Package, Scale, Warehouse, Plus, ChevronDown, Loader2, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatWeight, formatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ManualStockEntryModal } from '@/components/ManualStockEntryModal';

export default function StockMalhaManual() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const { data: stockData, isLoading } = useQuery({
    queryKey: ['manual_stock_estoque_independent', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_estoque_independent', {
        p_company_id: companyId
      });
      if (error) throw error;
      return data as {
        groups: any[];
        kpis: { stockKg: number; stockRolls: number; inKg: number; inPc: number; outKg: number; outPc: number };
      };
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const kpis = stockData?.kpis || { stockKg: 0, stockRolls: 0, inKg: 0, inPc: 0, outKg: 0, outPc: 0 };
  const groups = stockData?.groups || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* leia o arquivo mestre.md (OBRIGATÓRIO LER ANTES DE ATUALIZAR O PROJETO) e prossiga -> Esteque Malha (Manual) independente */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" />
            Estoque de Malha (Manual)
          </h1>
          <p className="text-muted-foreground">Visão consolidada do saldo manual de artigos por cliente</p>
        </div>
        <Button onClick={() => setManualOpen(true)} className="w-full md:w-auto gap-2">
          <Plus className="h-4 w-4" />
          Lançamento Manual
        </Button>
      </div>

      <Alert variant="info" className="bg-primary/5 border-primary/20">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs text-primary/80">
          Este estoque é <strong>100% independente</strong>. Entradas e saídas são registradas apenas manualmente aqui, sem ligação com Produção ou Ordens de Faturamento (OF).
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2 uppercase tracking-wider">
              <Package className="h-3.5 w-3.5" /> Total Produzido (Manual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{formatWeight(kpis.inKg)} kg</div>
            <p className="text-xs text-muted-foreground mt-1">{kpis.inPc} peças registradas</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2 uppercase tracking-wider">
              <Scale className="h-3.5 w-3.5" /> Total Saída (Manual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{formatWeight(kpis.outKg)} kg</div>
            <p className="text-xs text-muted-foreground mt-1">{kpis.outPc} peças retiradas</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-primary flex items-center gap-2 uppercase tracking-wider">
              <Warehouse className="h-3.5 w-3.5" /> Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold tracking-tight",
              kpis.stockKg > 0 ? "text-primary" : "text-muted-foreground"
            )}>
              {formatWeight(kpis.stockKg)} kg
            </div>
            <p className="text-xs text-primary/80 mt-1">{kpis.stockRolls} peças disponíveis</p>
          </CardContent>
        </Card>
      </div>

      {/* Listagem Estilo Estoque Clientes */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Carregando estoque manual...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <Warehouse className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-medium">Nenhum saldo manual registrado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Use o botão "Lançamento Manual" para começar.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {groups.map((client) => (
                <Collapsible
                  key={client.clientId}
                  open={expandedClient === client.clientId}
                  onOpenChange={() => setExpandedClient(expandedClient === client.clientId ? null : client.clientId)}
                >
                  <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-accent/5 transition-colors group">
                    <div className="flex items-center gap-3">
                      <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        expandedClient === client.clientId && "rotate-180"
                      )} />
                      <span className="font-semibold text-sm tracking-tight">{client.clientName}</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-6 text-xs">
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground/60 uppercase text-[10px] font-bold tracking-tighter">Produzido</span>
                        <span className="font-medium">{formatWeight(client.totalInKg)} kg</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-primary/60 uppercase text-[10px] font-bold tracking-tighter">Disponível</span>
                        <span className={cn(
                          "font-bold",
                          client.totalStockKg > 0 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {formatWeight(client.totalStockKg)} kg
                        </span>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="bg-accent/5 px-4 pb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="h-8 text-[10px] uppercase font-bold tracking-wider">Artigo</TableHead>
                            <TableHead className="h-8 text-[10px] uppercase font-bold tracking-wider text-right">Produzido (kg)</TableHead>
                            <TableHead className="h-8 text-[10px] uppercase font-bold tracking-wider text-right">Produzido (pç)</TableHead>
                            <TableHead className="h-8 text-[10px] uppercase font-bold tracking-wider text-right text-primary">Disp. (kg)</TableHead>
                            <TableHead className="h-8 text-[10px] uppercase font-bold tracking-wider text-right text-primary">Disp. (pç)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {client.articles.map((art) => (
                            <React.Fragment key={art.articleId}>
                              <TableRow 
                                className="cursor-pointer hover:bg-accent/10 transition-colors border-border/40"
                                onClick={() => setExpandedArticle(expandedArticle === `${client.clientId}-${art.articleId}` ? null : `${client.clientId}-${art.articleId}`)}
                              >
                                <TableCell className="py-3 text-xs font-medium flex items-center gap-2">
                                  <ChevronDown className={cn(
                                    "h-3 w-3 text-muted-foreground transition-transform",
                                    expandedArticle === `${client.clientId}-${art.articleId}` && "rotate-180"
                                  )} />
                                  {art.articleName}
                                </TableCell>
                                <TableCell className="py-3 text-right text-xs">{formatWeight(art.inKg)} kg</TableCell>
                                <TableCell className="py-3 text-right text-xs">{art.inPc}</TableCell>
                                <TableCell className="py-3 text-right text-xs font-bold text-primary">{formatWeight(art.stockKg)} kg</TableCell>
                                <TableCell className="py-3 text-right text-xs font-bold text-primary">{art.stockRolls}</TableCell>
                              </TableRow>
                              
                              {expandedArticle === `${client.clientId}-${art.articleId}` && (
                                <TableRow className="bg-card/30 hover:bg-card/30 border-none">
                                  <TableCell colSpan={5} className="p-0">
                                    <div className="px-8 py-2 space-y-1">
                                      {art.byMachine.map((mach, mIdx) => (
                                        <div key={mIdx} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0 text-[11px]">
                                          <span className="text-muted-foreground">↳ {mach.machineName}</span>
                                          <div className="flex gap-4">
                                            <span>{formatWeight(mach.inKg)} kg</span>
                                            <span className="font-bold text-primary">{formatWeight(mach.stockKg)} kg</span>
                                          </div>
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
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ManualStockEntryModal 
        open={manualOpen} 
        onOpenChange={setManualOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['manual_stock_estoque_independent'] });
        }}
      />
    </div>
  );
}
