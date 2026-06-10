import { useState, useMemo } from 'react';
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
  Plus, Trash2, Search, FileText, Package, Scale, X, Filter, ChevronRight, LayoutGrid, Loader2, User, Edit2, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
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

  const [formType, setFormType] = useState<'entrada' | 'saida'>('entrada');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [weightKg, setWeightKg] = useState('');
  const [yarnTypeId, setYarnTypeId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [observations, setObservations] = useState('');
  
  // Search/Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('all');


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
          created_by_name: userTrackingInfo.created_by_name,
          created_by_code: userTrackingInfo.created_by_code
        })
        .select()
        .single();

      if (invError) {
        console.error('Erro ao inserir client_invoices:', invError);
        throw invError;
      }

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
        console.error('Erro ao inserir client_invoice_items:', itemError);
        // Tentar deletar o cabeçalho órfão em caso de erro no item
        await supabase.from('client_invoices').delete().eq('id', invoice.id);
        throw itemError;
      }
    },
    onSuccess: () => {
      logAction('NF CLIENTES: Criou nota', { invoice_number: invoiceNumber, type: formType });
      queryClient.invalidateQueries({ queryKey: ['client_invoices'] });
      toast.success('Nota registrada com sucesso!');
      setDialogOpen(false);
      // Reset form
      setInvoiceNumber('');
      setWeightKg('');
      setObservations('');
      setYarnTypeId('');
      setArticleId('');
    },
    onError: (error: any) => {
      console.error('Erro completo na mutation:', error);
      toast.error(error.message || 'Erro ao salvar nota');
    }
  });

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Deseja excluir esta nota?')) return;
    const { error } = await supabase.from('client_invoices').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir');
    else {
      logAction('NF CLIENTES: Excluiu nota', { id });
      toast.success('Nota excluída');
      queryClient.invalidateQueries({ queryKey: ['client_invoices'] });
    }
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
          <Button onClick={() => { setFormType('entrada'); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Nota
          </Button>
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
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
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
                {clientInvoices
                  .filter(inv => {
                    const q = searchTerm.toLowerCase();
                    const client = allClients.find(c => c.id === inv.client_id)?.name || '';
                    const matchSearch = inv.invoice_number.includes(q) || client.toLowerCase().includes(q);
                    return matchSearch && (filterMonth === 'all' || inv.issue_date.startsWith(filterMonth));
                  })
                  .map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{format(new Date(inv.issue_date + 'T12:00:00'), 'dd-MM-yyyy')}</span>
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
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteInvoice(inv.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {openTabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            <ClientDetailView 
              clientId={tab.id} 
              invoices={clientInvoices.filter(i => i.client_id === tab.id)}
              allClients={allClients}
              allArticles={allArticles}
              yarnTypes={yarnTypes}
              onDelete={handleDeleteInvoice}
              onAdd={() => { setSelectedClientId(tab.id); setDialogOpen(true); }}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Registration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{formType === 'entrada' ? 'Nova Entrada de Fio' : 'Nova Saída de Malha'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Nota</Label>
                <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada de Fio</SelectItem>
                    <SelectItem value="saida">Saída de Malha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Emissão</Label>
                <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número da NF</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Peso Total (kg)</Label>
                <Input type="number" step="0.001" value={weightKg} onChange={e => setWeightKg(e.target.value)} />
              </div>
            </div>

            {formType === 'entrada' ? (
              <div className="space-y-2">
                <Label>Tipo de Fio</Label>
                <SearchableSelect
                  options={yarnTypes.map(y => ({ value: y.id, label: y.name }))}
                  value={yarnTypeId}
                  onValueChange={setYarnTypeId}
                  placeholder="Selecione o fio..."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Artigo de Malha</Label>
                <SearchableSelect
                  options={allArticles.filter(a => a.client_id === selectedClientId).map(a => ({ value: a.id, label: a.name }))}
                  value={articleId}
                  onValueChange={setArticleId}
                  placeholder="Selecione o artigo..."
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Input value={observations} onChange={e => setObservations(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveInvoiceMutation.mutate()} disabled={saveInvoiceMutation.isPending}>
              {saveInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientDetailView({ clientId, invoices, allClients, allArticles, yarnTypes, onDelete, onAdd }: any) {
  const stats = useMemo(() => {
    const entrada = invoices.filter((i: any) => i.type === 'entrada').reduce((s: number, i: any) => s + (i.items?.[0]?.weight_kg || 0), 0);
    const saida = invoices.filter((i: any) => i.type === 'saida').reduce((s: number, i: any) => s + (i.items?.[0]?.weight_kg || 0), 0);
    return {
      entrada,
      saida,
      saldo: entrada - saida
    };
  }, [invoices]);

  const [localSearch, setLocalSearch] = useState('');
  const [localType, setLocalType] = useState('all');

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
        <Card className={cn("bg-primary/5 border-primary/10", stats.saldo > 0 && "bg-amber-500/5 border-amber-500/10", stats.saldo < 0 && "bg-destructive/5 border-destructive/10")}>
          <CardHeader className="py-4">
            <CardTitle className={cn("text-sm font-medium text-primary flex items-center gap-2", stats.saldo > 0 && "text-amber-600")}>
              <Search className="h-4 w-4" /> Saldo a Enviar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold text-primary", stats.saldo > 0 && "text-amber-700", stats.saldo < 0 && "text-destructive")}>
              {formatWeight(stats.saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <Input 
            placeholder="Buscar nota ou item..." 
            className="w-full sm:w-64"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />
          <Select value={localType} onValueChange={setLocalType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onAdd} variant="outline" className="w-full sm:w-auto gap-2">
          <Plus className="h-4 w-4" /> Nova Movimentação
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Peso (kg)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices
              .filter((inv: any) => {
                const q = localSearch.toLowerCase();
                const item = inv.items?.[0] ? (inv.type === 'entrada' ? yarnTypes.find((y: any) => y.id === inv.items[0].yarn_type_id)?.name : allArticles.find((a: any) => a.id === inv.items[0].article_id)?.name) : '';
                const matchSearch = inv.invoice_number.includes(q) || (item || '').toLowerCase().includes(q);
                const matchType = localType === 'all' || inv.type === localType;
                return matchSearch && matchType;
              })
              .map((inv: any) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{format(new Date(inv.issue_date + 'T12:00:00'), 'dd-MM-yyyy')}</span>
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
                <TableCell>
                  {inv.items?.[0] ? (
                    inv.type === 'entrada' 
                      ? yarnTypes.find((y: any) => y.id === inv.items[0].yarn_type_id)?.name 
                      : allArticles.find((a: any) => a.id === inv.items[0].article_id)?.name
                  ) : '-'}
                </TableCell>
                <TableCell className="text-right font-medium">{formatWeight(inv.items?.[0]?.weight_kg || 0)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => onDelete(inv.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma nota registrada para este cliente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
