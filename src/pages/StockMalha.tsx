import React, { useState, useMemo, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useQueryClient } from '@tanstack/react-query';
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
import { Plus, CalendarDays, Download, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { toast } from 'sonner';

export default function StockMalha() {
  const { 
    getProductions, getClients, getArticles, getYarnTypes, getMachines 
  } = useSharedCompanyData();
  
  const productions = getProductions();
  const clients = getClients();
  const articles = getArticles();
  const yarnTypes = getYarnTypes();
  const machines = getMachines();
  const machineNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of machines) m.set(x.id, x.name);
    return m;
  }, [machines]);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

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

  // Filtro de data para a coluna "Entregue" (apenas afeta Entregue kg / Rolos entregues)
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [entregueRange, setEntregueRange] = useState<{ from: string; to: string }>({
    from: todayStr,
    to: todayStr,
  });

  // Hooks for data calculation
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const { role } = usePermissions();
  const isAdmin = role === 'admin';
  const [manualOpen, setManualOpen] = useState(false);
  const [manual2qOpen, setManual2qOpen] = useState(false);
  const [activeStockTab, setActiveStockTab] = useState<'estoque' | 'segunda' | 'movimentos'>('estoque');
  const queryClient = useQueryClient();
  const refreshAllStock = () => {
    queryClient.invalidateQueries({ queryKey: ['stock_movements_for_stock', companyId] });
    queryClient.invalidateQueries({ queryKey: ['stock_movements_history', companyId] });
  };
  // Reage a inserts diretos em stock_movements vindos de outros módulos (ex.: paletes em OF)
  useEffect(() => {
    const handler = () => refreshAllStock();
    window.addEventListener('stock-movements-changed', handler);
    return () => window.removeEventListener('stock-movements-changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  // Filtros independentes para 2ª qualidade
  const [segClient, setSegClient] = useState('all');
  const [segArticle, setSegArticle] = useState('all');
  const [segMonth, setSegMonth] = useState('all');

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices_for_stock', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: invoiceItems = [], isLoading: invoiceItemsLoading } = useQuery({
    queryKey: ['invoice_items_for_stock', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoice_items').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: stockMovements = [], isLoading: stockMovementsLoading } = useQuery({
    queryKey: ['stock_movements_for_stock', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('stock_movements')
        .select('id, article_id, client_id, billing_order_id, machine_id, type, pieces, weight_kg, is_second_quality, created_at')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Data de corte do estoque: produções/movimentações anteriores são ignoradas no cálculo
  // (mas continuam preservadas no histórico para relatórios/dashboard).
  const { data: stockCutoffDate, isLoading: cutoffLoading } = useQuery({
    queryKey: ['stock_cutoff_date', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('company_settings')
        .select('stock_cutoff_date')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data?.stock_cutoff_date as string | null) || null;
    },
    enabled: !!companyId,
  });

  // Empresa (logo + nome) para o PDF
  const { data: companyInfo } = useQuery({
    queryKey: ['company_info_for_stock_pdf', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('name, logo_url').eq('id', companyId).maybeSingle();
      if (error) throw error;
      return data as { name: string | null; logo_url: string | null } | null;
    },
    enabled: !!companyId,
  });

  // Aguardar TODAS as fontes de dados do estoque antes de renderizar, para não exibir
  // valores "intermediários" (ex.: Produzido sem o desconto de Entregue) que mudam após o load.
  const isStockLoading = stockMovementsLoading || cutoffLoading || invoicesLoading || invoiceItemsLoading;

  // Re-implementing the malhaEstoque logic from Invoices.tsx
  const malhaEstoque = useMemo(() => {
    // deliveredKg/Rolls = entregue NO RANGE (apenas para exibição da coluna Entregue).
    // deliveredKgTotal/RollsTotal = entregue ACUMULADO (usado para calcular Estoque/Disponível,
    // que NÃO devem oscilar conforme o usuário muda o filtro de período).
    const map = new Map<string, Map<string, { producedKg: number; producedRolls: number; deliveredKg: number; deliveredRolls: number; deliveredKgTotal: number; deliveredRollsTotal: number; reservedKg: number; reservedRolls: number }>>();
    const matchMonth = (date: string) => estoqueMonth === 'all' || date.startsWith(estoqueMonth);
    // Corte: ignora qualquer produção/movimentação com data < stockCutoffDate
    const cutoff = stockCutoffDate || '';
    const afterCutoffDate = (date: string) => !cutoff || date >= cutoff;
    const afterCutoffTs = (createdAt: string) => !cutoff || format(new Date(createdAt), 'yyyy-MM-dd') >= cutoff;

    // 1. Production
    for (const prod of productions) {
      if (!matchMonth(prod.date)) continue;
      if (!afterCutoffDate(prod.date)) continue;
      // Ignorar produções sem máquina nas contas de estoque
      if (!prod.machine_id) continue;
      const art = articles.find(a => a.id === prod.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(prod.article_id!)) artMap.set(prod.article_id!, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0, deliveredKgTotal: 0, deliveredRollsTotal: 0, reservedKg: 0, reservedRolls: 0 });
      const entry = artMap.get(prod.article_id!)!;
      entry.producedKg += Number(prod.weight_kg);
      entry.producedRolls += Number(prod.rolls_produced);
    }

    // 2. NFs de Saída NÃO descontam mais estoque a partir do deploy de OF×Estoque.
    //    A baixa real ocorre via stock_movements.out gerado pela OF coletada (§9 do plano).

    // 3. Stock movements (manual adjustments) — add to producedKg/Rolls so it flows into Estoque
    const monthMatchesMovement = (createdAt: string) => estoqueMonth === 'all' || createdAt.startsWith(estoqueMonth);
    // Filtro do intervalo de "Entregue" (compara dia local do created_at com o range escolhido)
    const entregueFrom = entregueRange.from || '';
    const entregueTo = entregueRange.to || entregueFrom;
    const matchesEntregueRange = (createdAt: string) => {
      if (!entregueFrom) return true;
      const d = format(new Date(createdAt), 'yyyy-MM-dd');
      return d >= entregueFrom && d <= entregueTo;
    };
    for (const mv of stockMovements as any[]) {
      if (!monthMatchesMovement(mv.created_at)) continue;
      if (!afterCutoffTs(mv.created_at)) continue;
      // Movimentos de 2ª qualidade não afetam o estoque principal
      if (mv.is_second_quality) continue;
      if (!['adjust_in', 'adjust_out', 'out', 'in', 'reserve', 'release'].includes(mv.type)) continue;
      // Ignorar movimentos sem máquina nas contas de estoque
      if (!mv.machine_id) continue;
      const art = articles.find(a => a.id === mv.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(mv.article_id)) artMap.set(mv.article_id, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0, deliveredKgTotal: 0, deliveredRollsTotal: 0, reservedKg: 0, reservedRolls: 0 });
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
          // total (sempre): afeta cálculo de Estoque/Disponível
          entry.deliveredKgTotal -= kg;
          entry.deliveredRollsTotal -= pc;
          // exibição: só desconta da coluna Entregue se cair no range filtrado
          if (matchesEntregueRange(mv.created_at)) {
            entry.deliveredKg -= kg;
            entry.deliveredRolls -= pc;
          }
        } else {
          entry.producedKg += kg;
          entry.producedRolls += pc;
        }
      } else if (mv.type === 'out') {
        // Saída por OF coletada — conta como entregue (não desconta o "Produzido" exibido).
        entry.deliveredKgTotal += Number(mv.weight_kg);
        entry.deliveredRollsTotal += Number(mv.pieces);
        if (matchesEntregueRange(mv.created_at)) {
          entry.deliveredKg += Number(mv.weight_kg);
          entry.deliveredRolls += Number(mv.pieces);
        }
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
      let tPK = 0, tPR = 0, tDK = 0, tDR = 0, tDKT = 0, tDRT = 0, tRK = 0, tRR = 0;
      artMap.forEach((vals, articleId) => {
        if (estoqueArticle !== 'all' && articleId !== estoqueArticle) return;
        const article = articles.find(a => a.id === articleId);
        // Estoque/Disponível usam o TOTAL entregue (não o filtrado pelo range)
        const stockKg = vals.producedKg - vals.deliveredKgTotal;
        const stockRolls = vals.producedRolls - vals.deliveredRollsTotal;
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
        tDKT += vals.deliveredKgTotal; tDRT += vals.deliveredRollsTotal;
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
          totalStockKg: tPK - tDKT, totalStockRolls: tPR - tDRT,
          totalAvailableKg: (tPK - tDKT) - tRK, totalAvailableRolls: (tPR - tDRT) - tRR,
        });
      }
    });
    return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [productions, invoices, invoiceItems, stockMovements, articles, clients, estoqueClient, estoqueArticle, estoqueMonth, entregueRange, stockCutoffDate]);

  const estoqueKpis = useMemo(() => malhaEstoque.reduce((acc, g) => ({
    producedKg: acc.producedKg + g.totalProducedKg,
    deliveredKg: acc.deliveredKg + g.totalDeliveredKg,
    stockKg: acc.stockKg + g.totalStockKg,
    stockRolls: acc.stockRolls + g.totalStockRolls,
    reservedKg: acc.reservedKg + g.totalReservedKg,
    availableKg: acc.availableKg + g.totalAvailableKg,
  }), { producedKg: 0, deliveredKg: 0, stockKg: 0, stockRolls: 0, reservedKg: 0, availableKg: 0 }), [malhaEstoque]);

  // Quebra por máquina, por artigo. Chave: `${clientId}::${articleId}` → Map(machineKey → totals)
  // machineKey = machine_id ou '__none__' quando não informado.
  const byMachineMap = useMemo(() => {
    type MachineTotals = { producedKg: number; producedRolls: number; deliveredKg: number; deliveredRolls: number; deliveredKgTotal: number; deliveredRollsTotal: number; reservedKg: number; reservedRolls: number };
    const out = new Map<string, Map<string, MachineTotals>>();
    const ensure = (k: string, mk: string) => {
      if (!out.has(k)) out.set(k, new Map());
      const inner = out.get(k)!;
      if (!inner.has(mk)) inner.set(mk, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0, deliveredKgTotal: 0, deliveredRollsTotal: 0, reservedKg: 0, reservedRolls: 0 });
      return inner.get(mk)!;
    };
    const cutoff = stockCutoffDate || '';
    const afterCutoffDate = (date: string) => !cutoff || date >= cutoff;
    const afterCutoffTs = (createdAt: string) => !cutoff || format(new Date(createdAt), 'yyyy-MM-dd') >= cutoff;
    const matchMonth = (date: string) => estoqueMonth === 'all' || date.startsWith(estoqueMonth);
    const monthMatchesMovement = (createdAt: string) => estoqueMonth === 'all' || createdAt.startsWith(estoqueMonth);
    const entregueFrom = entregueRange.from || '';
    const entregueTo = entregueRange.to || entregueFrom;
    const matchesEntregueRange = (createdAt: string) => {
      if (!entregueFrom) return true;
      const d = format(new Date(createdAt), 'yyyy-MM-dd');
      return d >= entregueFrom && d <= entregueTo;
    };

    for (const prod of productions) {
      if (!matchMonth(prod.date)) continue;
      if (!afterCutoffDate(prod.date)) continue;
      if (!prod.machine_id) continue;
      const art = articles.find(a => a.id === prod.article_id);
      if (!art || !art.client_id) continue;
      const k = `${art.client_id}::${prod.article_id}`;
      const mk = (prod.machine_id as string | null) || '__none__';
      const e = ensure(k, mk);
      e.producedKg += Number(prod.weight_kg);
      e.producedRolls += Number(prod.rolls_produced);
    }
    for (const mv of stockMovements as any[]) {
      if (!monthMatchesMovement(mv.created_at)) continue;
      if (!afterCutoffTs(mv.created_at)) continue;
      if (mv.is_second_quality) continue;
      if (!['adjust_in', 'adjust_out', 'out', 'in', 'reserve', 'release'].includes(mv.type)) continue;
      if (!mv.machine_id) continue;
      const art = articles.find(a => a.id === mv.article_id);
      if (!art || !art.client_id) continue;
      const k = `${art.client_id}::${mv.article_id}`;
      const mk = (mv.machine_id as string | null) || '__none__';
      const e = ensure(k, mk);
      const kg = Number(mv.weight_kg); const pc = Number(mv.pieces);
      if (mv.type === 'adjust_in') { e.producedKg += kg; e.producedRolls += pc; }
      else if (mv.type === 'adjust_out') { e.producedKg -= kg; e.producedRolls -= pc; }
      else if (mv.type === 'in') {
        if (mv.billing_order_id) {
          e.deliveredKgTotal -= kg; e.deliveredRollsTotal -= pc;
          if (matchesEntregueRange(mv.created_at)) { e.deliveredKg -= kg; e.deliveredRolls -= pc; }
        }
        else { e.producedKg += kg; e.producedRolls += pc; }
      }
      else if (mv.type === 'out') {
        e.deliveredKgTotal += kg; e.deliveredRollsTotal += pc;
        if (matchesEntregueRange(mv.created_at)) { e.deliveredKg += kg; e.deliveredRolls += pc; }
      }
      else if (mv.type === 'reserve') { e.reservedKg += kg; e.reservedRolls += pc; }
      else if (mv.type === 'release') { e.reservedKg -= kg; e.reservedRolls -= pc; }
    }
    return out;
  }, [productions, stockMovements, articles, estoqueMonth, stockCutoffDate, entregueRange]);

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
  const [movPage, setMovPage] = useState(1);
  const MOV_PAGE_SIZE = 15;

  const filteredMovements = useMemo(() => {
    return (movementsHistory as any[]).filter(m => movFilterType === 'all' || m.type === movFilterType);
  }, [movementsHistory, movFilterType]);

  const movTotalPages = Math.ceil(filteredMovements.length / MOV_PAGE_SIZE);

  const movVisiblePages = useMemo(() => {
    const pages = [];
    const maxVisible = 3;
    let start = Math.max(1, movPage - Math.floor(maxVisible / 2));
    let end = Math.min(movTotalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [movPage, movTotalPages]);

  const paginatedMovements = useMemo(() => {
    const start = (movPage - 1) * MOV_PAGE_SIZE;
    return filteredMovements.slice(start, start + MOV_PAGE_SIZE);
  }, [filteredMovements, movPage]);

  // Reset page when filter type changes
  useEffect(() => {
    setMovPage(1);
  }, [movFilterType]);

  // ============== EXPORT PDF (estoque por artigo) ==============
  const [exportingArticleId, setExportingArticleId] = useState<string | null>(null);
  const handleExportArticlePdf = async (group: any, article: any) => {
    const key = `${group.clientId}::${article.articleId}`;
    if (exportingArticleId) return;
    setExportingArticleId(key);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 12;
      const dateStr = new Date().toLocaleString('pt-BR');

      // Carregar logo
      const loadLogo = (url: string): Promise<{ data: string; width: number; height: number } | null> =>
        new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0);
              resolve({ data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
            } catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
      const logoInfo = companyInfo?.logo_url ? await loadLogo(companyInfo.logo_url) : null;
      const fitWithinBox = (w: number, h: number, mw: number, mh: number) => {
        if (!w || !h) return { width: mw, height: mh };
        const s = Math.min(mw / w, mh / h);
        return { width: w * s, height: h * s };
      };

      const colors = {
        grayBg: [249, 250, 251] as [number, number, number],
        border: [229, 231, 235] as [number, number, number],
        textDark: [17, 24, 39] as [number, number, number],
        textMid: [75, 85, 99] as [number, number, number],
      };
      const headerH = 25;
      const leftX = margin + 5;
      const rightX = pageWidth - margin - 5;
      const y = margin;
      const titleMaxWidth = pageWidth - 2 * margin - 90;

      pdf.setFillColor(...colors.grayBg);
      pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'S');

      if (logoInfo) {
        try {
          const ls = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
          pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, ls.width, ls.height);
        } catch {
          if (companyInfo?.name) {
            pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...colors.textDark);
            pdf.text(sanitizePdfText(companyInfo.name), leftX, y + 10);
          }
        }
      } else if (companyInfo?.name) {
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colors.textDark);
        pdf.text(sanitizePdfText(companyInfo.name), leftX, y + 10);
      }
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colors.textMid);
      pdf.text(sanitizePdfText(dateStr), leftX, y + 22);

      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      const title = 'ESTOQUE DE MALHA POR ARTIGO';
      const titleLines = pdf.splitTextToSize(sanitizePdfText(title), titleMaxWidth) as string[];
      let titleY = y + 9;
      titleLines.forEach((line) => {
        const tw = pdf.getTextWidth(line);
        pdf.text(line, (pageWidth - tw) / 2, titleY);
        titleY += 6;
      });
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colors.textMid);
      const subtitle = sanitizePdfText(`${article.articleName} — ${group.clientName}`);
      const sw = pdf.getTextWidth(subtitle);
      pdf.text(subtitle, (pageWidth - sw) / 2, titleY + 1);

      // Quebra por máquina
      const inner = byMachineMap.get(key);
      const rows = inner
        ? Array.from(inner.entries())
            .filter(([mk]) => mk !== '__none__')
            .map(([mk, v]) => ({
              name: machineNameById.get(mk) || 'Máquina removida',
              producedKg: v.producedKg,
              producedRolls: v.producedRolls,
              deliveredKg: v.deliveredKgTotal,
              deliveredRolls: v.deliveredRollsTotal,
              reservedKg: v.reservedKg,
              reservedRolls: v.reservedRolls,
              availableKg: (v.producedKg - v.deliveredKgTotal) - v.reservedKg,
              availableRolls: (v.producedRolls - v.deliveredRollsTotal) - v.reservedRolls,
            }))
            .sort((x, y) => x.name.localeCompare(y.name))
        : [];

      const body = rows.map(r => [
        sanitizePdfText(r.name),
        formatWeight(r.producedKg),
        formatNumber(r.producedRolls),
        formatWeight(r.deliveredKg),
        formatNumber(r.deliveredRolls),
        formatWeight(r.reservedKg),
        formatNumber(r.reservedRolls),
        formatWeight(r.availableKg),
        formatNumber(r.availableRolls),
      ]);

      // Total do artigo
      body.push([
        'TOTAL',
        formatWeight(article.producedKg),
        formatNumber(article.producedRolls),
        formatWeight(article.deliveredKgTotal ?? article.deliveredKg),
        formatNumber(article.deliveredRollsTotal ?? article.deliveredRolls),
        formatWeight(article.reservedKg),
        formatNumber(article.reservedRolls),
        formatWeight(article.availableKg),
        formatNumber(article.availableRolls),
      ]);

      autoTable(pdf, {
        head: [[
          'MÁQUINA',
          'PRODUZIDO (kg)', 'ROLOS PROD.',
          'ENTREGUE (kg)', 'ROLOS ENTR.',
          'RESERVADO (kg)', 'ROLOS RES.',
          'DISPONÍVEL (kg)', 'DISP. ROLOS',
        ]],
        body,
        startY: y + headerH + 10,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { halign: 'right' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: (d) => {
          if (d.section === 'body' && d.row.index === body.length - 1) {
            d.cell.styles.fillColor = [243, 244, 246];
            d.cell.styles.fontStyle = 'bold';
          }
        },
      });

      const safeName = (article.articleName || 'artigo').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40);
      pdf.save(`estoque_${safeName}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (e: any) {
      console.error(e);
      toast.error('Falha ao gerar PDF: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setExportingArticleId(null);
    }
  };

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
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-medium">Entregue:</span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 text-xs justify-start text-left font-normal w-[200px]",
                    !entregueRange.from && "text-muted-foreground"
                  )}
                >
                  <CalendarDays className="mr-2 h-3.5 w-3.5" />
                  {entregueRange.from ? (
                    entregueRange.to && entregueRange.to !== entregueRange.from ? (
                      <>
                        {format(parse(entregueRange.from, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')} → {format(parse(entregueRange.to, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}
                      </>
                    ) : (
                      format(parse(entregueRange.from, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')
                    )
                  ) : (
                    <span>Selecionar datas</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{
                    from: entregueRange.from ? parse(entregueRange.from, 'yyyy-MM-dd', new Date()) : undefined,
                    to: entregueRange.to ? parse(entregueRange.to, 'yyyy-MM-dd', new Date()) : undefined,
                  }}
                  onSelect={(range) => {
                    if (!range) {
                      setEntregueRange({ from: '', to: '' });
                      return;
                    }
                    setEntregueRange({
                      from: range.from ? format(range.from, 'yyyy-MM-dd') : '',
                      to: range.to ? format(range.to, 'yyyy-MM-dd') : (range.from ? format(range.from, 'yyyy-MM-dd') : ''),
                    });
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8"
              onClick={() => setEntregueRange({ from: todayStr, to: todayStr })}
            >
              Hoje
            </Button>
            {(estoqueClient !== 'all' || estoqueArticle !== 'all' || estoqueMonth !== 'all') && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setEstoqueClient('all'); setEstoqueArticle('all'); setEstoqueMonth('all'); }}>Limpar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isStockLoading ? (
        <Card><CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando estoque...
        </CardContent></Card>
      ) : malhaEstoque.length === 0 ? (
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
                          <TableHead className="text-xs text-right">Produzido (kg)</TableHead>
                          <TableHead className="text-xs text-right">Rolos produzidos</TableHead>
                          <TableHead className="text-xs text-right">Entregue (kg)</TableHead>
                          <TableHead className="text-xs text-right">Rolos entregues</TableHead>
                          <TableHead className="text-xs text-right">Físico kg</TableHead>
                          <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">Rolos reservados</TableHead>
                          <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">Reservado kg</TableHead>
                          <TableHead className="text-xs text-right font-bold">Disponível kg</TableHead>
                          <TableHead className="text-xs text-right font-bold">Disp. Rolos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.articles.map((a: any) => (
                          <React.Fragment key={a.articleId}>
                          <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedArticle(expandedArticle === `${group.clientId}::${a.articleId}` ? null : `${group.clientId}::${a.articleId}`)}>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1.5">
                                <ChevronDown className={cn('h-3 w-3 transition-transform', expandedArticle === `${group.clientId}::${a.articleId}` ? '' : '-rotate-90')} />
                                <span className="flex-1">{a.articleName}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Baixar PDF do estoque deste artigo"
                                  onClick={(e) => { e.stopPropagation(); handleExportArticlePdf(group, a); }}
                                  disabled={exportingArticleId === `${group.clientId}::${a.articleId}`}
                                >
                                  {exportingArticleId === `${group.clientId}::${a.articleId}`
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Download className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            </TableCell>
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
                          {expandedArticle === `${group.clientId}::${a.articleId}` && (() => {
                            const inner = byMachineMap.get(`${group.clientId}::${a.articleId}`);
                            if (!inner || inner.size === 0) {
                              return (
                                <TableRow key={`${a.articleId}-empty`}>
                                  <TableCell colSpan={10} className="text-[11px] text-muted-foreground italic bg-muted/30 py-2 pl-8">
                                    Sem quebra por máquina disponível.
                                  </TableCell>
                                </TableRow>
                              );
                            }
                            const rows = Array.from(inner.entries())
                              .filter(([mk]) => mk !== '__none__')
                              .map(([mk, v]) => ({
                              mk,
                              name: machineNameById.get(mk) || 'Máquina removida',
                              ...v,
                              stockKg: v.producedKg - v.deliveredKgTotal,
                              stockRolls: v.producedRolls - v.deliveredRollsTotal,
                              availableKg: (v.producedKg - v.deliveredKgTotal) - v.reservedKg,
                              availableRolls: (v.producedRolls - v.deliveredRollsTotal) - v.reservedRolls,
                            })).sort((x, y) => x.name.localeCompare(y.name));
                            return rows.map((r) => (
                              <TableRow key={`${a.articleId}-${r.mk}`} className="bg-muted/30">
                                <TableCell className="text-[11px] pl-8 text-muted-foreground">
                                  ↳ <span className="font-medium text-indigo-700 dark:text-indigo-300">{r.name}</span>
                                </TableCell>
                                <TableCell className="text-[11px] text-right">{formatWeight(r.producedKg)}</TableCell>
                                <TableCell className="text-[11px] text-right">{formatNumber(r.producedRolls)}</TableCell>
                                <TableCell className="text-[11px] text-right">{formatWeight(r.deliveredKg)}</TableCell>
                                <TableCell className="text-[11px] text-right">{formatNumber(r.deliveredRolls)}</TableCell>
                                <TableCell className={cn('text-[11px] text-right', r.stockKg < 0 ? 'text-destructive' : 'text-foreground')}>{formatWeight(r.stockKg)}</TableCell>
                                <TableCell className="text-[11px] text-right text-amber-700 dark:text-amber-400">{formatNumber(r.reservedRolls)}</TableCell>
                                <TableCell className="text-[11px] text-right text-amber-700 dark:text-amber-400">{formatWeight(r.reservedKg)}</TableCell>
                                <TableCell className={cn('text-[11px] text-right font-semibold', r.availableKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(r.availableKg)}</TableCell>
                                <TableCell className={cn('text-[11px] text-right font-semibold', r.availableRolls < 0 ? 'text-destructive' : 'text-success')}>{formatNumber(r.availableRolls)}</TableCell>
                              </TableRow>
                            ));
                          })()}
                          </React.Fragment>
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

        <TabsContent value="movimentos" className="space-y-3 mt-4">
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
                <span className="text-xs text-muted-foreground">{filteredMovements.length} movimento(s) — Página {movPage} de {movTotalPages || 1}</span>
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
                  {paginatedMovements.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">Sem movimentos.</TableCell></TableRow>
                  )}
                  {paginatedMovements.map((m: any) => {
                    const meta = movementLabel[m.type] || { label: m.type, color: 'bg-muted text-foreground' };
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={cn('text-[10px]', meta.color)}>{meta.label}</Badge>
                          {m.is_second_quality && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300">2ª</Badge>
                          )}
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

          {/* Paginação */}
          {movTotalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMovPage(p => Math.max(1, p - 1))}
                disabled={movPage === 1}
              >
                Anterior
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-1">
                {movVisiblePages.map(page => (
                  <Button
                    key={page}
                    variant={movPage === page ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setMovPage(page)}
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMovPage(p => Math.min(movTotalPages, p + 1))}
                disabled={movPage === movTotalPages}
              >
                Próximo
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <ManualStockEntryModal
          open={manualOpen}
          onOpenChange={setManualOpen}
          clients={clients}
          articles={articles as any}
          machines={machines}
          onSaved={refreshAllStock}
        />
      )}
      {isAdmin && (
        <ManualStockEntryModal
          open={manual2qOpen}
          onOpenChange={setManual2qOpen}
          clients={clients}
          articles={articles as any}
          machines={machines}
          isSecondQuality
          onSaved={refreshAllStock}
        />
      )}
    </div>
  );
}
