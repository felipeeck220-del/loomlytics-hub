import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type BillingOrderStatus = 'open' | 'separating' | 'ready' | 'collected' | 'cancelled';
export type BillingOrderType = 'pieces' | 'weight' | 'all';

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
  separation_started_by?: string | null;
  separation_started_at?: string | null;
  separation_finished_by?: string | null;
  separation_finished_at?: string | null;
  collected_by?: string;
  collected_at?: string | null;
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
  delivery_doc_type?: 'nf' | 'romaneio' | null;
  delivery_doc_number?: string | null;
  delivery_doc_set_by?: string | null;
  delivery_doc_set_at?: string | null;
  // Joins
  client?: { name: string };
  article?: { name: string };
  machine?: { name: string };
  creator?: { name: string; code: string };
  separator?: { name: string; code: string };
  separation_starter?: { name: string; code: string };
  separation_finisher?: { name: string; code: string };
  collector?: { name: string; code: string };
  prioritizer?: { name: string; code: string };
  canceller?: { name: string; code: string };
  editor?: { name: string; code: string };
  delivery_doc_setter?: { name: string; code: string };
  link_group_id?: string | null;
}

export function useBillingOrders() {
  const { user, profile } = useAuth();
  // Fase 3 (docs/rpcBillingOrders.md): toda a orquestração de estoque próprio,
  // reservas e cancelamentos vive nas RPCs SECURITY DEFINER; o cliente agora
  // só monta payload, chama a RPC e trata retorno {ok, already, error, ...}.
  const authorMeta = (): { name: string | null; code: string | null } => ({
    name: (profile as any)?.name ?? null,
    code: (profile as any)?.code != null ? String((profile as any).code) : null,
  });
  async function fetchConflictActor(id: string) {
    const { data } = await supabase
      .from('billing_orders')
      .select(`status,
        separator:profiles!billing_orders_separated_by_fkey(name, code),
        collector:profiles!billing_orders_collected_by_fkey(name, code),
        canceller:profiles!billing_orders_cancelled_by_fkey(name, code)`)
      .eq('id', id)
      .maybeSingle();
    return data as any;
  }
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
          separation_starter:profiles!billing_orders_separation_started_by_fkey(name, code),
          separation_finisher:profiles!billing_orders_separation_finished_by_fkey(name, code),
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

  // Fase 1 do plano de RPCs (docs/rpcBillingOrders.md):
  // bootstrap consolidado (empresa, stats, meses, next_of_number, grupos).
  const { data: bootstrap } = useQuery({
    queryKey: ['billing_orders_bootstrap', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return null;
      const { data, error } = await (supabase as any).rpc('get_billing_orders_bootstrap', {
        p_company_id: user.company_id,
      });
      if (error) throw error;
      return data as {
        company: { id: string; name: string; logo_url: string | null; slug: string };
        stats: {
          open: number; priority: number; separating: number;
          awaiting_doc: number; ready: number;
          collected_month: number; cancelled_month: number;
        };
        available_months: string[];
        next_of_number: string;
        last_of_number: string | null;
        link_groups_count: number;
      };
    },
    enabled: !!user?.company_id,
    staleTime: 60_000,
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
          queryClient.invalidateQueries({ queryKey: ['billing_orders_bootstrap', user.company_id] });
          queryClient.invalidateQueries({ queryKey: ['billing_orders_list', user.company_id] });
          queryClient.invalidateQueries({ queryKey: ['billing_order_detail'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id, queryClient]);

  const createOrder = useMutation({
    mutationFn: async (newOrder: Partial<BillingOrder>) => {
      if (!newOrder.client_id || !newOrder.article_id || !newOrder.dyehouse) {
        throw new Error('Missing required fields');
      }
      const orderType: BillingOrderType = (newOrder.order_type as BillingOrderType) || 'pieces';
      if (orderType === 'pieces' && !newOrder.pieces_expected) {
        throw new Error('Pieces required for pieces-type order');
      }
      if (orderType === 'weight' && !newOrder.weight_expected) {
        throw new Error('Weight required for weight-type order');
      }
      const a = authorMeta();
      const payload: any = {
        of_number: newOrder.of_number ?? null,
        client_id: newOrder.client_id,
        article_id: newOrder.article_id,
        machine_id: newOrder.machine_id ?? null,
        pieces_expected: newOrder.pieces_expected ?? null,
        weight_expected: newOrder.weight_expected ?? null,
        piece_weight_target: newOrder.piece_weight_target ?? null,
        dyehouse: newOrder.dyehouse,
        order_type: orderType,
        admin_notes: (newOrder as any).admin_notes ?? null,
      };
      const { data, error } = await (supabase as any).rpc('create_billing_order', {
        p_company_id: user?.company_id,
        p_payload: payload,
        p_author_name: a.name,
        p_author_code: a.code,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false && res?.error === 'duplicate_of_number') {
        const err: any = new Error(`OF #${newOrder.of_number} já existe — outro admin acabou de criá-la.`);
        err.code = 'DUPLICATE_OF';
        throw err;
      }
      return { id: res?.id, of_number: res?.of_number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      toast({ title: 'OF criada com sucesso' });
    },
    onError: (error: any) => {
      if (error?.code === 'DUPLICATE_OF') return;
      toast({ title: 'Erro ao criar OF', description: error.message, variant: 'destructive' });
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, data = {}, expectedStatus, reversalQuality }: {
      id: string;
      status: BillingOrderStatus | 'priority';
      data?: any;
      expectedStatus?: BillingOrderStatus;
      reversalQuality?: 'first' | 'second';
    }) => {
      const a = authorMeta();
      const throwConflict = async (currentStatus?: string) => {
        const cur = currentStatus ?? (await fetchConflictActor(id))?.status;
        const actor = await fetchConflictActor(id);
        const err: any = new Error('CONFLICT');
        err.code = 'CONFLICT';
        err.currentStatus = cur;
        err.actor = actor?.separator || actor?.collector || actor?.canceller || null;
        throw err;
      };

      let res: any;
      if (status === 'separating') {
        ({ data: res } = await (supabase as any).rpc('start_billing_order_separation', {
          p_company_id: user?.company_id, p_id: id, p_author_name: a.name, p_author_code: a.code,
        }));
      } else if (status === 'ready') {
        ({ data: res } = await (supabase as any).rpc('launch_billing_order_ready', {
          p_company_id: user?.company_id, p_id: id,
          p_pieces_real: (data?.pieces_real ?? null) as any,
          p_weight_real: (data?.weight_real ?? null) as any,
          p_author_name: a.name, p_author_code: a.code,
        }));
      } else if (status === 'collected') {
        ({ data: res } = await (supabase as any).rpc('collect_billing_order', {
          p_company_id: user?.company_id, p_id: id, p_author_name: a.name, p_author_code: a.code,
        }));
      } else if (status === 'cancelled') {
        ({ data: res } = await (supabase as any).rpc('cancel_billing_order', {
          p_company_id: user?.company_id, p_id: id,
          p_reason: data?.cancellation_reason ?? null,
          p_expected_status: expectedStatus ?? null,
          p_reversal_quality: reversalQuality ?? 'first',
          p_author_name: a.name, p_author_code: a.code,
        }));
      } else if (status === 'open') {
        ({ data: res } = await (supabase as any).rpc('revert_billing_order_to_open', {
          p_company_id: user?.company_id, p_id: id,
          p_reason: data?.reversal_reason ?? data?.cancellation_reason ?? null,
          p_expected_status: expectedStatus ?? null,
          p_author_name: a.name, p_author_code: a.code,
        }));
      } else if (status === 'priority') {
        ({ data: res } = await (supabase as any).rpc('set_billing_order_priority', {
          p_company_id: user?.company_id, p_id: id, p_priority: true,
          p_reason: data?.priority_reason ?? null,
          p_author_name: a.name, p_author_code: a.code,
        }));
      } else {
        throw new Error(`Status não suportado: ${status}`);
      }

      if (res?.ok === false && res?.error === 'conflict') {
        await throwConflict(res.current_status);
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      queryClient.invalidateQueries({ queryKey: ['billing_order_detail'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_for_stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_history'] });
      const labels: Record<string, string> = {
        open: 'OF voltou para Aberto', separating: 'Separação iniciada', ready: 'Separação finalizada',
        collected: 'OF marcada como coletada', cancelled: 'OF cancelada', priority: 'Prioridade adicionada'
      };
      toast({ title: labels[vars.status] || 'Status atualizado' });
    },
    onError: (error: any) => {
      if (error?.code === 'CONFLICT') {
        queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
        return;
      }
      toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
    }
  });

  const editOrder = useMutation({
    mutationFn: async ({ id, changes, note, revertToOpen, expectedStatus }: {
      id: string;
      changes: Partial<BillingOrder>;
      note: string;
      revertToOpen: boolean;
      expectedStatus?: BillingOrderStatus;
    }) => {
      const a = authorMeta();
      // Somente campos permitidos são serializados; RPC ignora ausentes (COALESCE).
      const allowed = ['of_number','client_id','article_id','machine_id','dyehouse',
                       'pieces_expected','weight_expected','piece_weight_target',
      const payload: Record<string, any> = {};
      for (const k of allowed) {
        if ((changes as any)[k] !== undefined) payload[k] = (changes as any)[k];
      }
      const { data, error } = await (supabase as any).rpc('edit_billing_order', {
        p_company_id: user?.company_id, p_id: id, p_payload: payload,
        p_note: note, p_expected_status: expectedStatus ?? null,
        p_revert_to_open: !!revertToOpen,
        p_author_name: a.name, p_author_code: a.code,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false && res?.error === 'conflict') {
        const err: any = new Error('OF foi alterada por outro usuário — recarregue a página.');
        err.code = 'CONFLICT';
        throw err;
      }
      if (res?.ok === false && res?.error === 'duplicate_of_number') {
        const err: any = new Error('Já existe outra OF com este número — escolha um número diferente.');
        err.code = 'DUPLICATE_OF';
        throw err;
      }
      if (res?.ok === false && res?.error === 'invalid_of_number') {
        const err: any = new Error('Número da OF inválido.');
        err.code = 'INVALID_OF';
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      queryClient.invalidateQueries({ queryKey: ['billing_order_detail'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_for_stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_history'] });
      toast({ title: 'OF atualizada' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao editar OF', description: error.message, variant: 'destructive' });
    }
  });

  return {
    orders,
    isLoading,
    bootstrap,
    createOrder,
    updateStatus,
    editOrder,
    setDeliveryDoc: async ({ id, type, number }: { id: string; type: 'nf' | 'romaneio'; number: string }) => {
      const a = authorMeta();
      const { data, error } = await (supabase as any).rpc('set_billing_order_delivery_doc', {
        p_company_id: user?.company_id, p_id: id, p_doc_type: type, p_doc_number: number,
        p_author_name: a.name, p_author_code: a.code,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false && res?.error === 'not_ready') {
        throw new Error('OF não está mais pronta para receber NF/Romaneio — recarregue a página.');
      }
      if (res?.already && res?.conflict?.current_number) {
        throw new Error(`Documento já registrado (${res.conflict.current_number}). Recarregue a página.`);
      }
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      queryClient.invalidateQueries({ queryKey: ['billing_order_detail'] });
      toast({ title: `${type === 'nf' ? 'NF' : 'Romaneio'} registrado` });
    },
    getNextOfNumber: async (): Promise<{ last: string | null; next: string }> => {
      if (!user?.company_id) return { last: null, next: '001' };
      const { data, error } = await (supabase as any).rpc('get_billing_orders_bootstrap', {
        p_company_id: user.company_id,
      });
      if (error) throw error;
      const b = data as any;
      return {
        last: (b?.last_of_number as string | null) ?? null,
        next: (b?.next_of_number as string) ?? '001',
      };
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
    linkOrders: async (ids: string[]): Promise<string> => {
      if (!user?.company_id) throw new Error('Sessão inválida');
      if (!ids || ids.length < 2) throw new Error('Selecione pelo menos 2 OFs para atrelar.');
      const a = authorMeta();
      const { data, error } = await (supabase as any).rpc('link_billing_orders', {
        p_company_id: user.company_id, p_ids: ids,
        p_author_name: a.name, p_author_code: a.code,
      });
      if (error) throw error;
      const res = data as any;
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      toast({ title: `${res?.count ?? ids.length} OFs atreladas` });
      return res?.group_id as string;
    },
    unlinkGroup: async (groupId: string): Promise<void> => {
      if (!user?.company_id || !groupId) return;
      const a = authorMeta();
      const { error } = await (supabase as any).rpc('unlink_billing_order_group', {
        p_company_id: user.company_id, p_group_id: groupId,
        p_author_name: a.name, p_author_code: a.code,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      toast({ title: 'Atrelação desfeita' });
    },
    removeFromGroup: async (orderId: string): Promise<void> => {
      if (!user?.company_id || !orderId) return;
      const a = authorMeta();
      const { error } = await (supabase as any).rpc('remove_from_billing_order_group', {
        p_company_id: user.company_id, p_id: orderId,
        p_author_name: a.name, p_author_code: a.code,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['billing_orders_list'] });
      toast({ title: 'OF removida do grupo' });
    },
  };
}

// ---------------------------------------------------------------------------
// Fase 2 (docs/rpcBillingOrders.md): leituras paginadas server-side.
// Hooks separados para não penalizar quem já consome o `orders` completo.
// ---------------------------------------------------------------------------

export type BillingOrdersListView =
  | 'priority'
  | 'open'
  | 'separating'
  | 'awaiting_doc'
  | 'ready'
  | 'collected'
  | 'cancelled'
  | 'all';

export interface BillingOrdersListParams {
  view: BillingOrdersListView;
  search?: string;
  clientId?: string | null;
  month?: string | null;        // 'YYYY-MM'
  startDate?: string | null;    // 'YYYY-MM-DD'
  endDate?: string | null;      // 'YYYY-MM-DD'
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export interface BillingOrdersListRow {
  [k: string]: any;
  id: string;
  of_number: string;
  status: BillingOrderStatus;
  client_name?: string | null;
  article_name?: string | null;
  machine_name?: string | null;
  created_by_name?: string | null;
  created_by_code?: number | null;
  separated_by_name?: string | null;
  collected_by_name?: string | null;
  pallets: Array<{
    id: string;
    pallet_number: number;
    pieces: number;
    weight_kg: number;
    machine_id: string | null;
    machine_name: string | null;
    alt_client_id?: string | null;
    alt_article_id?: string | null;
    own_article_id?: string | null;
  }>;
  link_group_size: number;
}

export function useBillingOrdersList(params: BillingOrdersListParams) {
  const { user } = useAuth();
  const {
    view, search, clientId, month, startDate, endDate,
    page = 1, pageSize = 50, enabled = true,
  } = params;

  return useQuery({
    queryKey: [
      'billing_orders_list', user?.company_id, view,
      search ?? '', clientId ?? '', month ?? '', startDate ?? '', endDate ?? '',
      page, pageSize,
    ],
    enabled: !!user?.company_id && enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_billing_orders_list', {
        p_company_id: user!.company_id,
        p_view: view,
        p_search: search ?? null,
        p_client_id: clientId ?? null,
        p_month: month ?? null,
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      return data as {
        rows: BillingOrdersListRow[];
        total_count: number;
        page: number;
        page_size: number;
      };
    },
  });
}

export function useBillingOrderDetail(id: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['billing_order_detail', user?.company_id, id],
    enabled: !!user?.company_id && !!id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_billing_order_detail', {
        p_company_id: user!.company_id,
        p_id: id,
      });
      if (error) throw error;
      return data as Record<string, any>;
    },
  });
}
