import { useState, useMemo } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useBillingOrders, type BillingOrderStatus } from '@/hooks/useBillingOrders';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus, Play, CheckCircle2, Truck, Loader2, AlertTriangle, MessageSquare } from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/SearchableSelect';

const BillingOrders = () => {
  const { user, profile } = useAuth();
  const { role } = usePermissions();
  const { toast } = useToast();
  const { getClients, getArticles, getMachines } = useSharedCompanyData();
  const { orders, isLoading, createOrder, updateStatus } = useBillingOrders();

  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState<BillingOrderStatus | 'all' | 'priority_tab'>('open');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState<any>(null);
  const [showPriorityModal, setShowPriorityModal] = useState<any>(null);
  
  const [priorityForm, setPriorityForm] = useState({
    reason: '',
    customReason: ''
  });

  const priorityReasons = [
    "Coleta a caminho",
    "Será coletado hoje",
    "NF para coleta"
  ];

  // Filtros para aba Coletadas
  const [filterDateRange, setFilterDateRange] = useState<{from: string, to: string}>({
    from: '',
    to: ''
  });
  const [datePreset, setDatePreset] = useState<'7d' | '30d' | 'custom'>('30d');

  const [form, setForm] = useState({
    of_number: '',
    client_id: '',
    article_id: '',
    machine_id: '',
    pieces_expected: '',
    dyehouse: '',
    weight_expected: ''
  });

  const [launchForm, setLaunchForm] = useState({
    pieces_real: '',
    weight_real: ''
  });

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.client?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.dyehouse.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.of_number.includes(searchTerm);
      
      if (activeTab === 'all') return matchesSearch;
      
      if (activeTab === 'priority_tab') {
        return order.priority && order.status === 'open' && matchesSearch;
      }

      // Se for a aba Aberto, garantir que mostre apenas o que não é prioridade e tem status open
      if (activeTab === 'open') {
        return order.status === 'open' && !order.priority && matchesSearch;
      }

      if (order.status !== activeTab) return false;
      if (!matchesSearch) return false;

      // Filtros específicos para "Coletadas"
      if (activeTab === 'collected') {
        const orderDate = new Date(order.created_at);
        const today = new Date();

        if (datePreset === '7d') {
          return isWithinInterval(orderDate, { start: subDays(today, 7), end: today });
        }
        if (datePreset === '30d') {
          return isWithinInterval(orderDate, { start: subDays(today, 30), end: today });
        }
        if (datePreset === 'custom') {
          if (filterDateRange.from && filterDateRange.to) {
            return isWithinInterval(orderDate, { 
              start: startOfDay(new Date(filterDateRange.from)), 
              end: endOfDay(new Date(filterDateRange.to)) 
            });
          }
        }
      }

      return true;
    });
  }, [orders, searchTerm, activeTab, filterDateRange, datePreset]);

  const stats = useMemo(() => {
    return {
      open: orders.filter(o => o.status === 'open').length,
      separating: orders.filter(o => o.status === 'separating').length,
      ready: orders.filter(o => o.status === 'ready').length,
      collected: orders.filter(o => o.status === 'collected').length,
      priority: orders.filter(o => o.priority && o.status !== 'collected').length,
    };
  }, [orders]);

  const hasPendingPriority = stats.priority > 0;

  const handlePriority = async () => {
    if (!priorityForm.reason && !priorityForm.customReason) {
      toast({ title: "Selecione ou digite um motivo", variant: "destructive" });
      return;
    }

    const finalReason = priorityForm.reason === 'custom' ? priorityForm.customReason : priorityForm.reason;

    await updateStatus.mutateAsync({
      id: showPriorityModal.id,
      status: 'priority',
      data: {
        priority_reason: finalReason
      }
    });
    setShowPriorityModal(null);
    setPriorityForm({ reason: '', customReason: '' });
  };

  const handleCreate = async () => {
    if (!form.of_number || !form.client_id || !form.article_id || !form.pieces_expected || !form.dyehouse) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    await createOrder.mutateAsync({
      of_number: form.of_number,
      client_id: form.client_id,
      article_id: form.article_id,
      machine_id: form.machine_id && form.machine_id !== 'none' ? form.machine_id : undefined,
      pieces_expected: parseInt(form.pieces_expected),
      weight_expected: form.weight_expected ? parseFloat(form.weight_expected) : undefined,
      dyehouse: form.dyehouse
    });
    setShowCreateModal(false);
    setForm({ of_number: '', client_id: '', article_id: '', machine_id: '', pieces_expected: '', dyehouse: '', weight_expected: '' });
  };

  const handleLaunch = async () => {
    if (!launchForm.pieces_real || !launchForm.weight_real) {
      toast({ title: "Preencha os dados reais", variant: "destructive" });
      return;
    }

    const pieces = parseInt(launchForm.pieces_real);
    const weight = parseFloat(launchForm.weight_real);
    const avg = pieces > 0 ? weight / pieces : 0;

    await updateStatus.mutateAsync({
      id: showLaunchModal.id,
      status: 'ready',
      data: {
        pieces_real: pieces,
        weight_real: weight,
        weight_avg: avg
      }
    });
    setShowLaunchModal(null);
    setLaunchForm({ pieces_real: '', weight_real: '' });
  };

  const getStatusColor = (status: string, isPriority?: boolean) => {
    // Se estiver em separação, fica amarelo para administradores verem
    if (status === 'separating' && isAdmin) return 'bg-yellow-500/40 border-yellow-500/50';
    
    if (isPriority && status !== 'collected') return 'bg-red-500/5 border-red-500/20';
    
    switch (status) {
      case 'open': return isAdmin ? 'bg-red-500/10 border-red-500/20' : 'bg-card';
      case 'separating': return 'bg-yellow-500/20 border-yellow-500/30';
      case 'ready': return 'bg-green-500/20 border-green-500/30';
      case 'collected': return 'bg-slate-500/10 border-slate-500/20';
      default: return 'bg-card';
    }
  };

  if (isLoading && !orders.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Sincronizando ordens de faturamento...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordem de Faturamento (OF)</h1>
          <p className="text-muted-foreground text-sm">Gestão de coletas e separação de malha</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova OF
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 bg-card p-3 rounded-lg border shadow-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Pesquisar por cliente, tinturaria ou OF..." 
          className="border-none shadow-none focus-visible:ring-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/50 gap-1 w-full lg:w-fit">
          <TabsTrigger 
            value="priority_tab" 
            className={`gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial ${hasPendingPriority ? 'animate-pulse bg-red-600 text-white data-[state=active]:bg-red-700 data-[state=active]:text-white' : ''}`}
          >
            Aberto Prioritário <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.priority}</Badge>
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Aberto <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.open}</Badge>
          </TabsTrigger>
          <TabsTrigger value="separating" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Separando <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.separating}</Badge>
          </TabsTrigger>
          <TabsTrigger value="ready" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Pronto <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.ready}</Badge>
          </TabsTrigger>
          <TabsTrigger value="collected" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Coletadas
          </TabsTrigger>
        </TabsList>

        {activeTab === 'collected' && (
          <Card className="mt-4 border-dashed bg-muted/30">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-bold">Filtrar Período</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant={datePreset === '7d' ? 'default' : 'outline'} 
                    size="sm" 
                    onClick={() => setDatePreset('7d')}
                    className="h-9 text-xs"
                  >7 dias</Button>
                  <Button 
                    variant={datePreset === '30d' ? 'default' : 'outline'} 
                    size="sm" 
                    onClick={() => setDatePreset('30d')}
                    className="h-9 text-xs"
                  >30 dias</Button>
                  <Button 
                    variant={datePreset === 'custom' ? 'default' : 'outline'} 
                    size="sm" 
                    onClick={() => setDatePreset('custom')}
                    className="h-9 text-xs"
                  >Custom</Button>
                </div>
              </div>

              {datePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">De</Label>
                    <Input 
                      type="date" 
                      className="h-9"
                      value={filterDateRange.from} 
                      onChange={e => setFilterDateRange({...filterDateRange, from: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Até</Label>
                    <Input 
                      type="date" 
                      className="h-9"
                      value={filterDateRange.to} 
                      onChange={e => setFilterDateRange({...filterDateRange, to: e.target.value})} 
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-6 space-y-4">
          {filteredOrders.map((order) => (
            <Card key={order.id} className={`${getStatusColor(order.status, order.priority)} border transition-colors`}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">OF #{order.of_number}</span>
                      <Badge variant="outline" className="font-normal uppercase text-[10px]">
                        {order.dyehouse}
                      </Badge>
                      {order.priority && (
                        <Badge variant="destructive" className="animate-pulse gap-1">
                          <AlertTriangle className="h-3 w-3" /> PRIORIDADE
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {order.client?.name}
                      {order.priority_reason && (
                        <Badge variant="outline" className="text-[10px] border-red-200 text-red-700 bg-red-50 gap-1 py-0 px-2 h-5">
                          <MessageSquare className="h-3 w-3" /> {order.priority_reason}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.article?.name} • {order.pieces_expected} peças 
                      {order.weight_expected ? ` • ${order.weight_expected}kg` : ''}
                      {order.machine?.name && ` • ${order.machine.name}`}
                    </div>
                    {order.status === 'ready' && (
                      <div className="text-xs font-semibold text-green-700 mt-1">
                        REAL: {order.pieces_real} pçs • {order.weight_real}kg • Média: {order.weight_avg?.toFixed(2)}kg
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between items-end gap-2">
                    <div className="text-[10px] text-right text-muted-foreground leading-tight">
                      Criado por: {order.creator?.name} #{order.creator?.code}<br />
                      {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {order.separated_by && (
                        <div className="mt-1">Separado por: {order.separator?.name} #{order.separator?.code}</div>
                      )}
                      {order.collected_by && (
                        <div className="mt-1">Coletado por: {order.collector?.name} #{order.collector?.code}</div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      {order.status === 'open' && isAdmin && !order.priority && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setShowPriorityModal(order)}
                        >
                          <AlertTriangle className="h-4 w-4" /> Marcar Prioridade
                        </Button>
                      )}

                      {order.status === 'open' && role === 'expedicao' && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="gap-2 text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                          onClick={() => updateStatus.mutate({ id: order.id, status: 'separating' })}
                        >
                          <Play className="h-4 w-4" /> Iniciar Separação
                        </Button>
                      )}
                      {order.status === 'separating' && (role === 'expedicao' || isAdmin) && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="gap-2 text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => setShowLaunchModal(order)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Lançar Dados
                        </Button>
                      )}
                      {order.status === 'ready' && (role === 'expedicao' || isAdmin) && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => updateStatus.mutate({ id: order.id, status: 'collected' })}
                        >
                          <Truck className="h-4 w-4" /> Marcar Coletada
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma ordem de faturamento encontrada nesta aba.
            </div>
          )}
        </div>
      </Tabs>

      {/* Modal Criar OF */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Faturamento (OF)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">OF #</Label>
              <Input className="col-span-3" value={form.of_number} onChange={e => setForm({...form, of_number: e.target.value})} placeholder="Ex: 600" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Cliente</Label>
              <div className="col-span-3">
                <SearchableSelect 
                  value={form.client_id}
                  onValueChange={v => setForm({...form, client_id: v, article_id: ''})}
                  options={getClients().map(c => ({ value: c.id, label: c.name }))}
                  placeholder="Selecione o cliente"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Artigo</Label>
              <div className="col-span-3">
                <SearchableSelect 
                  value={form.article_id}
                  onValueChange={v => setForm({...form, article_id: v})}
                  options={getArticles().filter(a => a.client_id === form.client_id).map(a => ({ value: a.id, label: a.name }))}
                  placeholder="Selecione o artigo"
                  disabled={!form.client_id}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Peças</Label>
              <Input type="number" className="col-span-3" value={form.pieces_expected} onChange={e => setForm({...form, pieces_expected: e.target.value})} placeholder="Quantidade de peças" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Peso Peça</Label>
              <Input type="number" step="0.01" className="col-span-3" value={form.weight_expected} onChange={e => setForm({...form, weight_expected: e.target.value})} placeholder="Peso estimado (opcional)" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Máquina</Label>
              <div className="col-span-3">
                <SearchableSelect 
                  value={form.machine_id}
                  onValueChange={v => setForm({...form, machine_id: v})}
                  options={[
                    { value: 'none', label: 'NENHUMA' },
                    ...getMachines().map(m => ({ value: m.id, label: m.name }))
                  ]}
                  placeholder="Selecione a máquina (opcional)"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Tinturaria</Label>
              <Input className="col-span-3" value={form.dyehouse} onChange={e => setForm({...form, dyehouse: e.target.value.toUpperCase()})} placeholder="Ex: LITORAL" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createOrder.isPending}>Criar OF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Lançar Dados Reais */}
      <Dialog open={!!showLaunchModal} onOpenChange={() => setShowLaunchModal(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Lançar Dados da Separação</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Peças</Label>
              <Input type="number" className="col-span-3" value={launchForm.pieces_real} onChange={e => setLaunchForm({...launchForm, pieces_real: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Peso (kg)</Label>
              <Input type="number" step="0.01" className="col-span-3" value={launchForm.weight_real} onChange={e => setLaunchForm({...launchForm, weight_real: e.target.value})} />
            </div>
            {launchForm.pieces_real && launchForm.weight_real && (
              <div className="text-center text-sm font-bold text-primary">
                Média Calculada: {(parseFloat(launchForm.weight_real) / parseInt(launchForm.pieces_real)).toFixed(2)} kg/peça
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLaunchModal(null)}>Cancelar</Button>
            <Button onClick={handleLaunch} disabled={updateStatus.isPending}>Finalizar Separação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Motivo da Prioridade */}
      <Dialog open={!!showPriorityModal} onOpenChange={() => setShowPriorityModal(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Adicionar Prioridade
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-3">
              <Label>Motivo da Prioridade</Label>
              <div className="grid grid-cols-1 gap-2">
                {priorityReasons.map((reason) => (
                  <Button
                    key={reason}
                    variant={priorityForm.reason === reason ? "default" : "outline"}
                    className="justify-start font-normal"
                    onClick={() => setPriorityForm({ ...priorityForm, reason, customReason: '' })}
                  >
                    {reason}
                  </Button>
                ))}
                <Button
                  variant={priorityForm.reason === 'custom' ? "default" : "outline"}
                  className="justify-start font-normal"
                  onClick={() => setPriorityForm({ ...priorityForm, reason: 'custom' })}
                >
                  Outro motivo...
                </Button>
              </div>
            </div>

            {priorityForm.reason === 'custom' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <Label htmlFor="custom-reason">Especifique o motivo</Label>
                <Input
                  id="custom-reason"
                  placeholder="Digite o motivo personalizado..."
                  value={priorityForm.customReason}
                  onChange={(e) => setPriorityForm({ ...priorityForm, customReason: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPriorityModal(null)}>Cancelar</Button>
            <Button 
              className="bg-red-600 hover:bg-red-700" 
              onClick={handlePriority} 
              disabled={updateStatus.isPending}
            >
              Confirmar Prioridade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingOrders;