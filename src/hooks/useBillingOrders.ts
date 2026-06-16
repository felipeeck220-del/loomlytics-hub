import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type BillingOrderStatus = 'open' | 'separating' | 'ready' | 'collected' | 'cancelled';
export type BillingOrderType = 'pieces' | 'weight';

export interface BillingOrder {
  id: string;
  of_number: string;
  client_id: string;
  article_id: string;
  machine_id?: string;
  pieces_expected?: number | null;
  weight_expected?: number;
  piece_weight_target?: number | null;
  dyehouse: string;
  status: BillingOrderStatus;
  order_type: BillingOrderType;
  pieces_real?: number;
  weight_real?: number;
  weight_avg?: number;
  created_by: string;
  separated_by?: string;
  collected_by?: string;
  created_at: string;
  updated_at: string;
  priority: boolean;
  priority_reason?: string;
  priority_at?: string;
  priority_by?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  edit_note?: string;
  last_edited_by?: string;
  last_edited_at?: string;
  // Joins
  client?: { name: string };
  article?: { name: string };
  machine?: { name: string };
  creator?: { name: string; code: string };
  separator?: { name: string; code: string };
  collector?: { name: string; code: string };
  prioritizer?: { name: string; code: string };
  canceller?: { name: string; code: string };
  editor?: { name: string; code: string };
}

