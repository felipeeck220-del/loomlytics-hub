import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useBillingOrders } from '@/hooks/useBillingOrders';
import { useToast } from '@/hooks/use-toast';
import { Boxes, Play, CheckCircle2, Truck, Plus, Trash2, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SearchableSelect from '@/components/SearchableSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';

const BillingOrders = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { orders, isLoading, createOrder, updateStatus } = useBillingOrders();
  const [activeTab, setActiveTab] = useState('open');

  return (
    <AppLayout title="Ordens de Faturamento (OF)">
      <div className="p-4 space-y-4">
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
          {/* Other tabs would go here, restored as needed */}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default BillingOrders;
