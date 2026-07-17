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

export interface FreightCostCompany {
  id: string;
  company_id: string;
  name: string;
  document?: string | null;
  active: boolean;
  created_at: string;
}

export interface FreightAddress {
  id: string;
  company_id: string;
  name: string;
  full_address: string;
  latitude?: number | null;
  longitude?: number | null;
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
  item_type?: 'malha' | 'fio';
  yarn_type_id?: string | null;
  yarn_type_name?: string | null;
  boxes?: number | null;
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
  cost_company_id?: string | null;
  cost_company_name?: string | null;
  pickup_location: string;
  delivery_location: string;
  pickup_address_id?: string | null;
  delivery_address_id?: string | null;
  pickup_address?: FreightAddress | null;
  delivery_address?: FreightAddress | null;
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
  delivery_doc_type?: 'nf' | 'rom' | null;
  delivery_doc_number?: string | null;
  freight_price_per_kg?: number | null;
  freight_total?: number | null;
  freighter?: Freighter | null;
  cost_company?: FreightCostCompany | null;
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

  const { data: costCompanies = [] } = useQuery({
    queryKey: ['freight_cost_companies', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const { data, error } = await (supabase.from as any)('freight_cost_companies')
        .select('*')
        .eq('company_id', user.company_id)
        .order('name');
      if (error) throw error;
      return (data || []) as FreightCostCompany[];
    },
    enabled: !!user?.company_id,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['freight_addresses', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const { data, error } = await (supabase.from as any)('freight_addresses')
        .select('*')
        .eq('company_id', user.company_id)
        .order('name');
      if (error) throw error;
      return (data || []) as FreightAddress[];
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
          cost_company:freight_cost_companies(*),
          pickup_address:freight_addresses!freight_orders_pickup_address_id_fkey(*),
          delivery_address:freight_addresses!freight_orders_delivery_address_id_fkey(*),
          items:freight_order_items(*, article:articles(name, client_id, client_name)),
          photos:freight_order_photos(*),
          creator:profiles!freight_orders_created_by_fkey(name, code),
          pickup_starter:profiles!freight_orders_pickup_started_by_fkey(name, code),
          delivery_starter:profiles!freight_orders_delivery_started_by_fkey(name, code),
          completer:profiles!freight_orders_completed_by_fkey(name, code),
          canceller:profiles!freight_orders_cancelled_by_fkey(name, code)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freight_cost_companies', filter: `company_id=eq.${user.company_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['freight_cost_companies', user.company_id] });
        queryClient.invalidateQueries({ queryKey: ['freight_orders', user.company_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freight_addresses', filter: `company_id=eq.${user.company_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['freight_addresses', user.company_id] });
        queryClient.invalidateQueries({ queryKey: ['freight_orders', user.company_id] });
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
      cost_company_id: string;
      pickup_location: string;
      delivery_location: string;
      pickup_address_id?: string | null;
      delivery_address_id?: string | null;
      observations?: string;
      delivery_doc_type?: 'nf' | 'rom' | null;
      delivery_doc_number?: string | null;
      items: Array<{
        item_type: 'malha' | 'fio';
        article_id?: string | null;
        article_name?: string | null;
        yarn_type_id?: string | null;
        yarn_type_name?: string | null;
        boxes?: number | null;
        pieces: number;
        weight_kg: number;
      }>;
    }) => {
      if (!user?.company_id) throw new Error('Sem empresa ativa');
      if (!payload.items?.length) throw new Error('Adicione pelo menos 1 artigo');
      if (!payload.cost_company_id) throw new Error('Selecione a empresa (Rateio de custo)');
      // Retry para evitar colisão de OFR# quando 2 admins criam ao mesmo tempo
      let order: any = null;
      let ofr_number = '';
      let lastErr: any = null;
      // Snapshot do nome da empresa de custo (histórico imutável)
      const costCompanySnapshot = costCompanies.find(c => c.id === payload.cost_company_id);
      for (let attempt = 0; attempt < 5; attempt++) {
        ofr_number = await nextOfrNumber();
        const { data, error } = await (supabase.from as any)('freight_orders')
          .insert({
            company_id: user.company_id,
            ofr_number,
            freighter_id: payload.freighter_id,
            cost_company_id: payload.cost_company_id,
            cost_company_name: costCompanySnapshot?.name || null,
            pickup_location: payload.pickup_location,
            delivery_location: payload.delivery_location,
            pickup_address_id: payload.pickup_address_id ?? null,
            delivery_address_id: payload.delivery_address_id ?? null,
            observations: payload.observations || null,
            delivery_doc_type: payload.delivery_doc_type || null,
            delivery_doc_number: payload.delivery_doc_number || null,
            status: 'open',
            created_by: profile?.id ?? null,
          })
          .select()
          .single();
        if (!error) { order = data; lastErr = null; break; }
        lastErr = error;
        // 23505 = unique_violation → tenta próximo número
        if ((error as any).code !== '23505') throw error;
      }
      if (!order) throw lastErr || new Error('Falha ao gerar número da OFR');
      const itemsRows = payload.items.map(it => ({
        freight_order_id: order.id,
        company_id: user.company_id,
        item_type: it.item_type,
        article_id: it.article_id ?? null,
        article_name: it.article_name ?? null,
        yarn_type_id: it.yarn_type_id ?? null,
        yarn_type_name: it.yarn_type_name ?? null,
        boxes: it.boxes != null ? Math.max(0, Math.round(Number(it.boxes))) : null,
        pieces: Math.max(0, Math.round(Number(it.pieces || 0))),
        weight_kg: Math.max(0, Number(it.weight_kg || 0)),
      }));
      const { error: itErr } = await (supabase.from as any)('freight_order_items').insert(itemsRows);
      if (itErr) {
        // rollback: remove a OFR "vazia" para não deixar lixo/UNIQUE consumido
        await (supabase.from as any)('freight_orders').delete().eq('id', order.id);
        throw itErr;
      }
      // Push notification (admins + freteiro vinculado, se tiver user_id)
      try {
        const { data: frt } = await (supabase.from as any)('freighters')
          .select('name, user_id')
          .eq('id', payload.freighter_id)
          .maybeSingle();
        const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
        const targetPath = slug ? `/${slug}/freight-orders` : '/';
        const nPieces = payload.items.reduce((s, i) => s + (Number(i.pieces) || 0), 0);
        const nBoxes = payload.items.reduce((s, i) => s + (Number(i.boxes) || 0), 0);
        const nKg = payload.items.reduce((s, i) => s + (Number(i.weight_kg) || 0), 0);
        const kgStr = nKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const parts: string[] = [];
        if (nPieces > 0) parts.push(`${nPieces} peça(s)`);
        if (nBoxes > 0) parts.push(`${nBoxes} caixa(s)`);
        parts.push(`${kgStr} kg`);
        const message = `${payload.pickup_location} → ${payload.delivery_location} · ${parts.join(' · ')}`;
        supabase.functions.invoke('send-push-notification', {
          body: {
            company_id: user.company_id,
            title: `Nova OFR #${ofr_number} — ${frt?.name || 'Freteiro'}`,
            message,
            url: targetPath,
            include_admins: true,
            target_user_ids: frt?.user_id ? [frt.user_id] : [],
            source: 'OFR',
            ref_id: order.id,
            ref_number: `OFR #${ofr_number}`,
          },
        }).catch(() => { /* silencioso */ });
      } catch { /* silencioso */ }
      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_orders'] });
      toast({ title: 'Ordem de Frete criada' });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar OFR', description: e.message, variant: 'destructive' }),
  });

  const updateOrder = useMutation({
    mutationFn: async (payload: {
      id: string;
      freighter_id: string;
      cost_company_id: string;
      pickup_location: string;
      delivery_location: string;
      pickup_address_id?: string | null;
      delivery_address_id?: string | null;
      observations?: string | null;
      delivery_doc_type?: 'nf' | 'rom' | null;
      delivery_doc_number?: string | null;
      items: Array<{
        item_type: 'malha' | 'fio';
        article_id?: string | null;
        article_name?: string | null;
        yarn_type_id?: string | null;
        yarn_type_name?: string | null;
        boxes?: number | null;
        pieces: number;
        weight_kg: number;
      }>;
    }) => {
      if (!user?.company_id) throw new Error('Sem empresa ativa');
      if (!payload.items?.length) throw new Error('Adicione pelo menos 1 artigo');
      if (!payload.cost_company_id) throw new Error('Selecione a empresa (Rateio de custo)');
      // Só permite editar em Aberto
      const { data: current, error: curErr } = await (supabase.from as any)('freight_orders')
        .select('id, status, ofr_number, freighter_id')
        .eq('id', payload.id)
        .maybeSingle();
      if (curErr) throw curErr;
      if (!current) throw new Error('OFR não encontrada');
      if (current.status !== 'open') throw new Error('Somente OFRs em Aberto podem ser editadas');

      const costCompanySnapshot = costCompanies.find(c => c.id === payload.cost_company_id);
      const { error: upErr } = await (supabase.from as any)('freight_orders').update({
        freighter_id: payload.freighter_id,
        cost_company_id: payload.cost_company_id,
        cost_company_name: costCompanySnapshot?.name || null,
        pickup_location: payload.pickup_location,
        delivery_location: payload.delivery_location,
        pickup_address_id: payload.pickup_address_id ?? null,
        delivery_address_id: payload.delivery_address_id ?? null,
        observations: payload.observations || null,
        delivery_doc_type: payload.delivery_doc_type || null,
        delivery_doc_number: payload.delivery_doc_number || null,
      }).eq('id', payload.id).eq('status', 'open');
      if (upErr) throw upErr;

      // Substitui itens (remove todos e reinsere)
      const { error: delErr } = await (supabase.from as any)('freight_order_items')
        .delete().eq('freight_order_id', payload.id);
      if (delErr) throw delErr;
      const itemsRows = payload.items.map(it => ({
        freight_order_id: payload.id,
        company_id: user.company_id,
        item_type: it.item_type,
        article_id: it.article_id ?? null,
        article_name: it.article_name ?? null,
        yarn_type_id: it.yarn_type_id ?? null,
        yarn_type_name: it.yarn_type_name ?? null,
        boxes: it.boxes != null ? Math.max(0, Math.round(Number(it.boxes))) : null,
        pieces: Math.max(0, Math.round(Number(it.pieces || 0))),
        weight_kg: Math.max(0, Number(it.weight_kg || 0)),
      }));
      const { error: insErr } = await (supabase.from as any)('freight_order_items').insert(itemsRows);
      if (insErr) throw insErr;

      // Se o freteiro mudou, notifica o novo freteiro (o realtime já retira a OFR
      // do freteiro anterior automaticamente ao invalidar o cache).
      if (current.freighter_id !== payload.freighter_id) {
        try {
          const { data: frt } = await (supabase.from as any)('freighters')
            .select('name, user_id').eq('id', payload.freighter_id).maybeSingle();
          const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
          const targetPath = slug ? `/${slug}/freight-orders` : '/';
          const nKg = payload.items.reduce((s, i) => s + (Number(i.weight_kg) || 0), 0);
          const kgStr = nKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          supabase.functions.invoke('send-push-notification', {
            body: {
              company_id: user.company_id,
              title: `OFR #${current.ofr_number} reatribuída — ${frt?.name || 'Freteiro'}`,
              message: `${payload.pickup_location} → ${payload.delivery_location} · ${kgStr} kg`,
              url: targetPath,
              include_admins: true,
              target_user_ids: frt?.user_id ? [frt.user_id] : [],
              source: 'OFR',
              ref_id: payload.id,
              ref_number: `OFR #${current.ofr_number}`,
            },
          }).catch(() => { /* silencioso */ });
        } catch { /* silencioso */ }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freight_orders'] });
      toast({ title: 'OFR atualizada' });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar OFR', description: e.message, variant: 'destructive' }),
  });

  const createCostCompany = useMutation({
    mutationFn: async (payload: { name: string; document?: string }) => {
      if (!user?.company_id) throw new Error('Sem empresa ativa');
      const { error } = await (supabase.from as any)('freight_cost_companies').insert({
        company_id: user.company_id,
        name: payload.name.trim(),
        document: payload.document?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_cost_companies'] }); toast({ title: 'Empresa cadastrada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateCostCompany = useMutation({
    mutationFn: async (payload: { id: string; name?: string; document?: string | null; active?: boolean }) => {
      const { id, ...rest } = payload;
      const { error } = await (supabase.from as any)('freight_cost_companies').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_cost_companies'] }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteCostCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('freight_cost_companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_cost_companies'] }); toast({ title: 'Empresa removida' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_orders'] }); toast({ title: 'Frete iniciado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const completeOrder = useMutation({
    mutationFn: async ({ id, photos, freight_price_per_kg, delivery_doc_type, delivery_doc_number }: {
      id: string;
      photos: Array<{ file: File; description?: string }>;
      freight_price_per_kg?: number | null;
      delivery_doc_type?: 'nf' | 'rom' | null;
      delivery_doc_number?: string | null;
    }) => {
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
      // Total do frete = kg total × preço por kg
      const { data: items } = await (supabase.from as any)('freight_order_items')
        .select('weight_kg').eq('freight_order_id', id);
      const totalKg = (items || []).reduce((s: number, r: any) => s + Number(r.weight_kg || 0), 0);
      const pricePerKg = Number(freight_price_per_kg || 0);
      const freightTotal = Math.round(totalKg * pricePerKg * 100) / 100;
      const updatePayload: any = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: profile?.id ?? null,
        freight_price_per_kg: pricePerKg || null,
        freight_total: pricePerKg > 0 ? freightTotal : null,
      };
      if (delivery_doc_type) updatePayload.delivery_doc_type = delivery_doc_type;
      if (delivery_doc_number != null) updatePayload.delivery_doc_number = delivery_doc_number || null;
      const { error } = await (supabase.from as any)('freight_orders').update(updatePayload)
        .eq('id', id).in('status', ['pickup_in_progress','delivery_in_progress']);
      if (error) throw error;
      // Push notification para admins ao finalizar OFR
      try {
        const { data: ord } = await (supabase.from as any)('freight_orders')
          .select('ofr_number, pickup_location, delivery_location, freighter:freighters(name)')
          .eq('id', id)
          .maybeSingle();
        const ofrNum = ord?.ofr_number;
        const frtName = ord?.freighter?.name || 'Freteiro';
        const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
        const targetPath = slug ? `/${slug}/freight-orders` : '/';
        const kgStr = totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const message = `${ord?.pickup_location || ''} → ${ord?.delivery_location || ''} · ${kgStr} kg`;
        supabase.functions.invoke('send-push-notification', {
          body: {
            company_id: user.company_id,
            title: `OFR #${ofrNum} finalizada — ${frtName}`,
            message,
            url: targetPath,
            include_admins: true,
            source: 'OFR',
            ref_id: id,
            ref_number: `OFR #${ofrNum}`,
          },
        }).catch(() => { /* silencioso */ });
      } catch { /* silencioso */ }
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

  const createAddress = useMutation({
    mutationFn: async (payload: { name: string; full_address: string; latitude?: number | null; longitude?: number | null }) => {
      if (!user?.company_id) throw new Error('Sem empresa ativa');
      const { error } = await (supabase.from as any)('freight_addresses').insert({
        company_id: user.company_id,
        name: payload.name.trim(),
        full_address: payload.full_address.trim(),
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_addresses'] }); toast({ title: 'Endereço cadastrado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateAddress = useMutation({
    mutationFn: async (payload: { id: string; name?: string; full_address?: string; latitude?: number | null; longitude?: number | null; active?: boolean }) => {
      const { id, ...rest } = payload;
      const { error } = await (supabase.from as any)('freight_addresses').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_addresses'] }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteAddress = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('freight_addresses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['freight_addresses'] }); toast({ title: 'Endereço removido' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return {
    orders, isLoading, freighters, costCompanies, addresses,
    createOrder, updateOrder, startPickup, completeOrder, cancelOrder,
    createFreighter, updateFreighter, deleteFreighter,
    createCostCompany, updateCostCompany, deleteCostCompany,
    createAddress, updateAddress, deleteAddress,
    getPhotoSignedUrl,
  };
}