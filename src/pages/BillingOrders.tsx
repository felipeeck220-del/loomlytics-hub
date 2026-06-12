import { useState, useMemo } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Play, CheckCircle2, Truck, History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

const BillingOrders = () => {
  const { user } = useAuth();
  const { role } = usePermissions();
  const { toast } = useToast();
  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState('open');
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for initial UI - will be replaced by real Supabase queries
  const orders = [
    {
      id: '1',
      of_number: '600',
      client_name: 'WILSON',
      article_name: 'SUPLEX CRU',
      pieces_expected: 84,
      machine_name: 'MAQUINA 17',
      dyehouse: 'LITORAL',
      status: 'open',
      created_at: new Date().toISOString(),
      created_by_name: 'Admin',
      created_by_code: '001'
    }
  ];

  const filteredOrders = orders.filter(order => 
    order.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.dyehouse.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.of_number.includes(searchTerm)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return isAdmin ? 'bg-red-50 border-red-200' : 'bg-card';
      case 'separating': return isAdmin ? 'bg-yellow-50 border-yellow-200' : 'bg-card';
      case 'ready': return 'bg-green-50 border-green-200';
      case 'collected': return 'bg-slate-50 border-slate-200';
      default: return 'bg-card';
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordem de Faturamento (OF)</h1>
          <p className="text-muted-foreground text-sm">Gestão de coletas e separação de malha</p>
        </div>
        {isAdmin && (
          <Button className="gap-2">
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="open" className="gap-2">
            Em Aberto <Badge variant="secondary" className="ml-1">1</Badge>
          </TabsTrigger>
          <TabsTrigger value="separating">Separando</TabsTrigger>
          <TabsTrigger value="ready">Pronto</TabsTrigger>
          <TabsTrigger value="collected">Coletadas</TabsTrigger>
        </TabsList>

        <div className="mt-6 space-y-4">
          {filteredOrders.map((order) => (
            <Card key={order.id} className={`${getStatusColor(order.status)} border transition-colors`}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">OF #{order.of_number}</span>
                      <Badge variant="outline" className="font-normal uppercase text-[10px]">
                        {order.dyehouse}
                      </Badge>
                    </div>
                    <div className="text-sm font-medium">{order.client_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.article_name} • {order.pieces_expected} peças • {order.machine_name}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between items-end gap-2">
                    <div className="text-[10px] text-right text-muted-foreground leading-tight">
                      Criado por: {order.created_by_name} #{order.created_by_code}<br />
                      {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                    
                    <div className="flex gap-2">
                      {activeTab === 'open' && !isAdmin && (
                        <Button size="sm" variant="outline" className="gap-2 text-yellow-600 border-yellow-200 hover:bg-yellow-50">
                          <Play className="h-4 w-4" /> Iniciar Separação
                        </Button>
                      )}
                      {activeTab === 'separating' && !isAdmin && (
                        <Button size="sm" variant="outline" className="gap-2 text-green-600 border-green-200 hover:bg-green-50">
                          <CheckCircle2 className="h-4 w-4" /> Lançar Dados
                        </Button>
                      )}
                      {activeTab === 'ready' && !isAdmin && (
                        <Button size="sm" variant="outline" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
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
    </div>
  );
};

export default BillingOrders;