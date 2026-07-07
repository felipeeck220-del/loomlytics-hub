import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type FreightOrderStatus =
  | 'open'
  | 'pickup_in_progress'
  | 'delivery_in_progress'
  | 'completed'
  | 'cancelled';

export interface Freighter {
  id: string;
  company_id: string;
  user_id?: string | null;
  profile_id?: string | null;
  name: string;
  phone?: string | null;
  vehicle?: string | null;
  active: boolean;
  created_at: string;
}

export interface FreightOrderItem {
  id: string;
  freight_order_id: string;
  company_id: string;
  article_id?: string | null;
  article_name?: string | null;
  pieces: number;
  weight_kg: number;
  created_at: string;
  article?: { name: string; client_id?: string | null; client_name?: string | null } | null;
}

export interface FreightOrderPhoto {
  id: string;
  freight_order_id: string;
  company_id: string;
  storage_path: string;
  description?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface FreightOrder {
  id: string;
  company_id: string;
  ofr_number: string;
  freighter_id: string;
  pickup_location: string;
  delivery_location: string;
  observations?: string | null;
  status: FreightOrderStatus;
  created_by?: string | null;
  pickup_started_at?: string | null;
  pickup_started_by?: string | null;
  delivery_started_at?: string | null;
  delivery_started_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  freighter?: Freighter | null;
  creator?: { name: string; code: string } | null;
  pickup_starter?: { name: string; code: string } | null;
  delivery_starter?: { name: string; code: string } | null;
  completer?: { name: string; code: string } | null;
  canceller?: { name: string; code: string } | null;
  items?: FreightOrderItem[];
  photos?: FreightOrderPhoto[];
}

export function useFreightOrders() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: freighters = [] } = useQuery({
    queryKey: ['freighters', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const { data, error } = await (supabase.from as any)('freighters')
        .select('*')
        .eq('company_id', user.company_id)
        .order('name');
      if (error) throw error;
      return (data || []) as Freighter[];
    },
    enabled: !!user?.company_id,
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['freight_orders', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const { data, error } = await (supabase.from as any)('freight_orders')
        .select(`
          *,
          freighter:freighters(*),
          items:freight_order_items(*, article:articles(name, client_id, client_name)),
          photos:freight_order_photos(*),
          creator:profiles!freight_orders_created_by_fkey(name, code)
        `)
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as FreightOrder[];
    },
    enabled: !!user?.company_id,
  });

  useEffect(() => {
    if (!user?.company_id) return;
    const ch = (supabase as any)
      .channel(`freight_orders_rt_${user.company_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freight_orders', filter: `company_id=eq.${user.company_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['freight_orders', user.company_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freight_order_items', filter: `company_id=eq.${user.company_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['freight_orders', user.company_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freight_order_photos', filter: `company_id=eq.${user.company_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['freight_orders', user.company_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freighters', filter: `company_id=eq.${user.company_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['freighters', user.company_id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.company_id, queryClient]);

  async function nextOfrNumber(): Promise<string> {
    // Busca todos os números da empresa (não paginado) para achar o maior real
    const { data } = await (supabase.from as any)('freight_orders')
      .select('ofr_number')
      .eq('company_id', user?.company_id as string);
    let max = 0;
    for (const r of (data || [])) {
      const n = parseInt(String(r.ofr_number).replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
  }

  const createOrder = useMutation({
    mutationFn: async (payload: {
      freighter_id: string;
      pickup_location: string;
      delivery_location: string;
      observations?: string;
      items: Array<{ article_id?: string | null; article_name?: string; pieces: number; weight_kg: number }>;
    }) => {
      if (!user?.company_id) throw new Error('Sem empresa ativa');
      if (!payload.items?.length) throw new Error('Adicione pelo menos 1 artigo');
      const ofr_number = await nextOfrNumber();
      const { data: order, error } = await (supabase.from as any)('freight_orders')
        .insert({
          company_id: user.company_id,
          ofr_number,
          freighter_id: payload.freighter_id,
          pickup_location: payload.pickup_location,
          delivery_location: payload.delivery_location,
          observations: payload.observations || null,
          status: 'open',
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      const itemsRows = payload.items.map(it => ({
        freight_order_id: order.id,
        company_id: user.company_id,
        article_id: it.article_id ?? null,
        article_name: it.article_name ?? null,
        pieces: Math.max(0, Math.round(Number(it.pieces || 0))),
        weight_kg: Math.max(0, Number(it.weight_kg || 0)),
      }));
      const { error: itErr } = await (supabase.from as any)('freight_order_items').insert(itemsRows);
      if (itErr) throw itErr;
      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_orders'] });
      toast({ title: 'Ordem de Frete criada' });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar OFR', description: e.message, variant: 'destructive' }),
  });

  const startPickup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('freight_orders').update({
        status: 'pickup_in_progress',
        pickup_started_at: new Date().toISOString(),
        pickup_started_by: profile?.id ?? null,
      }).eq('id', id).eq('status', 'open');
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_orders'] }); toast({ title: 'Coleta iniciada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const startDelivery = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('freight_orders').update({
        status: 'delivery_in_progress',
        delivery_started_at: new Date().toISOString(),
        delivery_started_by: profile?.id ?? null,
      }).eq('id', id).eq('status', 'pickup_in_progress');
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_orders'] }); toast({ title: 'Entrega iniciada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const completeOrder = useMutation({
    mutationFn: async ({ id, photos }: { id: string; photos: Array<{ file: File; description?: string }> }) => {
      if (!user?.company_id) throw new Error('Sem empresa ativa');
      if (!photos?.length) throw new Error('Anexe ao menos 1 foto da entrega');
      if (photos.length > 2) throw new Error('Máximo 2 fotos');
      const uploaded: Array<{ path: string; description?: string }> = [];
      for (const p of photos) {
        const ext = (p.file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.company_id}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('freight-photos').upload(path, p.file, {
          contentType: p.file.type || 'image/jpeg',
          upsert: false,
        });
        if (upErr) throw upErr;
        uploaded.push({ path, description: p.description });
      }
      const photoRows = uploaded.map(u => ({
        freight_order_id: id,
        company_id: user.company_id,
        storage_path: u.path,
        description: u.description || null,
        uploaded_by: profile?.id ?? null,
      }));
      const { error: pErr } = await (supabase.from as any)('freight_order_photos').insert(photoRows);
      if (pErr) throw pErr;
      const { error } = await (supabase.from as any)('freight_orders').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: profile?.id ?? null,
      }).eq('id', id).eq('status', 'delivery_in_progress');
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_orders'] }); toast({ title: 'Entrega finalizada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const cancelOrder = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase.from as any)('freight_orders').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: profile?.id ?? null,
        cancellation_reason: reason,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_orders'] }); toast({ title: 'OFR cancelada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const createFreighter = useMutation({
    mutationFn: async (payload: { name: string; phone?: string; vehicle?: string; user_id?: string; profile_id?: string }) => {
      const { error } = await (supabase.from as any)('freighters').insert({
        company_id: user?.company_id as string,
        name: payload.name,
        phone: payload.phone || null,
        vehicle: payload.vehicle || null,
        user_id: payload.user_id || null,
        profile_id: payload.profile_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freighters'] }); toast({ title: 'Freteiro cadastrado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateFreighter = useMutation({
    mutationFn: async (payload: { id: string; name?: string; phone?: string; vehicle?: string; user_id?: string | null; profile_id?: string | null; active?: boolean }) => {
      const { id, ...rest } = payload;
      const { error } = await (supabase.from as any)('freighters').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freighters'] }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteFreighter = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('freighters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freighters'] }); toast({ title: 'Freteiro removido' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  async function getPhotoSignedUrl(path: string, expires = 3600): Promise<string | null> {
    const { data } = await supabase.storage.from('freight-photos').createSignedUrl(path, expires);
    return data?.signedUrl || null;
  }

  return {
    orders, isLoading, freighters,
    createOrder, startPickup, startDelivery, completeOrder, cancelOrder,
    createFreighter, updateFreighter, deleteFreighter,
    getPhotoSignedUrl,
  };
}