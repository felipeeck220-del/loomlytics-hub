import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatWeight, getDateLimits } from '@/lib/formatters';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import {
  Plus, Trash2, Search, FileText, Package, Scale, X, Filter, ChevronRight, LayoutGrid, Loader2, User, Edit2, AlertTriangle, ArrowUpRight, CheckCircle2, Clock, History, List, Truck, Wand2, Link2, FileDown, ChevronLeft
} from 'lucide-react';
import { exportClientInvoicesGeneralPdf, exportClientInvoiceByNfPdf } from '@/lib/clientInvoicePdf';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SearchableSelect } from '@/components/SearchableSelect';
import { cn } from '@/lib/utils';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClientTab {
  id: string;
  name: string;
}

export default function ClientInvoices() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  const { getClients, getArticles, getYarnTypes } = useSharedCompanyData();
  const { logAction, userTrackingInfo } = useAuditLog();
  const allClients = getClients();
  const allArticles = getArticles();
  const yarnTypes = getYarnTypes();

  const [openTabs, setOpenTabs] = useState<ClientTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('search');
  
  // Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [parentInvoiceId, setParentInvoiceId] = useState<string | null>(null);

  const [formType, setFormType] = useState<'entrada' | 'saida'>('entrada');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [weightKg, setWeightKg] = useState('');
  const [yarnTypeId, setYarnTypeId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [observations, setObservations] = useState('');
  const [supplierName, setSupplierName] = useState('');

  // Saída de Malha: composição de fios (porcentagens) e vínculos com múltiplas entradas
  type CompRow = { yarn_type_id: string; percentage: string };
  type LinkRow = { entry_invoice_id: string; yarn_type_id: string | null; deduct_kg: string };
  const [composition, setComposition] = useState<CompRow[]>([{ yarn_type_id: '', percentage: '100' }]);
  const [exitLinks, setExitLinks] = useState<LinkRow[]>([]);

  // Modal de saídas vinculadas a uma entrada
  const [linkedDialogOpen, setLinkedDialogOpen] = useState(false);
  const [linkedParent, setLinkedParent] = useState<any>(null);
  
  // Search/Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const SEARCH_PAGE_SIZE = 15;
  const [filterMonth, setFilterMonth] = useState('all');

  // Company branding for PDF exports
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  useEffect(() => {
    if (!companyId) return;
    (supabase.from as any)('companies')
      .select('logo_url, name')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
        if (data?.name) setCompanyName(data.name);
      });
  }, [companyId]);

  // Fetch Client Invoices
  const { data: clientInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['client_invoices', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_invoices')
        .select('*, items:client_invoice_items(*)')
        .eq('company_id', companyId)
        .order('issue_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Vínculos de saídas com entradas (multi-NF + por tipo de fio)
  const { data: exitLinksAll = [] } = useQuery({
    queryKey: ['client_invoice_exit_links', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_invoice_exit_links')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const handleAddTab = (clientId: string) => {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;
    if (!openTabs.find(t => t.id === client.id)) {
      setOpenTabs([...openTabs, { id: client.id, name: client.name }]);
    }
    setActiveTabId(client.id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t.id !== id);
    setOpenTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : 'search');
    }
  };

  const saveInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) {
        throw new Error('Empresa não identificada. Por favor, recarregue a página.');
      }
      
      if (!selectedClientId || !invoiceNumber || !weightKg || (!yarnTypeId && !articleId)) {
        throw new Error('Preencha os campos obrigatórios');
      }

      console.log('Iniciando salvamento de nota...', { companyId, formType, invoiceNumber });

      // Validações específicas para saída de malha
      if (formType === 'saida') {
        const validLinks = exitLinks.filter(l => l.entry_invoice_id && parseFloat(l.deduct_kg) > 0);
        if (validLinks.length === 0) {
          throw new Error('Selecione ao menos uma NF de entrada para descontar (a primeira é obrigatória).');
        }
        if (validLinks.length > 0) {
          const totalDeduct = validLinks.reduce((s, l) => s + (parseFloat(l.deduct_kg) || 0), 0);
          const peso = parseFloat(weightKg) || 0;
          if (totalDeduct - peso > 0.001) {
            throw new Error(`Total descontado (${totalDeduct.toFixed(3)} kg) é maior que o peso da saída (${peso.toFixed(3)} kg)`);
          }
          // Detectar duplicidade de NFs de entrada
          const ids = validLinks.map(l => l.entry_invoice_id);
          if (new Set(ids).size !== ids.length) {
            throw new Error('Existem NFs de entrada duplicadas na lista de descontos.');
          }
        }
      }

      if (editingInvoice) {
        // Atualizar cabeçalho
        const { error: invError } = await supabase
          .from('client_invoices')
          .update({
            client_id: selectedClientId,
            type: formType,
            invoice_number: invoiceNumber,
            issue_date: issueDate,
            observations: observations || null,
            parent_invoice_id: parentInvoiceId,
            supplier_name: formType === 'entrada' ? (supplierName || null) : null,
            composition: null,
          } as any)
          .eq('id', editingInvoice.id);

        if (invError) throw invError;

        // Atualizar item (assumindo apenas um item por nota no momento)
        const { error: itemError } = await supabase
          .from('client_invoice_items')
          .update({
            yarn_type_id: formType === 'entrada' ? (yarnTypeId || null) : null,
            article_id: formType === 'saida' ? (articleId || null) : null,
            weight_kg: parseFloat(weightKg)
          })
          .eq('invoice_id', editingInvoice.id);

        if (itemError) throw itemError;

        if (formType === 'saida') {
          await supabase.from('client_invoice_exit_links').delete().eq('exit_invoice_id', editingInvoice.id);
          const validLinks = exitLinks.filter(l => l.entry_invoice_id && parseFloat(l.deduct_kg) > 0);
          if (validLinks.length > 0) {
            const { error: linksError } = await supabase.from('client_invoice_exit_links').insert(
              validLinks.map(l => ({
                company_id: companyId,
                exit_invoice_id: editingInvoice.id,
                entry_invoice_id: l.entry_invoice_id,
                yarn_type_id: l.yarn_type_id || null,
                deduct_kg: parseFloat(l.deduct_kg) || 0,
              }))
            );
            if (linksError) throw linksError;
          }
        }

        return { action: 'updated', id: editingInvoice.id };
      } else {
        // Inserir o cabeçalho da nota
        const { data: invoice, error: invError } = await supabase
          .from('client_invoices')
          .insert({
            company_id: companyId,
            client_id: selectedClientId,
            type: formType,
            invoice_number: invoiceNumber,
            issue_date: issueDate,
            observations: observations || null,
            parent_invoice_id: parentInvoiceId,
            supplier_name: formType === 'entrada' ? (supplierName || null) : null,
            composition: null,
            created_by_name: userTrackingInfo.created_by_name,
            created_by_code: userTrackingInfo.created_by_code
          } as any)
          .select()
          .single();

        if (invError) throw invError;

        // Inserir o item da nota
        const { error: itemError } = await supabase
          .from('client_invoice_items')
          .insert({
            invoice_id: invoice.id,
            company_id: companyId,
            yarn_type_id: formType === 'entrada' ? (yarnTypeId || null) : null,
            article_id: formType === 'saida' ? (articleId || null) : null,
            weight_kg: parseFloat(weightKg)
          });

        if (itemError) {
          await supabase.from('client_invoices').delete().eq('id', invoice.id);
          throw itemError;
        }

        if (formType === 'saida') {
          const validLinks = exitLinks.filter(l => l.entry_invoice_id && parseFloat(l.deduct_kg) > 0);
          if (validLinks.length > 0) {
            const { error: linksError } = await supabase.from('client_invoice_exit_links').insert(
              validLinks.map(l => ({
                company_id: companyId,
                exit_invoice_id: invoice.id,
                entry_invoice_id: l.entry_invoice_id,
                yarn_type_id: l.yarn_type_id || null,
                deduct_kg: parseFloat(l.deduct_kg) || 0,
              }))
            );
            if (linksError) throw linksError;
          }
        }

        return { action: 'created', id: invoice.id };
      }
    },
    onSuccess: (data) => {
      logAction(`NF CLIENTES: ${data.action === 'updated' ? 'Editou' : 'Criou'} nota`, { invoice_number: invoiceNumber, type: formType });
      queryClient.invalidateQueries({ queryKey: ['client_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['client_invoice_exit_links'] });
      toast.success(`Nota ${data.action === 'updated' ? 'atualizada' : 'registrada'} com sucesso!`);
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Erro completo na mutation:', error);
      toast.error(error.message || 'Erro ao salvar nota');
    }
  });

  const resetForm = () => {
    setEditingInvoice(null);
    setParentInvoiceId(null);
    setInvoiceNumber('');
    setWeightKg('');
    setObservations('');
    setYarnTypeId('');
    setArticleId('');
    setSupplierName('');
    setComposition([{ yarn_type_id: '', percentage: '100' }]);
    setExitLinks([]);
    setIssueDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleEditInvoice = async (inv: any) => {
    setEditingInvoice(inv);
    setFormType(inv.type);
    setSelectedClientId(inv.client_id);
    setInvoiceNumber(inv.invoice_number);
    setIssueDate(inv.issue_date);
    setObservations(inv.observations || '');
    setParentInvoiceId(inv.parent_invoice_id || null);
    setSupplierName(inv.supplier_name || '');
    if (inv.items?.[0]) {
      setWeightKg(inv.items[0].weight_kg.toString());
      setYarnTypeId(inv.items[0].yarn_type_id || '');
      setArticleId(inv.items[0].article_id || '');
    }
    if (inv.type === 'saida') {
      const comp = Array.isArray(inv.composition) ? inv.composition : [];
      setComposition(comp.length > 0
        ? comp.map((c: any) => ({ yarn_type_id: c.yarn_type_id || '', percentage: String(c.percentage ?? '') }))
        : [{ yarn_type_id: '', percentage: '100' }]);
      const links = exitLinksAll.filter((l: any) => l.exit_invoice_id === inv.id);
      if (links.length > 0) {
        setExitLinks(links.map((l: any) => ({
          entry_invoice_id: l.entry_invoice_id,
          yarn_type_id: l.yarn_type_id || null,
          deduct_kg: String(l.deduct_kg ?? ''),
        })));
      } else if (inv.parent_invoice_id) {
        // legado: vínculo único via parent_invoice_id
        setExitLinks([{
          entry_invoice_id: inv.parent_invoice_id,
          yarn_type_id: null,
          deduct_kg: String(inv.items?.[0]?.weight_kg ?? ''),
        }]);
      } else {
        setExitLinks([]);
      }
    }
    setDialogOpen(true);
  };

  const onAddFromClient = (type: 'entrada' | 'saida' = 'entrada', parentId: string | null = null, clientId: string) => {
    resetForm();
    setSelectedClientId(clientId);
    setFormType(type);
    setParentInvoiceId(parentId);
    if (type === 'saida' && parentId) {
      const parent = clientInvoices.find(i => i.id === parentId);
      const yarn = parent?.items?.[0]?.yarn_type_id || '';
      setComposition([{ yarn_type_id: yarn, percentage: '100' }]);
      setExitLinks([{ entry_invoice_id: parentId, yarn_type_id: yarn || null, deduct_kg: '' }]);
    }
    // Saída tem número de NF próprio (diferente da entrada). Não pré-preenchemos mais.
    setDialogOpen(true);
  };


  const handleDeleteInvoice = async (id: string) => {
    setInvoiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!invoiceToDelete) return;
    
    // Check if it's an entrance with linked outputs
    const invoice = clientInvoices.find(i => i.id === invoiceToDelete);
    const hasLinked = invoice?.type === 'entrada' && clientInvoices.some(i => i.parent_invoice_id === invoiceToDelete);
    
    const { error } = await supabase.from('client_invoices').delete().eq('id', invoiceToDelete);
    if (error) toast.error('Erro ao excluir');
    else {
      logAction('NF CLIENTES: Excluiu nota', { id: invoiceToDelete, was_parent: hasLinked });
      toast.success(hasLinked ? 'Nota e saídas vinculadas excluídas' : 'Nota excluída');
      queryClient.invalidateQueries({ queryKey: ['client_invoices'] });
    }
    setDeleteDialogOpen(false);
    setInvoiceToDelete(null);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            Notas Fiscais (Clientes)
          </h1>
          <p className="text-muted-foreground mt-1">Controle de entrada de fio e saída de malha por cliente</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="w-full sm:w-64">
             <SearchableSelect
              options={allClients.map(c => ({ value: c.id, label: c.name }))}
              value=""
              onValueChange={handleAddTab}
              placeholder="Pesquisar cliente..."
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTabId} onValueChange={setActiveTabId} className="w-full">
        <div className="flex items-center border-b overflow-x-auto no-scrollbar">
          <TabsList className="bg-transparent h-auto p-0 flex-nowrap">
            <TabsTrigger
              value="search"
              className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Busca Geral
            </TabsTrigger>
            {openTabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none group"
              >
                {tab.name}
                <X
                  className="h-3 w-3 ml-2 opacity-50 hover:opacity-100 transition-opacity"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                />
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="search" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="relative col-span-1 md:col-span-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por NF, cliente, fio ou artigo..."
                className="pl-9"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSearchPage(1); }}
              />
            </div>
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setSearchPage(1); }}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                {Array.from(new Set(clientInvoices.map(inv => inv.issue_date.substring(0, 7)))).sort().reverse().map(month => (
                  <SelectItem key={month} value={month}>{format(new Date(month + '-02T12:00:00'), 'MMMM yyyy')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const filteredInvoices = clientInvoices.filter(inv => {
              const q = searchTerm.toLowerCase().trim();
              if (!q && filterMonth === 'all') return true;
              const client = allClients.find(c => c.id === inv.client_id)?.name || '';
              const itemName = inv.items?.[0]
                ? (inv.type === 'entrada'
                    ? (yarnTypes.find(y => y.id === inv.items[0].yarn_type_id)?.name || '')
                    : (allArticles.find(a => a.id === inv.items[0].article_id)?.name || ''))
                : '';
              const matchSearch = !q
                || inv.invoice_number.toLowerCase().includes(q)
                || client.toLowerCase().includes(q)
                || itemName.toLowerCase().includes(q)
                || (inv.supplier_name || '').toLowerCase().includes(q);
              return matchSearch && (filterMonth === 'all' || inv.issue_date.startsWith(filterMonth));
            });
            const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / SEARCH_PAGE_SIZE));
            const safePage = Math.min(searchPage, totalPages);
            const start = (safePage - 1) * SEARCH_PAGE_SIZE;
            const pageItems = filteredInvoices.slice(start, start + SEARCH_PAGE_SIZE);
            return (
              <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Peso (kg)</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-primary">{format(new Date(inv.issue_date + 'T12:00:00'), 'dd-MM-yyyy')}</span>
                        {inv.created_by_code && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground italic mt-0.5">
                            {inv.created_by_name} #{inv.created_by_code}
                          </div>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                    </TableCell>


                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>
                      <Badge variant={inv.type === 'entrada' ? 'default' : 'outline'} className={inv.type === 'entrada' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}>
                        {inv.type === 'entrada' ? 'Entrada Fio' : 'Saída Malha'}
                      </Badge>
                    </TableCell>
                    <TableCell>{allClients.find(c => c.id === inv.client_id)?.name}</TableCell>
                    <TableCell>
                      {inv.items?.[0] ? (
                        inv.type === 'entrada' 
                          ? yarnTypes.find(y => y.id === inv.items[0].yarn_type_id)?.name 
                          : allArticles.find(a => a.id === inv.items[0].article_id)?.name
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatWeight(inv.items?.[0]?.weight_kg || 0)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEditInvoice(inv)}>
                          <Edit2 className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteInvoice(inv.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {pageItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma nota encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {filteredInvoices.length > SEARCH_PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="text-xs text-muted-foreground">
                Mostrando <strong>{start + 1}</strong>–<strong>{Math.min(start + SEARCH_PAGE_SIZE, filteredInvoices.length)}</strong> de <strong>{filteredInvoices.length}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={safePage <= 1} onClick={() => setSearchPage(p => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                  .reduce<Array<number | 'gap'>>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('gap');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => p === 'gap' ? (
                    <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={p}
                      size="sm"
                      variant={p === safePage ? 'default' : 'outline'}
                      className="h-8 min-w-[2rem] px-2 text-xs"
                      onClick={() => setSearchPage(p as number)}
                    >
                      {p}
                    </Button>
                  ))}
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setSearchPage(p => Math.min(totalPages, p + 1))}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
              </>
            );
          })()}
        </TabsContent>

        {openTabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            <ClientDetailView 
              clientId={tab.id} 
              invoices={clientInvoices.filter(i => i.client_id === tab.id)}
              allInvoices={clientInvoices}
              exitLinksAll={exitLinksAll}
              allClients={allClients}
              allArticles={allArticles}
              yarnTypes={yarnTypes}
              companyName={companyName}
              companyLogoUrl={companyLogoUrl}
              onDelete={handleDeleteInvoice}
              onEdit={handleEditInvoice}
              onAdd={(type: 'entrada' | 'saida' = 'entrada', parentId: string | null = null) => 
                onAddFromClient(type, parentId, tab.id)
              }
              onViewLinked={(inv: any) => { setLinkedParent(inv); setLinkedDialogOpen(true); }}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Registration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={cn(formType === 'saida' ? 'w-[95vw] max-w-[95vw] sm:max-w-[80vw] max-h-[90vh] overflow-y-auto overflow-x-hidden' : 'max-w-md')}>
          <DialogHeader>
            <DialogTitle>
              {editingInvoice ? 'Editar Nota' : (formType === 'entrada' ? 'Nova Entrada de Fio' : 'Nova Saída de Malha')}
              {parentInvoiceId && <span className="text-xs font-normal text-muted-foreground block">Vinculada à NF de entrada: {clientInvoices.find(i => i.id === parentInvoiceId)?.invoice_number}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className={cn("py-3", formType === 'saida' ? 'space-y-3' : 'space-y-4')}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Nota</Label>
                <div className="p-2 border rounded-md bg-muted/50 text-sm font-medium">
                  {formType === 'entrada' ? 'Entrada de Fio' : 'Saída de Malha'}
                </div>

              </div>
              <div className="space-y-2">
                <Label>Data de Emissão</Label>
                <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
              </div>
            </div>

            <div className={cn("grid gap-4", formType === 'saida' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <SearchableSelect
                  options={allClients.map(c => ({ value: c.id, label: c.name }))}
                  value={selectedClientId}
                  onValueChange={setSelectedClientId}
                  placeholder="Selecione o cliente..."
                  disabled={activeTabId !== 'search'}
                />
                {activeTabId !== 'search' && (
                  <p className="text-[10px] text-muted-foreground italic">Cliente fixado pela aba ativa</p>
                )}
              </div>
              {formType === 'saida' && (
                <div className="space-y-2">
                  <Label>Artigo de Malha</Label>
                  <SearchableSelect
                    options={allArticles.filter(a => a.client_id === selectedClientId).map(a => ({ value: a.id, label: a.name }))}
                    value={articleId}
                    onValueChange={setArticleId}
                    placeholder={allArticles.filter(a => a.client_id === selectedClientId).length === 0 ? "Nenhum artigo cadastrado para este cliente" : "Selecione o artigo..."}
                    disabled={allArticles.filter(a => a.client_id === selectedClientId).length === 0}
                  />
                  {allArticles.filter(a => a.client_id === selectedClientId).length === 0 && (
                    <p className="text-[10px] text-destructive italic">Cadastre artigos para este cliente no menu Artigos</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número da NF</Label>
                <Input
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder={parentInvoiceId ? 'Número da NF de saída' : 'Número da NF'}
                />
                {parentInvoiceId && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Vinculada à entrada {clientInvoices.find(i => i.id === parentInvoiceId)?.invoice_number} — informe o número da NF de saída.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Peso Total (kg)</Label>
                <Input type="number" step="0.001" value={weightKg} onChange={e => setWeightKg(e.target.value)} />
              </div>
            </div>

            {formType === 'entrada' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Fio</Label>
                  <SearchableSelect
                    options={yarnTypes.map(y => ({ value: y.id, label: y.name }))}
                    value={yarnTypeId}
                    onValueChange={setYarnTypeId}
                    placeholder="Selecione o fio..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Input
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="Nome do fornecedor do fio"
                  />
                </div>
              </div>
            ) : (
              <>
                {/* Vínculos com Notas de Entrada (multi) — vem PRIMEIRO para alimentar a composição */}
                <div className="space-y-2 border rounded-md p-2.5 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Descontar de Notas de Entrada
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">(1ª obrigatória · demais opcionais)</span>
                    </Label>
                    <Button
                      variant="outline" size="sm" className="gap-1 h-7 text-xs"
                      onClick={() => {
                        const totalKg = parseFloat(weightKg) || 0;
                        if (totalKg <= 0) {
                          toast.error('Informe o peso total antes de auto distribuir');
                          return;
                        }
                        // Distribui o peso proporcionalmente entre as NFs vinculadas (pelo saldo disponível)
                        const validIds = exitLinks.filter(l => l.entry_invoice_id).map(l => l.entry_invoice_id);
                        if (validIds.length === 0) {
                          toast.error('Adicione ao menos uma NF de entrada para distribuir');
                          return;
                        }
                        const saldos = validIds.map(id => {
                          const inv: any = clientInvoices.find(i => i.id === id);
                          const weightEntrada = inv?.items?.[0]?.weight_kg || 0;
                          const used = exitLinksAll
                            .filter((l: any) => l.entry_invoice_id === id && (!editingInvoice || l.exit_invoice_id !== editingInvoice.id))
                            .reduce((s: number, l: any) => s + Number(l.deduct_kg || 0), 0);
                          return { id, saldo: Math.max(0, weightEntrada - used) };
                        });
                        const totalSaldo = saldos.reduce((s, x) => s + x.saldo, 0);
                        if (totalSaldo <= 0) {
                          toast.error('Sem saldo disponível nas NFs selecionadas');
                          return;
                        }
                        let remaining = totalKg;
                        const newLinks: LinkRow[] = exitLinks.map((l, idx) => {
                          const s = saldos.find(x => x.id === l.entry_invoice_id);
                          if (!s) return l;
                          let take = idx === exitLinks.length - 1
                            ? Math.min(remaining, s.saldo)
                            : Math.min((totalKg * s.saldo) / totalSaldo, s.saldo);
                          take = Math.max(0, Number(take.toFixed(3)));
                          remaining -= take;
                          return { ...l, deduct_kg: take.toFixed(3) };
                        });
                        setExitLinks(newLinks);
                      }}
                    >
                      <Wand2 className="h-3 w-3" /> Auto distribuir
                    </Button>
                  </div>

                  {exitLinks.map((link, idx) => {
                    const entryInv: any = clientInvoices.find(i => i.id === link.entry_invoice_id);
                    const usedEntryIds = exitLinks
                      .filter((_, i) => i !== idx)
                      .map(r => r.entry_invoice_id)
                      .filter(Boolean);
                    return (
                      <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                        <div className="w-full sm:flex-1 sm:min-w-0">
                        <SearchableSelect
                          options={clientInvoices
                            .filter(i => i.type === 'entrada' && i.client_id === selectedClientId && (!usedEntryIds.includes(i.id) || i.id === link.entry_invoice_id))
                            .map(i => ({
                              value: i.id,
                              label: `NF ${i.invoice_number} · ${yarnTypes.find(y => y.id === i.items?.[0]?.yarn_type_id)?.name || '?'}`
                            }))}
                          value={link.entry_invoice_id}
                          onValueChange={(v) => {
                            const inv: any = clientInvoices.find(i => i.id === v);
                            setExitLinks(prev => prev.map((r, i) => i === idx ? { ...r, entry_invoice_id: v, yarn_type_id: inv?.items?.[0]?.yarn_type_id || null } : r));
                          }}
                          placeholder="NF de entrada..."
                        />
                        </div>
                        <Input
                          value={link.yarn_type_id ? (yarnTypes.find(y => y.id === link.yarn_type_id)?.name || '-') : (entryInv?.items?.[0]?.yarn_type_id ? yarnTypes.find(y => y.id === entryInv.items[0].yarn_type_id)?.name : '-')}
                          readOnly
                          className="text-xs bg-muted/40 flex-1 sm:flex-none sm:w-[110px]"
                        />
                        <Input
                          type="number" step="0.001" placeholder="kg"
                          value={link.deduct_kg}
                          onChange={e => setExitLinks(prev => prev.map((r, i) => i === idx ? { ...r, deduct_kg: e.target.value } : r))}
                          className="flex-1 sm:flex-none sm:w-[110px]"
                        />
                        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setExitLinks(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                    onClick={() => setExitLinks(prev => [...prev, { entry_invoice_id: '', yarn_type_id: null, deduct_kg: '' }])}>
                    <Plus className="h-3 w-3" /> Adicionar NF de entrada
                  </Button>
                  {exitLinks.length > 0 && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Total descontado: {exitLinks.reduce((s, l) => s + (parseFloat(l.deduct_kg) || 0), 0).toFixed(3)} kg
                      {weightKg && ` / ${parseFloat(weightKg).toFixed(3)} kg da saída`}
                    </p>
                  )}
                </div>

              </>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Input value={observations} onChange={e => setObservations(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => saveInvoiceMutation.mutate()} disabled={saveInvoiceMutation.isPending || (formType === 'saida' && allArticles.filter(a => a.client_id === selectedClientId).length === 0)}>
              {saveInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 text-destructive mb-2">
              <div className="p-2 bg-destructive/10 rounded-full">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Nota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Saídas vinculadas a uma Entrada */}
      <Dialog open={linkedDialogOpen} onOpenChange={setLinkedDialogOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b bg-gradient-to-br from-primary/5 via-background to-amber-500/5">
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold">Saídas de Malha vinculadas</span>
                <span className="text-xs font-normal text-muted-foreground">
                  NF Entrada <span className="font-mono font-medium text-foreground">{linkedParent?.invoice_number}</span>
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {linkedParent && (() => {
              const linksHere = exitLinksAll.filter((l: any) => l.entry_invoice_id === linkedParent.id);
              const linkedExitIds = new Set(linksHere.map((l: any) => l.exit_invoice_id));
              const legacy = clientInvoices.filter(i => i.type === 'saida' && i.parent_invoice_id === linkedParent.id && !linkedExitIds.has(i.id));
              const linked = clientInvoices.filter(i => i.type === 'saida' && linkedExitIds.has(i.id));
              const rows = [...linked, ...legacy];
              const pesoEntrada = Number(linkedParent.items?.[0]?.weight_kg || 0);
              const totalDescontado = rows.reduce((sum, s) => {
                const d = linksHere.filter((l: any) => l.exit_invoice_id === s.id).reduce((a: number, l: any) => a + Number(l.deduct_kg || 0), 0)
                  || (s.parent_invoice_id === linkedParent.id ? Number(s.items?.[0]?.weight_kg || 0) : 0);
                return sum + d;
              }, 0);
              const saldo = Math.max(0, pesoEntrada - totalDescontado);
              const pct = pesoEntrada > 0 ? Math.min(100, (totalDescontado / pesoEntrada) * 100) : 0;

              return (
                <>
                  {/* Resumo da NF de entrada */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border">
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cliente</p>
                      <p className="text-sm font-semibold truncate" title={allClients.find(c => c.id === linkedParent.client_id)?.name}>
                        {allClients.find(c => c.id === linkedParent.client_id)?.name || '-'}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fio</p>
                      <p className="text-sm font-semibold truncate" title={yarnTypes.find(y => y.id === linkedParent.items?.[0]?.yarn_type_id)?.name}>
                        {yarnTypes.find(y => y.id === linkedParent.items?.[0]?.yarn_type_id)?.name || '-'}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fornecedor</p>
                      <p className="text-sm font-semibold truncate" title={linkedParent.supplier_name || '-'}>
                        {linkedParent.supplier_name || '-'}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Peso entrada</p>
                      <p className="text-sm font-bold text-primary tabular-nums">{formatWeight(pesoEntrada)}</p>
                    </div>
                  </div>

                  {/* Barra de progresso de consumo */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Consumido <span className="font-semibold text-amber-700 tabular-nums">{formatWeight(totalDescontado)}</span>
                        <span className="mx-1.5 text-muted-foreground/50">/</span>
                        Saldo <span className={cn("font-semibold tabular-nums", saldo > 0.001 ? "text-emerald-600" : "text-muted-foreground")}>{formatWeight(saldo)}</span>
                      </span>
                      <span className="font-mono font-semibold text-xs tabular-nums">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct >= 99.9 ? "bg-emerald-500" : "bg-gradient-to-r from-amber-400 to-amber-600"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Tabela de saídas */}
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50 border-b">
                          <TableHead className="h-9 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground w-[110px]">Data</TableHead>
                          <TableHead className="h-9 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground w-[120px]">NF Saída</TableHead>
                          <TableHead className="h-9 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Artigo</TableHead>
                          <TableHead className="h-9 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground text-right w-[110px]">Peso Saída</TableHead>
                          <TableHead className="h-9 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground text-right w-[130px]">Descontado</TableHead>
                          <TableHead className="h-9 w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map(s => {
                          const deducted = linksHere.filter((l: any) => l.exit_invoice_id === s.id).reduce((sum: number, l: any) => sum + Number(l.deduct_kg || 0), 0)
                            || (s.parent_invoice_id === linkedParent.id ? Number(s.items?.[0]?.weight_kg || 0) : 0);
                          const pesoSaida = Number(s.items?.[0]?.weight_kg || 0);
                          const isLegacy = !linkedExitIds.has(s.id);
                          return (
                            <TableRow key={s.id} className="group hover:bg-muted/40 transition-colors">
                              <TableCell className="py-2.5 text-xs tabular-nums text-muted-foreground">
                                {format(new Date(s.issue_date + 'T12:00:00'), 'dd/MM/yyyy')}
                              </TableCell>
                              <TableCell className="py-2.5">
                                <span className="font-mono text-xs font-semibold">{s.invoice_number}</span>
                                {isLegacy && (
                                  <Badge variant="outline" className="ml-1.5 text-[9px] py-0 px-1 h-4 border-muted-foreground/30 text-muted-foreground">legado</Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs truncate max-w-[260px]" title={allArticles.find(a => a.id === s.items?.[0]?.article_id)?.name || '-'}>
                                {allArticles.find(a => a.id === s.items?.[0]?.article_id)?.name || '-'}
                              </TableCell>
                              <TableCell className="py-2.5 text-right text-xs font-medium tabular-nums">
                                {formatWeight(pesoSaida)}
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold tabular-nums border border-amber-500/20">
                                  {formatWeight(deducted)}
                                </span>
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setLinkedDialogOpen(false); handleEditInvoice(s); }}>
                                    <Edit2 className="h-3.5 w-3.5 text-primary" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteInvoice(s.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                              <div className="flex flex-col items-center gap-2">
                                <div className="p-2.5 rounded-full bg-muted/60">
                                  <Truck className="h-5 w-5 text-muted-foreground/60" />
                                </div>
                                Nenhuma saída de malha vinculada a esta entrada.
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {rows.length > 0 && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30 border-t-2 font-semibold">
                            <TableCell colSpan={3} className="py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                              Total ({rows.length} {rows.length === 1 ? 'nota' : 'notas'})
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-xs tabular-nums">
                              {formatWeight(rows.reduce((s, r) => s + Number(r.items?.[0]?.weight_kg || 0), 0))}
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-sm text-amber-700 dark:text-amber-400 tabular-nums">
                              {formatWeight(totalDescontado)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30">
            <Button variant="outline" onClick={() => setLinkedDialogOpen(false)}>Fechar</Button>
            <Button
              onClick={() => {
                if (linkedParent) {
                  setLinkedDialogOpen(false);
                  onAddFromClient('saida', linkedParent.id, linkedParent.client_id);
                }
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Nova Saída de Malha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientDetailView({ clientId, invoices, allInvoices, exitLinksAll = [], allClients, allArticles, yarnTypes, companyName = '', companyLogoUrl = null, onDelete, onEdit, onAdd, onViewLinked }: any) {
  const [activeSubTab, setActiveSubTab] = useState('aberto');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Pagination for Histórico & Encerradas (15 per page)
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [activeSubTab]);

  // Export PDF modal state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'general' | 'by_nf'>('general');
  const [exportMonth, setExportMonth] = useState<string>('all');
  const [exportFrom, setExportFrom] = useState<string>('');
  const [exportTo, setExportTo] = useState<string>('');
  const [exportNfQuery, setExportNfQuery] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const [localSearch, setLocalSearch] = useState('');

  const stats = useMemo(() => {
    const q = (localSearch || '').toLowerCase();
    const base = !q ? invoices : invoices.filter((inv: any) => {
      const itemName = inv.type === 'entrada'
        ? (yarnTypes.find((y: any) => y.id === inv.items?.[0]?.yarn_type_id)?.name || '')
        : (allArticles.find((a: any) => a.id === inv.items?.[0]?.article_id)?.name || '');
      return (inv.invoice_number || '').toLowerCase().includes(q) || itemName.toLowerCase().includes(q);
    });
    const entrada = base.filter((i: any) => i.type === 'entrada').reduce((s: number, i: any) => s + (i.items?.[0]?.weight_kg || 0), 0);
    const saida = base.filter((i: any) => i.type === 'saida').reduce((s: number, i: any) => s + (i.items?.[0]?.weight_kg || 0), 0);
    return {
      entrada,
      saida,
      saldo: entrada - saida
    };
  }, [invoices, localSearch, yarnTypes, allArticles]);

  const invoicesWithBalance = useMemo(() => {
    return invoices
      .filter((inv: any) => inv.type === 'entrada')
      .map((inv: any) => {
        // Novos vínculos (multi-NF + por tipo de fio)
        const links = (exitLinksAll || []).filter((l: any) => l.entry_invoice_id === inv.id);
        const weightFromLinks = links.reduce((s: number, l: any) => s + Number(l.deduct_kg || 0), 0);
        const linkedExitIds = new Set(links.map((l: any) => l.exit_invoice_id));
        // Legado: saídas que ainda usam parent_invoice_id sem nenhum vínculo na nova tabela
        const legacySaidas = invoices.filter((i: any) => i.type === 'saida' && i.parent_invoice_id === inv.id && !linkedExitIds.has(i.id));
        const weightLegacy = legacySaidas.reduce((s: number, i: any) => s + (i.items?.[0]?.weight_kg || 0), 0);
        const weightSaida = weightFromLinks + weightLegacy;
        const relatedSaidas = [...legacySaidas, ...invoices.filter((i: any) => i.type === 'saida' && linkedExitIds.has(i.id))];
        const weightEntrada = inv.items?.[0]?.weight_kg || 0;
        const saldo = Math.max(0, Number((weightEntrada - weightSaida).toFixed(3)));
        return {
          ...inv,
          weightEntrada,
          weightSaida,
          saldo,
          isEncerrada: saldo <= 0.001,
          hasLinkedOutputs: relatedSaidas.length > 0
        };
      });

  }, [invoices, exitLinksAll]);

  const filteredInvoices = useMemo(() => {
    const base = activeSubTab === 'aberto' 
      ? invoicesWithBalance.filter((i: any) => !i.isEncerrada)
      : activeSubTab === 'encerrada'
        ? invoicesWithBalance.filter((i: any) => i.isEncerrada)
        : invoices; // 'historico' base
    
    if (!localSearch) return base;
    const q = localSearch.toLowerCase();
    return base.filter((inv: any) => {
      const itemName = inv.type === 'entrada' 
        ? (yarnTypes.find((y: any) => y.id === inv.items?.[0]?.yarn_type_id)?.name || '')
        : (allArticles.find((a: any) => a.id === inv.items?.[0]?.article_id)?.name || '');
      return inv.invoice_number.toLowerCase().includes(q) || itemName.toLowerCase().includes(q);
    });
  }, [invoicesWithBalance, activeSubTab, localSearch, yarnTypes, allArticles, invoices]);

  useEffect(() => { setPage(1); }, [localSearch]);

  // Apply pagination only for Histórico and Encerradas
  const paginatedInvoices = useMemo(() => {
    if (activeSubTab === 'aberto') return filteredInvoices;
    const start = (page - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, activeSubTab, page]);
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  // ---- Build dataset for export based on filters ----
  const exportInvoices = useMemo(() => {
    let base = invoices;
    if (exportMonth && exportMonth !== 'all') {
      base = base.filter((i: any) => (i.issue_date || '').startsWith(exportMonth));
    }
    if (exportFrom) base = base.filter((i: any) => (i.issue_date || '') >= exportFrom);
    if (exportTo) base = base.filter((i: any) => (i.issue_date || '') <= exportTo);
    return base;
  }, [invoices, exportMonth, exportFrom, exportTo]);

  // Available months from invoices
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i: any) => { if (i.issue_date) set.add(i.issue_date.slice(0, 7)); });
    return Array.from(set).sort().reverse();
  }, [invoices]);

  const handleExport = async () => {
    try {
      setExportLoading(true);
      const periodParts: string[] = [];
      if (exportMonth && exportMonth !== 'all') {
        const label = format(new Date(exportMonth + '-02T12:00:00'), 'MMM-yyyy', { locale: ptBR }).replace('.', '');
        periodParts.push(`Mês: ${label}`);
      }
      if (exportFrom) periodParts.push(`De ${format(new Date(exportFrom + 'T12:00:00'), 'dd/MM/yyyy')}`);
      if (exportTo) periodParts.push(`Até ${format(new Date(exportTo + 'T12:00:00'), 'dd/MM/yyyy')}`);
      const periodLabel = periodParts.length ? periodParts.join(' · ') : 'Todo o período';

      if (exportMode === 'general') {
        if (exportInvoices.length === 0) { toast.error('Nenhuma nota no período selecionado'); return; }
        await exportClientInvoicesGeneralPdf({
          companyName, logoUrl: companyLogoUrl, periodLabel,
          invoices: exportInvoices,
          exitLinksAll, allClients, allArticles, yarnTypes,
        });
        toast.success('PDF gerado com sucesso');
        setExportOpen(false);
      }
    } catch (e: any) {
      console.error(e); toast.error('Erro ao gerar PDF');
    } finally { setExportLoading(false); }
  };

  const handleExportSingleNf = async (entry: any) => {
    try {
      setExportLoading(true);
      const links = (exitLinksAll || []).filter((l: any) => l.entry_invoice_id === entry.id);
      const exits = allInvoices.filter((i: any) =>
        i.type === 'saida' && (links.some((l: any) => l.exit_invoice_id === i.id) || i.parent_invoice_id === entry.id)
      );
      const client = allClients.find((c: any) => c.id === entry.client_id);
      await exportClientInvoiceByNfPdf({
        companyName, logoUrl: companyLogoUrl,
        entry, exitLinks: links, exits, client, yarnTypes, allArticles,
      });
      toast.success('PDF gerado com sucesso');
      setExportOpen(false);
    } catch (e: any) {
      console.error(e); toast.error('Erro ao gerar PDF');
    } finally { setExportLoading(false); }
  };


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-500/5 border-emerald-500/10">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-emerald-600 flex items-center gap-2">
              <Package className="h-4 w-4" /> Entrada (Fio)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{formatWeight(stats.entrada)}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/10">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <Scale className="h-4 w-4" /> Saída (Malha)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{formatWeight(stats.saida)}</div>
          </CardContent>
        </Card>
        <Card className={cn("bg-primary/5 border-primary/10", stats.saldo > 0 && "bg-sky-500/5 border-sky-500/10", stats.saldo < 0 && "bg-destructive/5 border-destructive/10")}>
          <CardHeader className="py-4">
            <CardTitle className={cn("text-sm font-medium text-primary flex items-center gap-2", stats.saldo > 0 && "text-sky-600", stats.saldo < 0 && "text-destructive")}>
              <Search className="h-4 w-4" /> Saldo a Enviar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold text-primary", stats.saldo > 0 && "text-sky-700", stats.saldo < 0 && "text-destructive")}>
              {formatWeight(stats.saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full lg:w-auto">
          <TabsList className="w-full lg:w-auto grid grid-cols-3 lg:flex">
              <TabsTrigger value="aberto" className="gap-2">
                <Clock className="h-4 w-4" /> Em Aberto
              </TabsTrigger>
              <TabsTrigger value="encerrada" className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Encerradas
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-2">
                <History className="h-4 w-4" /> Histórico
              </TabsTrigger>

          </TabsList>
        </Tabs>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto sm:items-center">
          <Input 
            placeholder={activeSubTab === 'historico' ? "Buscar por número da NF..." : "Buscar nota ou fio..."} 
            className="w-full sm:w-64"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setExportOpen(true)} className="gap-2 flex-1 sm:flex-none" title="Exportar PDF">
              <FileDown className="h-4 w-4" /> Exportar PDF
            </Button>
            <Button onClick={() => onAdd('entrada')} className="gap-2 flex-1 sm:flex-none">
              <Plus className="h-4 w-4" /> Adicionar Nota
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>{activeSubTab === 'historico' ? 'Item' : 'Fio'}</TableHead>
              {activeSubTab !== 'historico' && <TableHead>Fornecedor</TableHead>}
              <TableHead className="text-right">Peso Entrada</TableHead>
              <TableHead className="text-right">Peso Saída</TableHead>
              <TableHead className="text-right">Saldo</TableHead>

              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedInvoices.map((inv: any) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-primary">{format(new Date(inv.issue_date + 'T12:00:00'), 'dd-MM-yyyy')}</span>
                    {inv.created_by_code && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground italic mt-0.5">
                        {inv.created_by_name} #{inv.created_by_code}
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  {inv.invoice_number}
                  {activeSubTab === 'historico' && (
                    <Badge variant={inv.type === 'entrada' ? 'default' : 'outline'} className="ml-2 text-[10px]">
                      {inv.type === 'entrada' ? 'Entrada' : 'Saída'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {allClients.find((c: any) => c.id === inv.client_id)?.name || '-'}
                </TableCell>
                <TableCell>
                  {inv.items?.[0] ? (
                    inv.type === 'entrada' 
                      ? yarnTypes.find((y: any) => y.id === inv.items[0].yarn_type_id)?.name 
                      : allArticles.find((a: any) => a.id === inv.items[0].article_id)?.name
                  ) : '-'}
                </TableCell>
                {activeSubTab !== 'historico' && (
                  <TableCell className="text-xs">{inv.supplier_name || '-'}</TableCell>
                )}
                <TableCell className="text-right font-medium">
                  {activeSubTab === 'historico' 
                    ? (inv.type === 'entrada' ? formatWeight(inv.items?.[0]?.weight_kg || 0) : '-') 
                    : formatWeight(inv.weightEntrada)}
                </TableCell>
                <TableCell className="text-right text-emerald-600 font-medium">
                  {activeSubTab === 'historico' 
                    ? (inv.type === 'saida' ? formatWeight(inv.items?.[0]?.weight_kg || 0) : '-') 
                    : formatWeight(inv.weightSaida)}
                </TableCell>
                <TableCell className={cn("text-right font-bold", inv.saldo > 0 ? "text-red-400" : "text-muted-foreground")}>
                  {activeSubTab === 'historico' ? '-' : formatWeight(inv.saldo)}
                </TableCell>


                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {activeSubTab !== 'historico' && inv.type === 'entrada' && onViewLinked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver saídas vinculadas"
                        onClick={() => onViewLinked(inv)}
                      >
                        <List className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    {activeSubTab !== 'historico' && !inv.isEncerrada && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="Registrar Saída"
                        onClick={() => onAdd('saida', inv.id)}
                      >
                        <ArrowUpRight className="h-4 w-4 text-amber-600" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onEdit(inv)}>
                      <Edit2 className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(inv.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {filteredInvoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={activeSubTab === 'historico' ? 8 : 9} className="text-center py-8 text-muted-foreground">
                  Nenhuma nota {activeSubTab === 'aberto' ? 'em aberto' : activeSubTab === 'encerrada' ? 'encerrada' : 'encontrada'} para este cliente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination — somente Histórico e Encerradas */}
      {activeSubTab !== 'aberto' && filteredInvoices.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            Mostrando <strong>{(safePage - 1) * PAGE_SIZE + 1}</strong>–<strong>{Math.min(safePage * PAGE_SIZE, filteredInvoices.length)}</strong> de <strong>{filteredInvoices.length}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3 w-3" /> Anterior
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<Array<number | 'gap'>>((acc, p, idx, arr) => {
                if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('gap');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
              ) : (
                <Button key={p} size="sm" variant={p === safePage ? 'default' : 'outline'} className="h-8 min-w-[2rem] px-2 text-xs" onClick={() => setPage(p as number)}>
                  {p}
                </Button>
              ))}
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              Próxima <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Export PDF Modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[900px] overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" /> Exportar Notas Fiscais
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-md">
              <button
                type="button"
                onClick={() => setExportMode('general')}
                className={cn('rounded px-3 py-2 text-sm font-medium transition-colors',
                  exportMode === 'general' ? 'bg-background shadow-sm border' : 'text-muted-foreground hover:text-foreground')}
              >
                Exportação Geral
              </button>
              <button
                type="button"
                onClick={() => setExportMode('by_nf')}
                className={cn('rounded px-3 py-2 text-sm font-medium transition-colors',
                  exportMode === 'by_nf' ? 'bg-background shadow-sm border' : 'text-muted-foreground hover:text-foreground')}
              >
                Por NF (com saídas)
              </button>
            </div>

            {exportMode === 'general' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Gera um PDF com a lista de todas as notas (entradas e saídas) do cliente filtradas por mês e/ou intervalo de datas.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Mês</Label>
                    <Select value={exportMonth} onValueChange={setExportMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {monthOptions.map(m => (
                          <SelectItem key={m} value={m}>
                            {format(new Date(m + '-02T12:00:00'), 'MMM-yyyy', { locale: ptBR }).replace('.', '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data início</Label>
                    <Input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data fim</Label>
                    <Input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground italic">
                  Notas selecionadas: <strong>{exportInvoices.length}</strong>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Selecione uma NF de entrada. O PDF inclui dados completos da entrada e todas as saídas de malha vinculadas.
                </p>
                <Input
                  placeholder="Buscar NF..."
                  value={exportNfQuery}
                  onChange={e => setExportNfQuery(e.target.value)}
                />
                <div className="border rounded-md max-h-[320px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow>
                        <TableHead className="h-9">Data</TableHead>
                        <TableHead className="h-9">NF</TableHead>
                        <TableHead className="h-9">Fio</TableHead>
                        <TableHead className="h-9 text-right">Peso</TableHead>
                        <TableHead className="h-9 text-right">Saldo</TableHead>
                        <TableHead className="h-9">Status</TableHead>
                        <TableHead className="h-9"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices
                        .filter((i: any) => i.type === 'entrada')
                        .filter((i: any) => !exportNfQuery || (i.invoice_number || '').toLowerCase().includes(exportNfQuery.toLowerCase()))
                        .sort((a: any, b: any) => (b.issue_date || '').localeCompare(a.issue_date || ''))
                        .slice(0, 50)
                        .map((inv: any) => {
                          const withBal: any = invoicesWithBalance.find((x: any) => x.id === inv.id);
                          const saldo = withBal?.saldo ?? 0;
                          const isEncerrada = withBal?.isEncerrada ?? false;
                          return (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs">{format(new Date(inv.issue_date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="text-xs font-medium">{inv.invoice_number}</TableCell>
                            <TableCell className="text-xs">{yarnTypes.find((y: any) => y.id === inv.items?.[0]?.yarn_type_id)?.name || '-'}</TableCell>
                            <TableCell className="text-xs text-right">{formatWeight(inv.items?.[0]?.weight_kg || 0)}</TableCell>
                            <TableCell className={cn("text-xs text-right font-medium", isEncerrada ? "text-muted-foreground" : "text-sky-700")}>
                              {isEncerrada ? '—' : formatWeight(saldo)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isEncerrada ? 'outline' : 'default'} className={cn("text-[10px]", !isEncerrada && "bg-sky-500/15 text-sky-700 hover:bg-sky-500/15 border-sky-500/30")}>
                                {isEncerrada ? 'Encerrada' : 'Em Aberto'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={exportLoading} onClick={() => handleExportSingleNf(inv)}>
                                <FileDown className="h-3 w-3" /> Exportar
                              </Button>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      {invoices.filter((i: any) => i.type === 'entrada').length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Nenhuma NF de entrada.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Fechar</Button>
            {exportMode === 'general' && (
              <Button onClick={handleExport} disabled={exportLoading} className="gap-2">
                {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Gerar PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Histórico por Nota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Digite o número da NF para ver o histórico..."
                className="pl-9"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />
            </div>

            {historySearch && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Peso (kg)</TableHead>
                      <TableHead>Auditoria</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices
                      .filter((inv: any) => inv.invoice_number.includes(historySearch))
                      .sort((a: any, b: any) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime())
                      .map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-xs">{format(new Date(inv.issue_date + 'T12:00:00'), 'dd-MM-yyyy')}</TableCell>
                          <TableCell>
                            <Badge variant={inv.type === 'entrada' ? 'default' : 'outline'} className="text-[10px]">
                              {inv.type === 'entrada' ? 'Entrada' : 'Saída'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs truncate max-w-[120px]">
                            {inv.items?.[0] ? (
                              inv.type === 'entrada' 
                                ? yarnTypes.find((y: any) => y.id === inv.items[0].yarn_type_id)?.name 
                                : allArticles.find((a: any) => a.id === inv.items[0].article_id)?.name
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatWeight(inv.items?.[0]?.weight_kg || 0)}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                            <div className="font-medium text-emerald-600">
                              {inv.created_by_name ? `${inv.created_by_name} #${inv.created_by_code || '?'}` : '—'}
                            </div>
                            {inv.created_at && (
                              <div>{format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    {invoices.filter((inv: any) => inv.invoice_number.includes(historySearch)).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-xs">
                          Nenhum registro encontrado para esta nota.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

