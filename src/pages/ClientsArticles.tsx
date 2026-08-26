import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, Building2, BookOpen, Layers, Edit, Trash2, Printer, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Client {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface Article {
  id: string;
  client_id?: string;
  name: string;
  code?: string;
  gauge?: string;
  diameter?: string;
  weight_per_meter?: number;
  composition?: string;
  client_name?: string;
}

interface MachineProductionInfo {
  machine_name: string;
  current_article: string;
  current_client: string;
  next_article: string;
  next_client: string;
  ot_number: string;
  status: string;
}

export default function ClientsArticles() {
  const { slug } = useParams<{ slug: string }>();
  const { company } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('clients');

  // States for Clients
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({ name: '', document: '', phone: '', email: '', address: '' });

  // States for Articles
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleSearch, setArticleSearch] = useState('');
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [articleForm, setArticleForm] = useState({
    client_id: '',
    name: '',
    code: '',
    gauge: '',
    diameter: '',
    weight_per_meter: '',
    composition: ''
  });

  // States for Production Articles
  const [productionMachines, setProductionMachines] = useState<MachineProductionInfo[]>([]);
  const [loadingProduction, setLoadingProduction] = useState(false);

  const companyId = company?.id;

  useEffect(() => {
    if (companyId) {
      fetchClients();
      fetchArticles();
      fetchProductionArticles();
    }
  }, [companyId]);

  const fetchClients = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('clients' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
    }
  };

  const fetchArticles = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('articles' as any)
        .select('*, clients(name)')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      const formatted = (data || []).map((item: any) => ({
        ...item,
        client_name: item.clients?.name || 'Sem cliente'
      }));
      setArticles(formatted);
    } catch (error) {
      console.error('Erro ao buscar artigos:', error);
    }
  };

  const fetchProductionArticles = async () => {
    if (!companyId) return;
    setLoadingProduction(true);
    try {
      // Buscar ordens de troca (OT) da tabela mechanical_orders ou similar onde type = 'OT' ou tabela específica de OT
      // Vamos buscar da tabela mechanical_orders com category ou sub-tipo 'OT'
      const { data: otOrders, error } = await supabase
        .from('mechanical_orders' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Também podemos buscar máquinas ativas
      const { data: machinesData, error: machError } = await supabase
        .from('machines' as any)
        .select('*')
        .eq('company_id', companyId);

      if (machError) throw machError;

      // Agrupar OTs por máquina
      const machineMap: { [key: string]: any[] } = {};
      (otOrders || []).forEach((ot: any) => {
        // Filtrar apenas se for OT (verificando se o tipo ou subtipo contém OT ou se está na tabela ot)
        const machName = ot.machine_name || ot.machine || 'Máquina Geral';
        if (!machineMap[machName]) {
          machineMap[machName] = [];
        }
        machineMap[machName].push(ot);
      });

      const result: MachineProductionInfo[] = (machinesData || []).map((mach: any) => {
        const machName = mach.name || mach.code || 'Máquina';
        const otsForMachine = machineMap[machName] || [];

        // OTs abertas (status pendente, em andamento, aberto)
        const activeOts = otsForMachine.filter(o => 
          o.status === 'aberto' || o.status === 'em_andamento' || o.status === 'pendente' || !o.status
        );

        // OTs finalizadas
        const finishedOts = otsForMachine.filter(o => 
          o.status === 'finalizado' || o.status === 'concluido'
        );

        // Artigo atual rodando: baseado na última OT aberta ou em andamento, senão na última finalizada
        let currentArticle = 'Nenhum artigo no momento';
        let currentClient = 'N/A';
        let otNumber = 'N/A';
        let status = 'Parada';

        let nextArticle = 'Nenhum próximo artigo';
        let nextClient = 'N/A';

        if (activeOts.length > 0) {
          const currentOt = activeOts[0]; // mais recente aberta
          currentArticle = currentOt.article_name || currentOt.article || currentOt.description || 'Artigo Padrão';
          currentClient = currentOt.client_name || currentOt.client || 'Cliente Padrão';
          otNumber = currentOt.code || currentOt.ot_number || `#${currentOt.id?.slice(0, 4)}`;
          status = 'Rodando';

          // Próximo artigo: se houver outra OT na fila ou uma OT finalizada recentemente
          if (activeOts.length > 1) {
            nextArticle = activeOts[1].article_name || activeOts[1].article || 'Próximo Artigo';
            nextClient = activeOts[1].client_name || activeOts[1].client || 'Cliente';
          } else if (finishedOts.length > 0) {
            nextArticle = finishedOts[0].article_name || finishedOts[0].article || 'Artigo Anterior/Próximo';
            nextClient = finishedOts[0].client_name || finishedOts[0].client || 'Cliente';
          }
        } else if (finishedOts.length > 0) {
          // Se não há ativas, a última finalizada foi o artigo atual e o anterior foi o penúltimo
          const lastFinished = finishedOts[0];
          currentArticle = lastFinished.article_name || lastFinished.article || 'Artigo Finalizado';
          currentClient = lastFinished.client_name || lastFinished.client || 'Cliente';
          otNumber = lastFinished.code || lastFinished.ot_number || `#${lastFinished.id?.slice(0, 4)}`;
          status = 'Finalizado';

          if (finishedOts.length > 1) {
            nextArticle = finishedOts[1].article_name || finishedOts[1].article || 'Próximo';
            nextClient = finishedOts[1].client_name || finishedOts[1].client || 'Cliente';
          }
        }

        return {
          machine_name: machName,
          current_article: currentArticle,
          current_client: currentClient,
          next_article: nextArticle,
          next_client: nextClient,
          ot_number: otNumber,
          status
        };
      });

      setProductionMachines(result);
    } catch (error) {
      console.error('Erro ao buscar artigos em produção:', error);
    } finally {
      setLoadingProduction(false);
    };
  };

  // Save Client
  const handleSaveClient = async () => {
    if (!companyId || !clientForm.name) {
      toast({ title: 'Preencha o nome do cliente', variant: 'destructive' });
      return;
    }
    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients' as any)
          .update(clientForm)
          .eq('id', editingClient.id);
        if (error) throw error;
        toast({ title: 'Cliente atualizado com sucesso!' });
      } else {
        const { error } = await supabase
          .from('clients' as any)
          .insert([{ ...clientForm, company_id: companyId }]);
        if (error) throw error;
        toast({ title: 'Cliente cadastrado com sucesso!' });
      }
      setIsClientModalOpen(false);
      setEditingClient(null);
      setClientForm({ name: '', document: '', phone: '', email: '', address: '' });
      fetchClients();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar cliente', description: error.message, variant: 'destructive' });
    }
  };

  // Save Article
  const handleSaveArticle = async () => {
    if (!companyId || !articleForm.name) {
      toast({ title: 'Preencha o nome do artigo', variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        ...articleForm,
        weight_per_meter: articleForm.weight_per_meter ? parseFloat(articleForm.weight_per_meter) : null,
        company_id: companyId,
        client_id: articleForm.client_id || null
      };

      if (editingArticle) {
        const { error } = await supabase
          .from('articles' as any)
          .update(payload)
          .eq('id', editingArticle.id);
        if (error) throw error;
        toast({ title: 'Artigo atualizado com sucesso!' });
      } else {
        const { error } = await supabase
          .from('articles' as any)
          .insert([payload]);
        if (error) throw error;
        toast({ title: 'Artigo cadastrado com sucesso!' });
      }
      setIsArticleModalOpen(false);
      setEditingArticle(null);
      setArticleForm({ client_id: '', name: '', code: '', gauge: '', diameter: '', weight_per_meter: '', composition: '' });
      fetchArticles();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar artigo', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Deseja realmente excluir este cliente?')) return;
    try {
      const { error } = await supabase.from('clients' as any).delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Cliente excluído!' });
      fetchClients();
    } catch (error: any) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('Deseja realmente excluir este artigo?')) return;
    try {
      const { error } = await supabase.from('articles' as any).delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Artigo excluído!' });
      fetchArticles();
    } catch (error: any) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    }
  };

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredArticles = articles.filter(a => a.name.toLowerCase().includes(articleSearch.toLowerCase()) || (a.code && a.code.toLowerCase().includes(articleSearch.toLowerCase())));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Clientes & Artigos</h1>
          <p className="page-subtitle">Gerencie sua base de clientes, fichas de artigos e acompanhe a produção nas máquinas.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full md:w-[450px]">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Clientes
          </TabsTrigger>
          <TabsTrigger value="articles" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Artigos
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-2">
            <Layers className="w-4 h-4" /> Artigos em Produção
          </TabsTrigger>
        </TabsList>

        {/* TAB CLIENTES */}
        <TabsContent value="clients" className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar cliente..." 
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => {
              setEditingClient(null);
              setClientForm({ name: '', document: '', phone: '', email: '', address: '' });
              setIsClientModalOpen(true);
            }} className="btn-gradient flex items-center gap-2">
              <Plus className="w-4 h-4" /> Novo Cliente
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map(client => (
              <Card key={client.id} className="card-glass hover:shadow-md transition-all">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold">{client.name}</CardTitle>
                    <CardDescription>{client.document || 'Sem CNPJ/CPF'}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditingClient(client);
                      setClientForm({
                        name: client.name,
                        document: client.document || '',
                        phone: client.phone || '',
                        email: client.email || '',
                        address: client.address || ''
                      });
                      setIsClientModalOpen(true);
                    }}>
                      <Edit className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClient(client.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1 text-muted-foreground">
                  <p><strong>Telefone:</strong> {client.phone || 'Não informado'}</p>
                  <p><strong>E-mail:</strong> {client.email || 'Não informado'}</p>
                  <p><strong>Endereço:</strong> {client.address || 'Não informado'}</p>
                </CardContent>
              </Card>
            ))}
            {filteredClients.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Nenhum cliente cadastrado ou encontrado.
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB ARTIGOS */}
        <TabsContent value="articles" className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar artigo por nome ou código..." 
                value={articleSearch}
                onChange={e => setArticleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => {
              setEditingArticle(null);
              setArticleForm({ client_id: '', name: '', code: '', gauge: '', diameter: '', weight_per_meter: '', composition: '' });
              setIsArticleModalOpen(true);
            }} className="btn-gradient flex items-center gap-2">
              <Plus className="w-4 h-4" /> Novo Artigo
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredArticles.map(article => (
              <Card key={article.id} className="card-glass hover:shadow-md transition-all">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <Badge variant="outline" className="mb-1 text-primary border-primary/30">{article.client_name}</Badge>
                    <CardTitle className="text-lg font-bold">{article.name}</CardTitle>
                    <CardDescription>Cód: {article.code || 'N/A'}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditingArticle(article);
                      setArticleForm({
                        client_id: article.client_id || '',
                        name: article.name,
                        code: article.code || '',
                        gauge: article.gauge || '',
                        diameter: article.diameter || '',
                        weight_per_meter: article.weight_per_meter ? String(article.weight_per_meter) : '',
                        composition: article.composition || ''
                      });
                      setIsArticleModalOpen(true);
                    }}>
                      <Edit className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteArticle(article.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1 text-muted-foreground">
                  <p><strong>Galga:</strong> {article.gauge || 'N/A'} | <strong>Diâmetro:</strong> {article.diameter || 'N/A'}</p>
                  <p><strong>Gramatura/Peso:</strong> {article.weight_per_meter ? `${article.weight_per_meter} g/m` : 'N/A'}</p>
                  <p><strong>Composição:</strong> {article.composition || 'N/A'}</p>
                </CardContent>
              </Card>
            ))}
            {filteredArticles.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Nenhum artigo cadastrado ou encontrado.
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB ARTIGOS EM PRODUÇÃO */}
        <TabsContent value="production" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Acompanhe em tempo real o artigo atual rodando e o próximo artigo em cada máquina com base nas Ordens de Troca (OT).
            </p>
            <Button variant="outline" size="sm" onClick={fetchProductionArticles} disabled={loadingProduction}>
              {loadingProduction ? 'Atualizando...' : 'Atualizar Dados'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productionMachines.map((mach, idx) => (
              <Card key={idx} className="card-glass border-l-4 border-l-primary">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      {mach.machine_name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      OT Ref: <span className="font-mono font-medium text-foreground">{mach.ot_number}</span>
                    </CardDescription>
                  </div>
                  <Badge variant={mach.status === 'Rodando' ? 'default' : 'secondary'} className={mach.status === 'Rodando' ? 'bg-primary text-primary-foreground' : ''}>
                    {mach.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="p-3 rounded-lg bg-accent/40 border border-border/50 space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Artigo Atual
                    </div>
                    <div className="font-bold text-foreground">{mach.current_article}</div>
                    <div className="text-xs text-muted-foreground font-medium">({mach.current_client})</div>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Próximo Artigo
                    </div>
                    <div className="font-semibold text-foreground">{mach.next_article}</div>
                    <div className="text-xs text-muted-foreground font-medium">({mach.next_client})</div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {productionMachines.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Nenhuma máquina ou ordem de troca encontrada para exibir produção.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Cliente */}
      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Cliente *</Label>
              <Input 
                value={clientForm.name} 
                onChange={e => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="Ex: Malhas Wilson"
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ / CPF</Label>
              <Input 
                value={clientForm.document} 
                onChange={e => setClientForm({ ...clientForm, document: e.target.value })}
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input 
                  value={clientForm.phone} 
                  onChange={e => setClientForm({ ...clientForm, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input 
                  value={clientForm.email} 
                  onChange={e => setClientForm({ ...clientForm, email: e.target.value })}
                  placeholder="contato@cliente.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input 
                value={clientForm.address} 
                onChange={e => setClientForm({ ...clientForm, address: e.target.value })}
                placeholder="Rua, Número, Bairro, Cidade - UF"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClientModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveClient} className="btn-gradient">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Artigo */}
      <Dialog open={isArticleModalOpen} onOpenChange={setIsArticleModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingArticle ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select 
                value={articleForm.client_id} 
                onValueChange={val => setArticleForm({ ...articleForm, client_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label>Nome do Artigo *</Label>
                <Input 
                  value={articleForm.name} 
                  onChange={e => setArticleForm({ ...articleForm, name: e.target.value })}
                  placeholder="Ex: MALHA EXCLUSIVE LIGHT"
                />
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input 
                  value={articleForm.code} 
                  onChange={e => setArticleForm({ ...articleForm, code: e.target.value })}
                  placeholder="ART-01"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Galga</Label>
                <Input 
                  value={articleForm.gauge} 
                  onChange={e => setArticleForm({ ...articleForm, gauge: e.target.value })}
                  placeholder="Ex: 28G"
                />
              </div>
              <div className="space-y-2">
                <Label>Diâmetro</Label>
                <Input 
                  value={articleForm.diameter} 
                  onChange={e => setArticleForm({ ...articleForm, diameter: e.target.value })}
                  placeholder="Ex: 30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gramatura / Peso (g/m)</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={articleForm.weight_per_meter} 
                  onChange={e => setArticleForm({ ...articleForm, weight_per_meter: e.target.value })}
                  placeholder="Ex: 180"
                />
              </div>
              <div className="space-y-2">
                <Label>Composição</Label>
                <Input 
                  value={articleForm.composition} 
                  onChange={e => setArticleForm({ ...articleForm, composition: e.target.value })}
                  placeholder="Ex: 100% Algodão"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsArticleModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveArticle} className="btn-gradient">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
