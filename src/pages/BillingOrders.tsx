import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useBillingOrders } from '@/hooks/useBillingOrders';
import { Play, Loader2 } from 'lucide-react';

const BillingOrders = () => {
  const { orders, isLoading, updateStatus } = useBillingOrders();
  const [activeTab, setActiveTab] = useState('open');

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold text-indigo-700">Ordens de Faturamento (OF)</h1>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 gap-1">
            <TabsTrigger value="open">Aberto</TabsTrigger>
            <TabsTrigger value="separating">Separação</TabsTrigger>
            <TabsTrigger value="ready">Pronto</TabsTrigger>
            <TabsTrigger value="collected">Coletado</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelado</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4 space-y-4">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {orders.filter(o => o.status === 'open').map(order => (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-lg">OF #{order.of_number}</h3>
                          <p className="text-sm text-muted-foreground">{order.client?.name}</p>
                          <p className="text-xs">{order.article?.name}</p>
                        </div>
                        <Button size="sm" onClick={() => updateStatus.mutate({ id: order.id, status: 'separating' })}>
                          <Play className="h-4 w-4 mr-2" /> Iniciar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default BillingOrders;
