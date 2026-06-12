import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type BillingOrderStatus = 'open' | 'separating' | 'ready' | 'collected';

export interface BillingOrder {
  id: string;
  of_number: string;
  client_id: string;
  article_id: string;
  machine_id?: string;
  pieces_expected: number;
  weight_expected?: number;
  dyehouse: string;
  status: BillingOrderStatus;
  pieces_real?: number;
  weight_real?: number;
  weight_avg?: number;
  created_by: string;
  separated_by?: string;
  collected_by?: string;
  created_at: string;
  updated_at: string;
  // Joins
  client?: { name: string };
  article?: { name: string };
  machine?: { name: string };
  creator?: { name: string; code: string };
  separator?: { name: string; code: string };
  collector?: { name: string; code: string };
}

export function useBillingOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['billing_orders', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const { data, error } = await supabase
        .from('billing_orders')
        .select(`
          *,
          client:clients(name),
          article:articles(name),
          machine:machines(name),
          creator:profiles!billing_orders_created_by_fkey(name, code),
          separator:profiles!billing_orders_separated_by_fkey(name, code),
          collector:profiles!billing_orders_collected_by_fkey(name, code)
        `)
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as any[] as BillingOrder[];
    },
    enabled: !!user?.company_id,
  });

  const createOrder = useMutation({
    mutationFn: async (newOrder: Partial<BillingOrder>) => {
      const { data, error } = await supabase
        .from('billing_orders')
        .insert([{
          ...newOrder,
          company_id: user?.company_id,
          created_by: user?.id,
          status: 'open'
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: "OF criada com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar OF", description: error.message, variant: "destructive" });
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, data = {} }: { id: string, status: BillingOrderStatus, data?: any }) => {
      const updatePayload: any = { status, ...data };
      if (status === 'separating') updatePayload.separated_by = user?.id;
      if (status === 'collected') updatePayload.collected_by = user?.id;

      const { error } = await supabase
        .from('billing_orders')
        .update(updatePayload)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: "Status atualizado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    }
  });

  return {
    orders,
    isLoading,
    createOrder,
    updateStatus
  };
}
