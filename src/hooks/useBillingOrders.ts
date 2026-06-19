import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  collector?: { name: string; code: string };
  prioritizer?: { name: string; code: string };
  canceller?: { name: string; code: string };
  editor?: { name: string; code: string };
  delivery_doc_setter?: { name: string; code: string };
  link_group_id?: string | null;
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
      // 'all' = coletar tudo disponível, sem peças/peso pré-definidos

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
    mutationFn: async ({ id, status, data = {}, expectedStatus, reversalQuality }: { id: string, status: BillingOrderStatus | 'priority', data?: any, expectedStatus?: BillingOrderStatus, reversalQuality?: 'first' | 'second' }) => {
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
        // Marca de onde veio o cancelamento (informativo)
        if (expectedStatus) (updatePayload as any).reverted_from = expectedStatus;
        // Quando estorna uma OF já coletada, registra o estorno
        if (expectedStatus === 'collected') {
          (updatePayload as any).reversal_reason = updatePayload.cancellation_reason;
          (updatePayload as any).reversed_by = profile?.id;
          (updatePayload as any).reversed_at = new Date().toISOString();
          (updatePayload as any).reversal_quality = reversalQuality || 'first';
        }
      }
      if (status === 'priority') {
        updatePayload.priority = true;
        updatePayload.priority_at = new Date().toISOString();
        updatePayload.priority_by = profile?.id;
      }

      // Se a OF tem paletes salvos, separating→ready DEVE usar a SOMA dos paletes
      // como pieces_real/weight_real — mesmo que o usuário tenha clicado em
      // "Lançar Dados" com números diferentes (caso contrário o release no
      // collected não bateria com a soma dos reserves individuais já gerados).
      if (status === 'ready' && expectedStatus === 'separating') {
        const { data: palletRows } = await (supabase.from as any)('billing_order_pallets')
          .select('pieces, weight_kg')
          .eq('billing_order_id', id);
        if (palletRows && palletRows.length > 0) {
          const sumP = palletRows.reduce((s: number, p: any) => s + Number(p.pieces || 0), 0);
          const sumW = palletRows.reduce((s: number, p: any) => s + Number(p.weight_kg || 0), 0);
          updatePayload.pieces_real = sumP;
          updatePayload.weight_real = sumW;
          updatePayload.weight_avg = sumP > 0 ? sumW / sumP : 0;
        }
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

      // Movimentos de estoque conforme ciclo de vida da OF
      if (rows && rows.length > 0 && user?.company_id) {
        const { data: ofRow } = await supabase
          .from('billing_orders')
          .select('article_id, client_id, machine_id, pieces_real, weight_real, of_number, pieces_expected, weight_expected')
          .eq('id', id)
          .maybeSingle();
        if (ofRow?.article_id) {
          const pieces = Math.max(0, Math.round(Number(ofRow.pieces_real ?? ofRow.pieces_expected ?? 0)));
          const weight = Math.max(0, Number(ofRow.weight_real ?? ofRow.weight_expected ?? 0));
          const baseMov = {
            company_id: user.company_id,
            article_id: ofRow.article_id,
            client_id: ofRow.client_id,
            billing_order_id: id,
            created_by: profile?.id ?? null,
          };
          const mvs: any[] = [];

          // separating -> ready: reserva o estoque
          if (status === 'ready' && expectedStatus === 'separating' && (pieces > 0 || weight > 0)) {
            // Se já há paletes salvos (com reservas individuais), NÃO duplica a reserva.
            const { count: palletCount } = await (supabase.from as any)('billing_order_pallets')
              .select('id', { count: 'exact', head: true })
              .eq('billing_order_id', id);
            if (!palletCount || palletCount === 0) {
              mvs.push({ ...baseMov, machine_id: (ofRow as any).machine_id ?? null,
                type: 'reserve', pieces, weight_kg: weight,
                reason: `OF #${ofRow.of_number} pronta (reserva)` });
            }
          }

          // ready -> collected: libera a reserva e baixa do físico
          if (status === 'collected' && expectedStatus === 'ready' && (pieces > 0 || weight > 0)) {
            // Libera APENAS o que foi realmente reservado, agrupando por máquina
            // — assim a baixa do estoque mantém a separação por máquina.
            const { data: existingMvs } = await (supabase.from as any)('stock_movements')
              .select('type, pieces, weight_kg, machine_id')
              .eq('billing_order_id', id)
              .in('type', ['reserve', 'release']);
            const netByMachine = new Map<string, { p: number; w: number; mid: string | null }>();
            for (const m of (existingMvs || [])) {
              const k = (m.machine_id as string | null) || '__none__';
              const cur = netByMachine.get(k) || { p: 0, w: 0, mid: (m.machine_id as string | null) || null };
              const p = Number(m.pieces || 0); const w = Number(m.weight_kg || 0);
              if (m.type === 'reserve') { cur.p += p; cur.w += w; }
              else if (m.type === 'release') { cur.p -= p; cur.w -= w; }
              netByMachine.set(k, cur);
            }
            for (const cur of netByMachine.values()) {
              if (cur.p > 0 || cur.w > 0) {
                mvs.push({ ...baseMov, machine_id: cur.mid, type: 'release',
                  pieces: Math.max(0, Math.round(cur.p)),
                  weight_kg: Math.max(0, cur.w),
                  reason: `OF #${ofRow.of_number} coletada (libera reserva)` });
              }
            }
            // Baixa do físico: prefere agrupar por máquina a partir dos paletes
            const { data: palletRows } = await (supabase.from as any)('billing_order_pallets')
              .select('pieces, weight_kg, machine_id')
              .eq('billing_order_id', id);
            if (palletRows && palletRows.length > 0) {
              const outByMachine = new Map<string, { p: number; w: number; mid: string | null }>();
              for (const pr of palletRows) {
                const k = (pr.machine_id as string | null) || '__none__';
                const cur = outByMachine.get(k) || { p: 0, w: 0, mid: (pr.machine_id as string | null) || null };
                cur.p += Number(pr.pieces || 0);
                cur.w += Number(pr.weight_kg || 0);
                outByMachine.set(k, cur);
              }
              for (const cur of outByMachine.values()) {
                if (cur.p > 0 || cur.w > 0) {
                  mvs.push({ ...baseMov, machine_id: cur.mid, type: 'out',
                    pieces: Math.max(0, Math.round(cur.p)),
                    weight_kg: Math.max(0, cur.w),
                    reason: `OF #${ofRow.of_number} coletada` });
                }
              }
            } else {
              mvs.push({ ...baseMov, machine_id: (ofRow as any).machine_id ?? null,
                type: 'out', pieces, weight_kg: weight,
                reason: `OF #${ofRow.of_number} coletada` });
            }
          }

          // *->cancelled (exceto a partir de 'collected'): libera APENAS o que está
          // efetivamente reservado para esta OF (soma de reserves − releases já feitos).
          // Evita criar release "fantasma" quando a OF nunca teve reserva (ex.: OFs
          // antigas, anteriores à integração com estoque) — o que deixava reservedKg
          // negativo em /estoque-malha.
          if (status === 'cancelled' && expectedStatus !== 'collected' && expectedStatus !== 'cancelled') {
            const { data: existingMvs } = await (supabase.from as any)('stock_movements')
              .select('type, pieces, weight_kg, machine_id')
              .eq('billing_order_id', id)
              .in('type', ['reserve', 'release']);
            const netByMachine = new Map<string, { p: number; w: number; mid: string | null }>();
            for (const m of (existingMvs || [])) {
              const k = (m.machine_id as string | null) || '__none__';
              const cur = netByMachine.get(k) || { p: 0, w: 0, mid: (m.machine_id as string | null) || null };
              const p = Number(m.pieces || 0); const w = Number(m.weight_kg || 0);
              if (m.type === 'reserve') { cur.p += p; cur.w += w; }
              else if (m.type === 'release') { cur.p -= p; cur.w -= w; }
              netByMachine.set(k, cur);
            }
            for (const cur of netByMachine.values()) {
              if (cur.p > 0 || cur.w > 0) {
                mvs.push({ ...baseMov, machine_id: cur.mid, type: 'release',
                  pieces: Math.max(0, Math.round(cur.p)),
                  weight_kg: Math.max(0, cur.w),
                  reason: `OF #${ofRow.of_number} cancelada (libera reserva pendente)` });
              }
            }
            // Limpa paletes vinculados (se houver) — OF cancelada não retém paletes
            await (supabase.from as any)('billing_order_pallets').delete().eq('billing_order_id', id);
          }

          // collected -> cancelled: estorno (devolve ao físico)
          if (status === 'cancelled' && expectedStatus === 'collected' && (pieces > 0 || weight > 0)) {
            const isSecondQ = reversalQuality === 'second';
            mvs.push({
              ...baseMov, machine_id: (ofRow as any).machine_id ?? null,
              type: 'in', pieces, weight_kg: weight,
              is_second_quality: isSecondQ,
              reason: `OF #${ofRow.of_number} estornada — ${isSecondQ ? '2ª QUALIDADE' : '1ª qualidade'} — ${updatePayload.cancellation_reason || 'sem motivo'}`,
            });
          }

          if (mvs.length > 0) {
            const { error: mvErr } = await (supabase.from as any)('stock_movements').insert(mvs);
            if (mvErr) {
              // Status da OF já foi atualizado — não revertemos, mas avisamos no console
              // e levantamos um erro amigável para o toast/onError.
              console.error('[useBillingOrders] stock_movements insert failed:', mvErr);
              const e: any = new Error(`Status atualizado, mas o lançamento no estoque falhou: ${mvErr.message}`);
              e.code = 'STOCK_MOVEMENT_FAILED';
              throw e;
            }
          }
        }
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_for_stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements_history'] });
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
      if (error?.code === 'STOCK_MOVEMENT_FAILED') {
        queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
        queryClient.invalidateQueries({ queryKey: ['stock_movements_for_stock'] });
        queryClient.invalidateQueries({ queryKey: ['stock_movements_history'] });
        toast({ title: 'Estoque não atualizado', description: error.message, variant: 'destructive' });
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
      // Snapshot do que será revertido para emitir 'release' depois
      let preReleaseSnapshot: { pieces: number; weight: number; article_id: string | null; client_id: string | null; of_number: string | null; prev_status: string | null } | null = null;
      if (revertToOpen) {
        const { data: pre } = await supabase
          .from('billing_orders')
          .select('article_id, client_id, of_number, pieces_real, weight_real, status')
          .eq('id', id)
          .maybeSingle();
        preReleaseSnapshot = {
          pieces: Math.max(0, Math.round(Number(pre?.pieces_real || 0))),
          weight: Math.max(0, Number(pre?.weight_real || 0)),
          article_id: pre?.article_id ?? null,
          client_id: pre?.client_id ?? null,
          of_number: pre?.of_number ?? null,
          prev_status: pre?.status ?? null,
        };
      }

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

      // Revert para 'open': libera APENAS o que está efetivamente reservado
      // (soma de reserves − releases já feitos para esta OF). Evita release
      // fantasma em OFs antigas sem reserva prévia.
      if (revertToOpen && preReleaseSnapshot && preReleaseSnapshot.article_id && user?.company_id) {
        const { data: existingMvs } = await (supabase.from as any)('stock_movements')
          .select('type, pieces, weight_kg')
          .eq('billing_order_id', id)
          .in('type', ['reserve', 'release']);
        let netP = 0, netW = 0;
        for (const m of (existingMvs || [])) {
          const p = Number(m.pieces || 0); const w = Number(m.weight_kg || 0);
          if (m.type === 'reserve') { netP += p; netW += w; }
          else if (m.type === 'release') { netP -= p; netW -= w; }
        }
        if (netP > 0 || netW > 0) {
          await (supabase.from as any)('stock_movements').insert({
            company_id: user.company_id,
            article_id: preReleaseSnapshot.article_id,
            client_id: preReleaseSnapshot.client_id,
            billing_order_id: id,
            type: 'release',
            pieces: Math.max(0, Math.round(netP)),
            weight_kg: Math.max(0, netW),
            reason: `OF #${preReleaseSnapshot.of_number} editada — reserva liberada`,
            created_by: profile?.id ?? null,
          });
        }
      }

      // Em qualquer revert para Aberto, apaga paletes salvos (usuário recomeça a separação do zero)
      if (revertToOpen) {
        await (supabase.from as any)('billing_order_pallets').delete().eq('billing_order_id', id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
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
    createOrder,
    updateStatus,
    editOrder,
    setDeliveryDoc: async ({ id, type, number }: { id: string; type: 'nf' | 'romaneio'; number: string }) => {
      if (!number || number.trim().length < 1) {
        throw new Error('Informe o número do documento');
      }
      const { error } = await supabase
        .from('billing_orders' as any)
        .update({
          delivery_doc_type: type,
          delivery_doc_number: number.trim(),
          delivery_doc_set_by: profile?.id,
          delivery_doc_set_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: `${type === 'nf' ? 'NF' : 'Romaneio'} registrado` });
    },
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
    linkOrders: async (ids: string[]): Promise<string> => {
      if (!user?.company_id) throw new Error('Sessão inválida');
      if (!ids || ids.length < 2) throw new Error('Selecione pelo menos 2 OFs para atrelar.');
      // Se alguma das OFs já pertence a um grupo, reutiliza o mesmo group_id (mescla os grupos)
      const { data: existing } = await supabase
        .from('billing_orders')
        .select('id, link_group_id')
        .in('id', ids);
      const existingGroups = Array.from(new Set((existing || []).map((r: any) => r.link_group_id).filter(Boolean)));
      const groupId: string = existingGroups[0] || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      // Coleta TODOS os ids que devem ficar no grupo final (selecionados + qualquer um que já pertença a grupos sendo mesclados)
      let allIds = new Set<string>(ids);
      if (existingGroups.length > 0) {
        const { data: members } = await supabase
          .from('billing_orders')
          .select('id')
          .eq('company_id', user.company_id)
          .in('link_group_id', existingGroups as string[]);
        (members || []).forEach((m: any) => allIds.add(m.id));
      }
      const { error } = await supabase
        .from('billing_orders')
        .update({ link_group_id: groupId } as any)
        .in('id', Array.from(allIds))
        .eq('company_id', user.company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: `${allIds.size} OFs atreladas` });
      return groupId;
    },
    unlinkGroup: async (groupId: string): Promise<void> => {
      if (!user?.company_id || !groupId) return;
      const { error } = await supabase
        .from('billing_orders')
        .update({ link_group_id: null } as any)
        .eq('company_id', user.company_id)
        .eq('link_group_id', groupId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: 'Atrelação desfeita' });
    },
    removeFromGroup: async (orderId: string): Promise<void> => {
      if (!user?.company_id || !orderId) return;
      // Captura o grupo antes de remover, para checar se ficará órfão (1 OF só)
      const { data: target } = await supabase
        .from('billing_orders')
        .select('link_group_id')
        .eq('id', orderId)
        .maybeSingle();
      const gid = (target as any)?.link_group_id;
      const { error } = await supabase
        .from('billing_orders')
        .update({ link_group_id: null } as any)
        .eq('company_id', user.company_id)
        .eq('id', orderId);
      if (error) throw error;
      // Se sobrou apenas 1 OF no grupo, limpa também para evitar grupo órfão
      if (gid) {
        const { data: remaining } = await supabase
          .from('billing_orders')
          .select('id')
          .eq('company_id', user.company_id)
          .eq('link_group_id', gid);
        if (remaining && remaining.length === 1) {
          await supabase
            .from('billing_orders')
            .update({ link_group_id: null } as any)
            .eq('company_id', user.company_id)
            .eq('link_group_id', gid);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['billing_orders'] });
      toast({ title: 'OF removida do grupo' });
    },
  };
}