export function useBillingOrders() {
  const { user, profile } = useAuth();
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
          collector:profiles!billing_orders_collected_by_fkey(name, code),
          prioritizer:profiles!billing_orders_priority_by_fkey(name, code),
          canceller:profiles!billing_orders_cancelled_by_fkey(name, code),
          editor:profiles!billing_orders_last_edited_by_fkey(name, code)
        `)
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as any[] as BillingOrder[];
    },
    enabled: !!user?.company_id,
  });

  useEffect(() => {
    if (!user?.company_id) return;

    const channel = supabase
      .channel(`billing_orders_changes_${user.company_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'billing_orders',
          filter: `company_id=eq.${user.company_id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['billing_orders', user.company_id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id, queryClient]);

  const createOrder = useMutation({
    mutationFn: async (newOrder: Partial<BillingOrder>) => {
      if (!newOrder.of_number || !newOrder.client_id || !newOrder.article_id || !newOrder.dyehouse) {
        throw new Error("Missing required fields");
      }
      const orderType: BillingOrderType = (newOrder.order_type as BillingOrderType) || 'pieces';
      if (orderType === 'pieces' && !newOrder.pieces_expected) {
        throw new Error("Pieces required for pieces-type order");
      }
      if (orderType === 'weight' && !newOrder.weight_expected) {
        throw new Error("Weight required for weight-type order");
      }

      // Verificação anti-duplicidade — vários admins podem gerar OF simultaneamente.
      const { data: dup, error: dupErr } = await supabase
        .from('billing_orders')
        .select('id, of_number')
        .eq('company_id', user?.company_id as string)
        .eq('of_number', newOrder.of_number)
        .maybeSingle();
      if (dupErr) throw dupErr;
      if (dup) {
        const err: any = new Error(`OF #${newOrder.of_number} já existe — outro admin acabou de criá-la.`);
        err.code = 'DUPLICATE_OF';
        throw err;
      }

      const { data, error } = await supabase
        .from('billing_orders')
        .insert([{
          of_number: newOrder.of_number,
          client_id: newOrder.client_id,
          article_id: newOrder.article_id,
          machine_id: newOrder.machine_id,
          pieces_expected: newOrder.pieces_expected ?? null,
          dyehouse: newOrder.dyehouse,
          weight_expected: newOrder.weight_expected,
          piece_weight_target: newOrder.piece_weight_target ?? null,
          order_type: orderType,
          company_id: user?.company_id as string,
          created_by: profile?.id as string,
          status: 'open' as any
        } as any])
        .select()
        .single();
      if (error) {
        // Captura unique violation no banco (caso seja criada no instante exato)
        if ((error as any).code === '23505') {
          const e: any = new Error(`OF #${newOrder.of_number} já existe — outro admin acabou de criá-la.`);
          e.code = 'DUPLICATE_OF';
          throw e;
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: "OF criada com sucesso" });
    },
    onError: (error: any) => {
      // Duplicidade é tratada visualmente pelo modal — não exibir toast genérico.
      if (error?.code === 'DUPLICATE_OF') return;
      toast({ title: "Erro ao criar OF", description: error.message, variant: "destructive" });
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, data = {}, expectedStatus }: { id: string, status: BillingOrderStatus | 'priority', data?: any, expectedStatus?: BillingOrderStatus }) => {
      let updatePayload: any = { ...data };
      if (status !== 'priority') {
        updatePayload.status = status;
        // Limpa prioridade ao mudar de status (exceto quando voltamos a 'open' preservando prioridade futura)
        if (status !== 'open') {
          updatePayload.priority = false;
          updatePayload.priority_reason = null;
          updatePayload.priority_at = null;
          updatePayload.priority_by = null;
        }
      }
      
      if (status === 'separating') updatePayload.separated_by = profile?.id;
      if (status === 'collected') updatePayload.collected_by = profile?.id;
      if (status === 'cancelled') {
        updatePayload.cancelled_by = profile?.id;
        updatePayload.cancelled_at = new Date().toISOString();
      }
      if (status === 'priority') {
        updatePayload.priority = true;
        updatePayload.priority_at = new Date().toISOString();
        updatePayload.priority_by = profile?.id;
      }

      // Atualização condicional — evita conflito quando outro usuário já mudou o status (delay/realtime).
      let q = supabase.from('billing_orders').update(updatePayload).eq('id', id);
      if (expectedStatus) q = q.eq('status', expectedStatus);
      const { data: rows, error } = await q.select('id, status');
      if (error) throw error;
      if (expectedStatus && (!rows || rows.length === 0)) {
        // Buscar status atual para informar quem está conflitando
        const { data: current } = await supabase
          .from('billing_orders')
          .select(`status, separator:profiles!billing_orders_separated_by_fkey(name, code), collector:profiles!billing_orders_collected_by_fkey(name, code), canceller:profiles!billing_orders_cancelled_by_fkey(name, code)`)
          .eq('id', id)
          .maybeSingle();
        const err: any = new Error('CONFLICT');
        err.code = 'CONFLICT';
        err.currentStatus = current?.status;
        err.actor = (current as any)?.separator || (current as any)?.collector || (current as any)?.canceller || null;
        throw err;
      }

      // Baixa de estoque: ao marcar como coletada, registra um movimento `out`
      // com base nos valores reais (pieces_real / weight_real) lançados na separação.
      if (status === 'collected' && rows && rows.length > 0 && user?.company_id) {
        const { data: ofRow } = await supabase
          .from('billing_orders')
          .select('article_id, client_id, pieces_real, weight_real, of_number')
          .eq('id', id)
          .maybeSingle();
        if (ofRow?.article_id) {
          const pieces = Math.max(0, Math.round(Number(ofRow.pieces_real || 0)));
          const weight = Math.max(0, Number(ofRow.weight_real || 0));
          if (pieces > 0 || weight > 0) {
            await (supabase.from as any)('stock_movements').insert({
              company_id: user.company_id,
              article_id: ofRow.article_id,
              client_id: ofRow.client_id,
              billing_order_id: id,
              type: 'out',
              pieces,
              weight_kg: weight,
              reason: `OF #${ofRow.of_number} coletada`,
              created_by: profile?.id ?? null,
            });
          }
        }
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_for_stock'] });
      const labels: Record<string, string> = {
        open: 'OF voltou para Aberto', separating: 'Separação iniciada', ready: 'Separação finalizada',
        collected: 'OF marcada como coletada', cancelled: 'OF cancelada', priority: 'Prioridade adicionada'
      };
      toast({ title: labels[vars.status] || 'Status atualizado' });
    },
    onError: (error: any) => {
      // Conflito é tratado visualmente pela página.
      if (error?.code === 'CONFLICT') {
        queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
        return;
      }
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    }
  });

  const editOrder = useMutation({
    mutationFn: async ({ id, changes, note, revertToOpen }: {
      id: string;
      changes: Partial<BillingOrder>;
      note: string;
      revertToOpen: boolean;
    }) => {
      const payload: any = {
        ...changes,
        edit_note: note,
        last_edited_by: profile?.id,
        last_edited_at: new Date().toISOString(),
      };
      if (revertToOpen) {
        payload.status = 'open';
        // Limpa dados reais já lançados, separador e prioridade — separação deverá recomeçar
        payload.pieces_real = null;
        payload.weight_real = null;
        payload.weight_avg = null;
        payload.separated_by = null;
      }
      const { error } = await supabase
        .from('billing_orders')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: 'OF atualizada' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao editar OF', description: error.message, variant: 'destructive' });
    }
  });

  return {
    orders,
    isLoading,
    createOrder,
    updateStatus,
    editOrder,
    getNextOfNumber: async (): Promise<{ last: string | null; next: string }> => {
      if (!user?.company_id) return { last: null, next: '001' };
      const { data, error } = await supabase
        .from('billing_orders')
        .select('of_number')
        .eq('company_id', user.company_id);
      if (error) throw error;
      const nums = (data ?? [])
        .map((r: any) => parseInt(String(r.of_number).replace(/\D/g, ''), 10))
        .filter((n: number) => Number.isFinite(n));
      if (nums.length === 0) return { last: null, next: '001' };
      const max = Math.max(...nums);
      const pad = (n: number) => String(n).padStart(3, '0');
      return { last: pad(max), next: pad(max + 1) };
    },
    ofExists: async (ofNumber: string): Promise<boolean> => {
      if (!user?.company_id || !ofNumber) return false;
      const { data, error } = await supabase
        .from('billing_orders')
        .select('id')
        .eq('company_id', user.company_id)
        .eq('of_number', ofNumber)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  };
}
