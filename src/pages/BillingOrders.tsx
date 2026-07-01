import { useState, useMemo, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useBillingOrders, type BillingOrderStatus } from '@/hooks/useBillingOrders';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
  import { Search, Plus, Play, CheckCircle2, Truck, Loader2, AlertTriangle, MessageSquare, Printer, Pencil, Ban, History, FileText, User as UserIcon, Boxes, Trash2, Link2, Link2Off, Eye } from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import { sanitizePdfText } from '@/lib/pdfUtils';

const BillingOrders = () => {
  const { user, profile } = useAuth();
  const { role } = usePermissions();
  const { toast } = useToast();
  const { getClients, getArticles, getMachines } = useSharedCompanyData();
  const { orders, isLoading, createOrder, updateStatus, editOrder, getNextOfNumber, ofExists, setDeliveryDoc, linkOrders, unlinkGroup, removeFromGroup } = useBillingOrders() as any;

  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState<BillingOrderStatus | 'all' | 'priority_tab' | 'awaiting_doc'>('open');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState<any>(null);
  const [confirmFinalizePallets, setConfirmFinalizePallets] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState<any>(null);
  const [showCollectConfirm, setShowCollectConfirm] = useState<any>(null);
  const [showStartSepConfirm, setShowStartSepConfirm] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reversalQuality, setReversalQuality] = useState<'first' | 'second'>('first');

  // Modal documento de saída (NF/Romaneio) e modal de escolha de impressão (admin)
  const [showDocModal, setShowDocModal] = useState<any>(null);
  const [docForm, setDocForm] = useState<{ type: 'nf' | 'romaneio'; number: string }>({ type: 'nf', number: '' });
  const [showPrintChoice, setShowPrintChoice] = useState<any>(null);

  // Auto-numeração e detecção de duplicidade no modal Nova OF
  const [lastOfNumber, setLastOfNumber] = useState<string | null>(null);
  const [createDupError, setCreateDupError] = useState<string | null>(null);

  // Modal de conflito (outro usuário já alterou o status)
  const [conflictInfo, setConflictInfo] = useState<{ action: string; ofNumber: string; currentStatus?: string; actor?: { name: string; code: string } | null } | null>(null);
  const [editForm, setEditForm] = useState<any>({
    of_number: '', client_id: '', article_id: '', machine_id: '',
    pieces_expected: '', weight_expected: '', dyehouse: '',
    order_type: 'pieces', edit_note: '', piece_weight_target: ''
  });
  
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

  // Paginação da aba Coletadas (10 por página)
  const [collectedPage, setCollectedPage] = useState(1);
  const COLLECTED_PAGE_SIZE = 10;

  // Aviso de saldo negativo ao criar OF
  const [negativeWarning, setNegativeWarning] = useState<null | {
    currentKg: number; currentPieces: number;
    requestedKg: number; requestedPieces: number;
    afterKg: number; afterPieces: number;
    articleName: string;
    payload: any;
  }>(null);

  // Modal de Paletes na Separação
  const [showPalletsModal, setShowPalletsModal] = useState<any>(null);
  // Modal de Detalhes (olho)
  const [showDetailsModal, setShowDetailsModal] = useState<any>(null);
  const [detailsPallets, setDetailsPallets] = useState<Array<{ id: string; pallet_number: number; pieces: number; weight: number; machine_id: string | null }>>([]);
  const [pallets, setPallets] = useState<Array<{ id: string; pieces: number; weight: number; pallet_number: number; reserve_movement_id?: string | null; machine_id?: string | null }>>([]);
  const [palletInput, setPalletInput] = useState<{ pieces: string; weight: string; machine_id: string }>({ pieces: '', weight: '', machine_id: 'none' });
  const [palletBusy, setPalletBusy] = useState(false);
  const [palletsLoading, setPalletsLoading] = useState(false);

  // Modal de Atrelar OFs
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSelected, setLinkSelected] = useState<Set<string>>(new Set());
  const [linkBusy, setLinkBusy] = useState(false);

  // Carrega paletes salvos ao abrir o modal
  useEffect(() => {
    if (!showPalletsModal) return;
    let cancelled = false;
    setPalletsLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('billing_order_pallets' as any)
        .select('id, pallet_number, pieces, weight_kg, reserve_movement_id, machine_id')
        .eq('billing_order_id', showPalletsModal.id)
        .order('pallet_number', { ascending: true });
      if (cancelled) { setPalletsLoading(false); return; }
      if (error) {
        toast({ title: 'Erro ao carregar paletes', description: error.message, variant: 'destructive' });
        setPalletsLoading(false);
        return;
      }
      setPallets((data || []).map((r: any) => ({
        id: r.id,
        pallet_number: r.pallet_number,
        pieces: Number(r.pieces || 0),
        weight: Number(r.weight_kg || 0),
        reserve_movement_id: r.reserve_movement_id,
        machine_id: r.machine_id ?? null,
      })));
      setPalletsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [showPalletsModal, toast]);

  // Carrega paletes do modal de Detalhes (olho)
  useEffect(() => {
    if (!showDetailsModal) { setDetailsPallets([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('billing_order_pallets' as any)
        .select('id, pallet_number, pieces, weight_kg, machine_id')
        .eq('billing_order_id', showDetailsModal.id)
        .order('pallet_number', { ascending: true });
      if (cancelled || error || !data) return;
      setDetailsPallets((data as any[]).map(r => ({
        id: r.id,
        pallet_number: r.pallet_number,
        pieces: Number(r.pieces || 0),
        weight: Number(r.weight_kg || 0),
        machine_id: r.machine_id ?? null,
      })));
    })();
    return () => { cancelled = true; };
  }, [showDetailsModal]);

  const refreshStockCaches = () => {
    // hook do BillingOrders já invalida estoque em mutations próprias; aqui forçamos manualmente
    // para o caso de inserts diretos em stock_movements feitos pelo modal de paletes.
    try {
      // window event para que /estoque-malha (se aberto) recarregue
      window.dispatchEvent(new CustomEvent('stock-movements-changed'));
    } catch {}
  };

  const [form, setForm] = useState({
    of_number: '',
    client_id: '',
    article_id: '',
    machine_id: '',
    pieces_expected: '',
    dyehouse: '',
    weight_expected: '',
    piece_weight_target: '',
    order_type: 'pieces' as 'pieces' | 'weight' | 'all',
  });

  // Ao abrir o modal de criação, busca o último número gerado e sugere o próximo.
  useEffect(() => {
    if (!showCreateModal) return;
    let cancelled = false;
    (async () => {
      try {
        const { last, next } = await getNextOfNumber();
        if (cancelled) return;
        setLastOfNumber(last);
        setForm(f => ({ ...f, of_number: next }));
        setCreateDupError(null);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [showCreateModal]);

  const [launchForm, setLaunchForm] = useState({
    pieces_real: '',
    weight_real: ''
  });

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.client?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.dyehouse.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.of_number.includes(searchTerm) ||
        (order.article?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
        (((order as any).delivery_doc_number || '').toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (activeTab === 'all') return matchesSearch;
      
      if (activeTab === 'priority_tab') {
        return order.priority && order.status === 'open' && matchesSearch;
      }

      // Se for a aba Aberto, garantir que mostre apenas o que não é prioridade e tem status open
      if (activeTab === 'open') {
        return order.status === 'open' && !order.priority && matchesSearch;
      }

      // "Aguardando NF/ROM" = OF pronta (separada) mas sem NF/Romaneio lançado
      if (activeTab === 'awaiting_doc') {
        if (order.status !== 'ready') return false;
        if (!!(order as any).delivery_doc_number) return false;
        if (!matchesSearch) return false;
        return true;
      }

      // "Pronto para coleta" = OF pronta COM NF/Romaneio já lançado
      if (activeTab === 'ready') {
        if (order.status !== 'ready') return false;
        if (!(order as any).delivery_doc_number) return false;
        if (!matchesSearch) return false;
        return true;
      }

      if (order.status !== activeTab) return false;
      if (!matchesSearch) return false;

      // Filtros específicos para "Coletadas"
      if (activeTab === 'collected') {
        // Usa a data/hora da COLETA (collected_at). Fallback para updated_at em
        // registros antigos sem backfill.
        const ref = (order as any).collected_at || order.updated_at || order.created_at;
        const orderDate = new Date(ref);
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

  // Resetar página ao mudar filtros/aba
  useEffect(() => { setCollectedPage(1); }, [activeTab, datePreset, filterDateRange.from, filterDateRange.to, searchTerm]);

  // Ordena Coletadas pela data da coleta (mais recente primeiro) e pagina
  const sortedCollected = useMemo(() => {
    if (activeTab !== 'collected') return filteredOrders;
    return [...filteredOrders].sort((a: any, b: any) => {
      const da = new Date(a.collected_at || a.updated_at || a.created_at).getTime();
      const db = new Date(b.collected_at || b.updated_at || b.created_at).getTime();
      return db - da;
    });
  }, [filteredOrders, activeTab]);

  const collectedTotalPages = activeTab === 'collected'
    ? Math.max(1, Math.ceil(sortedCollected.length / COLLECTED_PAGE_SIZE))
    : 1;

  const visibleOrders = useMemo(() => {
    if (activeTab !== 'collected') return filteredOrders;
    const start = (collectedPage - 1) * COLLECTED_PAGE_SIZE;
    return sortedCollected.slice(start, start + COLLECTED_PAGE_SIZE);
  }, [activeTab, filteredOrders, sortedCollected, collectedPage]);

  const stats = useMemo(() => {
    return {
      open: orders.filter(o => o.status === 'open' && !o.priority).length,
      separating: orders.filter(o => o.status === 'separating').length,
      ready: orders.filter(o => o.status === 'ready').length,
      readyWithDoc: orders.filter(o => o.status === 'ready' && !!(o as any).delivery_doc_number).length,
      readyWithoutDoc: orders.filter(o => o.status === 'ready' && !(o as any).delivery_doc_number).length,
      collected: orders.filter(o => o.status === 'collected').length,
      priority: orders.filter(o => o.priority && o.status === 'open').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    };
  }, [orders]);

  const hasPendingPriority = stats.priority > 0;

  // Mapa de grupos de atrelamento → lista de OFs do grupo
  const linkGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const o of orders) {
      const gid = (o as any).link_group_id;
      if (!gid) continue;
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid)!.push(o);
    }
    // remove grupos com 1 só OF (não faz sentido manter)
    for (const [gid, arr] of map) {
      if (arr.length < 2) map.delete(gid);
    }
    return map;
  }, [orders]);

  // Grupos ainda ATIVOS: pelo menos 1 OF não foi coletada/cancelada.
  // Quando todas as OFs do grupo já estão coletadas (ou canceladas), o
  // grupo some da gestão de Atrelar OFs e do contador, mas o badge
  // "ATRELADA" continua aparecendo em cada OF como histórico.
  const activeLinkGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const [gid, list] of linkGroups) {
      const stillActive = list.some(
        (o: any) => o.status !== 'collected' && o.status !== 'cancelled'
      );
      if (stillActive) map.set(gid, list);
    }
    return map;
  }, [linkGroups]);

  // OFs elegíveis para atrelamento: aberto, prioritário, separando, pronto
  const linkableOrders = useMemo(() => {
    return orders.filter((o: any) => ['open', 'separating', 'ready'].includes(o.status));
  }, [orders]);

  const groupLabel = (gid: string) => `#${gid.slice(0, 6).toUpperCase()}`;

  const handleLink = async () => {
    if (linkSelected.size < 2) {
      toast({ title: 'Selecione 2 ou mais OFs para atrelar', variant: 'destructive' });
      return;
    }
    setLinkBusy(true);
    try {
      await linkOrders(Array.from(linkSelected));
      setLinkSelected(new Set());
      setShowLinkModal(false);
    } catch (e: any) {
      toast({ title: 'Erro ao atrelar OFs', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLinkBusy(false);
    }
  };

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

  // Calcula o saldo disponível atual do artigo (kg e peças) — mesma lógica do StockMalha.
  const fetchArticleBalance = async (articleId: string): Promise<{ availableKg: number; availablePieces: number }> => {
    if (!user?.company_id) return { availableKg: 0, availablePieces: 0 };
    const [prodRes, mvRes] = await Promise.all([
      supabase.from('productions').select('weight_kg, rolls_produced').eq('company_id', user.company_id).eq('article_id', articleId),
      (supabase.from as any)('stock_movements').select('type, pieces, weight_kg, is_second_quality, billing_order_id').eq('company_id', user.company_id).eq('article_id', articleId),
    ]);
    let producedKg = 0, producedRolls = 0, deliveredKg = 0, deliveredRolls = 0, reservedKg = 0, reservedRolls = 0;
    for (const p of (prodRes.data || [])) {
      producedKg += Number(p.weight_kg) || 0;
      producedRolls += Number(p.rolls_produced) || 0;
    }
    for (const mv of (mvRes.data || []) as any[]) {
      if (mv.is_second_quality) continue;
      const kg = Number(mv.weight_kg) || 0;
      const pc = Number(mv.pieces) || 0;
      if (mv.type === 'adjust_in') { producedKg += kg; producedRolls += pc; }
      else if (mv.type === 'adjust_out') { producedKg -= kg; producedRolls -= pc; }
      else if (mv.type === 'in') {
        if (mv.billing_order_id) { deliveredKg -= kg; deliveredRolls -= pc; }
        else { producedKg += kg; producedRolls += pc; }
      } else if (mv.type === 'out') { deliveredKg += kg; deliveredRolls += pc; }
      else if (mv.type === 'reserve') { reservedKg += kg; reservedRolls += pc; }
      else if (mv.type === 'release') { reservedKg -= kg; reservedRolls -= pc; }
    }
    const stockKg = producedKg - deliveredKg;
    const stockRolls = producedRolls - deliveredRolls;
    return {
      availableKg: stockKg - reservedKg,
      availablePieces: stockRolls - reservedRolls,
    };
  };

  const submitCreateOrder = async (payload: any) => {
    try {
      await createOrder.mutateAsync(payload);
      setShowCreateModal(false);
      setForm({ of_number: '', client_id: '', article_id: '', machine_id: '', pieces_expected: '', dyehouse: '', weight_expected: '', piece_weight_target: '', order_type: 'pieces' });
      setCreateDupError(null);
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_OF') {
        try {
          const { last, next } = await getNextOfNumber();
          setLastOfNumber(last);
          setForm(f => ({ ...f, of_number: next }));
          setCreateDupError(`A OF #${payload.of_number} já foi criada por outro admin. Atualizamos para #${next}. Clique em "Criar OF" novamente para salvar.`);
        } catch {/* ignore */}
      }
    }
  };

  const handleCreate = async () => {
    if (!form.of_number || !form.client_id || !form.article_id || !form.dyehouse) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (form.order_type === 'pieces' && !form.pieces_expected) {
      toast({ title: "Informe a quantidade de peças", variant: "destructive" });
      return;
    }
    if (form.order_type === 'weight' && !form.weight_expected) {
      toast({ title: "Informe o peso total (kg)", variant: "destructive" });
      return;
    }
    // order_type === 'all' (Coletar Tudo) não exige peças/peso
    setCreateDupError(null);
    const payload = {
      of_number: form.of_number,
      client_id: form.client_id,
      article_id: form.article_id,
      machine_id: form.machine_id && form.machine_id !== 'none' ? form.machine_id : undefined,
      pieces_expected: form.order_type === 'all' ? undefined : (form.pieces_expected ? parseInt(form.pieces_expected) : undefined),
      weight_expected: form.order_type === 'all' ? undefined : (form.weight_expected ? parseFloat(form.weight_expected) : undefined),
      piece_weight_target: form.order_type === 'all' ? null : (form.piece_weight_target ? parseFloat(form.piece_weight_target) : null),
      dyehouse: form.dyehouse,
      order_type: form.order_type as 'pieces' | 'weight' | 'all',
    };
    // Checa saldo do artigo e avisa se já estiver negativo ou se for ficar negativo.
    try {
      const { availableKg, availablePieces } = await fetchArticleBalance(form.article_id);
      const reqPieces = payload.pieces_expected || 0;
      const reqKg = payload.weight_expected || (reqPieces && payload.piece_weight_target ? reqPieces * (payload.piece_weight_target as number) : 0);
      const afterKg = availableKg - reqKg;
      const afterPieces = availablePieces - reqPieces;
      const isAlreadyNegative = availableKg < 0 || availablePieces < 0;
      const willGoNegative = (reqKg > 0 && afterKg < 0) || (reqPieces > 0 && afterPieces < 0);
      if (isAlreadyNegative || willGoNegative) {
        const article = getArticles().find(a => a.id === form.article_id);
        setNegativeWarning({
          currentKg: availableKg,
          currentPieces: availablePieces,
          requestedKg: reqKg,
          requestedPieces: reqPieces,
          afterKg, afterPieces,
          articleName: article?.name || 'Artigo',
          payload,
        });
        return;
      }
    } catch (e) {
      // Se a checagem falhar, segue normalmente sem bloquear o usuário
      console.error('[BillingOrders] balance check failed', e);
    }
    await submitCreateOrder(payload);
  };

  const openEditModal = (order: any) => {
    setEditForm({
      of_number: order.of_number || '',
      client_id: order.client_id || '',
      article_id: order.article_id || '',
      machine_id: order.machine_id || 'none',
      pieces_expected: order.pieces_expected != null ? String(order.pieces_expected) : '',
      weight_expected: order.weight_expected != null ? String(order.weight_expected) : '',
      piece_weight_target: order.piece_weight_target != null ? String(order.piece_weight_target) : '',
      dyehouse: order.dyehouse || '',
      order_type: order.order_type || 'pieces',
      edit_note: '',
    });
    setShowEditModal(order);
  };

  const handleEdit = async () => {
    if (!showEditModal) return;
    const wasActive = showEditModal.status === 'separating' || showEditModal.status === 'ready';
    if (wasActive && !editForm.edit_note.trim()) {
      toast({ title: 'Informe o motivo da edição', description: 'A expedição precisa saber o que mudou.', variant: 'destructive' });
      return;
    }
    if (!editForm.of_number || !editForm.client_id || !editForm.article_id || !editForm.dyehouse) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }
    if (editForm.order_type === 'pieces' && !editForm.pieces_expected) {
      toast({ title: 'Informe a quantidade de peças', variant: 'destructive' });
      return;
    }
    if (editForm.order_type === 'weight' && !editForm.weight_expected) {
      toast({ title: 'Informe o peso total (kg)', variant: 'destructive' });
      return;
    }
    const changes: any = {
      of_number: editForm.of_number,
      client_id: editForm.client_id,
      article_id: editForm.article_id,
      machine_id: editForm.machine_id && editForm.machine_id !== 'none' ? editForm.machine_id : null,
      pieces_expected: editForm.order_type === 'all' ? null : (editForm.pieces_expected ? parseInt(editForm.pieces_expected) : null),
      weight_expected: editForm.order_type === 'all' ? null : (editForm.weight_expected ? parseFloat(editForm.weight_expected) : null),
      piece_weight_target: editForm.order_type === 'all' ? null : (editForm.piece_weight_target ? parseFloat(editForm.piece_weight_target) : null),
      dyehouse: editForm.dyehouse,
      order_type: editForm.order_type,
    };
    const note = editForm.edit_note.trim() || `Editado por admin em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
    try {
      await editOrder.mutateAsync({
        id: showEditModal.id,
        changes,
        note,
        revertToOpen: wasActive,
        // Garantia anti-race: se outro usuário mudou o status enquanto este
        // modal estava aberto, o UPDATE não atinge nenhuma linha e cai no
        // catch — evitando que uma reserva já criada nunca seja liberada.
        expectedStatus: showEditModal.status,
      });
      setShowEditModal(null);
    } catch (err: any) {
      if (err?.code === 'CONFLICT') {
        toast({
          title: 'OF foi alterada por outro usuário',
          description: 'Os dados foram atualizados — feche e abra a edição novamente.',
          variant: 'destructive',
        });
        setShowEditModal(null);
      }
      // demais erros já são tratados no onError do hook
    }
  };

  const handleCancel = async () => {
    if (!showCancelModal) return;
    const isReversal = showCancelModal.status === 'collected';
    const reason = cancelReason.trim();
    if (!reason) {
      toast({ title: isReversal ? 'Informe o motivo do estorno' : 'Informe o motivo do cancelamento', variant: 'destructive' });
      return;
    }
    if (isReversal && reason.length < 5) {
      toast({ title: 'Motivo do estorno muito curto', description: 'Descreva com pelo menos 5 caracteres.', variant: 'destructive' });
      return;
    }
    try {
      await updateStatus.mutateAsync({
        id: showCancelModal.id,
        status: 'cancelled',
        data: { cancellation_reason: reason },
        expectedStatus: showCancelModal.status,
        reversalQuality: showCancelModal.status === 'collected' ? reversalQuality : undefined,
      });
      setShowCancelModal(null);
      setCancelReason('');
      setReversalQuality('first');
    } catch (err: any) {
      if (err?.code === 'CONFLICT') {
        setShowCancelModal(null);
        setCancelReason('');
        setConflictInfo({ action: 'cancelar', ofNumber: showCancelModal.of_number, currentStatus: err.currentStatus, actor: err.actor });
      }
    }
  };

  const handleLaunch = async () => {
    const orderType = (showLaunchModal?.order_type as 'pieces' | 'weight' | 'all') || 'pieces';
    const pieces = parseInt(launchForm.pieces_real || '0') || 0;
    const weight = parseFloat(launchForm.weight_real || '0') || 0;
    // OFs por peso podem ser finalizadas sem peças; OFs por peças exigem ambos.
    if (orderType === 'pieces' && (!pieces || !weight)) {
      toast({ title: 'Preencha peças e peso reais', variant: 'destructive' });
      return;
    }
    if (orderType === 'weight' && !weight) {
      toast({ title: 'Informe o peso real (kg)', variant: 'destructive' });
      return;
    }
    if (orderType === 'all' && !pieces && !weight) {
      toast({ title: 'Informe peças e/ou peso reais coletados', variant: 'destructive' });
      return;
    }
    const avg = pieces > 0 ? weight / pieces : 0;

    try {
      await updateStatus.mutateAsync({
        id: showLaunchModal.id,
        status: 'ready',
        data: {
          pieces_real: pieces,
          weight_real: weight,
          weight_avg: avg
        },
        expectedStatus: 'separating',
      });
      setShowLaunchModal(null);
      setLaunchForm({ pieces_real: '', weight_real: '' });
    } catch (err: any) {
      if (err?.code === 'CONFLICT') {
        const target = showLaunchModal;
        setShowLaunchModal(null);
        setLaunchForm({ pieces_real: '', weight_real: '' });
        setConflictInfo({ action: 'lançar dados', ofNumber: target.of_number, currentStatus: err.currentStatus, actor: err.actor });
      }
    }
  };

  const handlePrint = (order: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Imprimir OF #${order.of_number}</title>
          <style>
            @page {
              size: landscape;
              margin: 10mm;
            }
            body {
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .content {
              border: 2px solid black;
              padding: 40px;
              width: 80%;
            }
            .client {
              font-size: 48pt;
              font-weight: bold;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            .dyehouse {
              font-size: 36pt;
              margin-bottom: 30px;
              text-transform: uppercase;
            }
            .pieces {
              font-size: 42pt;
              font-weight: bold;
              margin-bottom: 20px;
            }
            .of-number {
              font-size: 54pt;
              font-weight: 900;
              border-top: 2px solid black;
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="content">
            <div class="client">${order.client?.name ?? ''}</div>
            <div class="dyehouse">(${order.dyehouse ?? ''})</div>
            <div class="pieces">${
              order.order_type === 'all' && !order.pieces_real && !order.weight_real
                ? `COLETAR TUDO`
                : (order.order_type === 'weight' && !order.pieces_real && !order.pieces_expected
                    ? `${order.weight_real ?? order.weight_expected ?? '—'} KG`
                    : `${order.pieces_real ?? order.pieces_expected ?? '—'} PEÇAS`)
            }</div>
            <div class="of-number">OF ${order.of_number}</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleAdminPrintPdf = async (order: any, mode: 'internal' | 'client' = 'internal') => {
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const margin = 15;

      const colors = {
        grayBg: [249, 250, 251] as [number, number, number],
        border: [229, 231, 235] as [number, number, number],
        textDark: [17, 24, 39] as [number, number, number],
        textMid: [75, 85, 99] as [number, number, number],
        primary: [13, 148, 136] as [number, number, number],
      };

      // Logo + nome da empresa
      let logoInfo: { data: string; w: number; h: number } | null = null;
      let companyName = '';
      if (user?.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('logo_url, name')
          .eq('id', user.company_id)
          .single();
        companyName = companyData?.name || '';
        if (companyData?.logo_url) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject();
              img.src = companyData.logo_url as string;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
            logoInfo = { data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
          } catch { /* no logo */ }
        }
      }

      const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const fitWithinBox = (w: number, h: number, mw: number, mh: number) => {
        const scale = Math.min(mw / w, mh / h);
        return { width: w * scale, height: h * scale };
      };

      // Cabeçalho padrão
      const headerH = 25;
      const leftX = margin + 5;
      const rightX = pw - margin - 5;
      let y = margin;

      pdf.setFillColor(...colors.grayBg);
      pdf.rect(margin, y, pw - 2 * margin, headerH, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, y, pw - 2 * margin, headerH, 'S');

      if (logoInfo) {
        try {
          const ls = fitWithinBox(logoInfo.w, logoInfo.h, 24, 14);
          pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, ls.width, ls.height);
        } catch {
          pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
          pdf.text(sanitizePdfText(companyName), leftX, y + 10);
        }
      } else if (companyName) {
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
        pdf.text(sanitizePdfText(companyName), leftX, y + 10);
      }
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textMid);
      pdf.text(dateStr, leftX, y + 22);

      pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
      const title = sanitizePdfText('ORDEM DE FATURAMENTO');
      const tw = pdf.getTextWidth(title);
      pdf.text(title, (pw - tw) / 2, y + 14);

      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textMid);
      const ofLabel = `OF #${order.of_number}`;
      const ofW = pdf.getTextWidth(ofLabel);
      pdf.text(ofLabel, rightX - ofW, y + 22);

      y += headerH + 10;

      // Status badge
      const statusMap: Record<string, { label: string; color: [number, number, number] }> = {
        open: { label: 'ABERTO', color: [2, 132, 199] },
        separating: { label: 'SEPARANDO', color: [217, 119, 6] },
        ready: { label: order.delivery_doc_number ? 'PRONTO' : 'PRONTO PARA COLETA', color: order.delivery_doc_number ? [5, 150, 105] : [124, 58, 237] },
        collected: { label: 'COLETADA', color: [71, 85, 105] },
        cancelled: { label: 'CANCELADA', color: [113, 113, 122] },
      };
      let st = statusMap[order.status] || { label: order.status.toUpperCase(), color: [100, 100, 100] as [number, number, number] };
      // PDF para cliente: sempre exibe "PRONTO PARA COLETA"
      if (mode === 'client') {
        st = { label: 'PRONTO PARA COLETA', color: [5, 150, 105] };
      }
      pdf.setFillColor(...st.color);
      const badgeW = mode === 'client' ? 70 : 50;
      pdf.roundedRect(margin, y, badgeW, 9, 1.5, 1.5, 'F');
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
      pdf.text(sanitizePdfText(st.label), margin + badgeW / 2 - pdf.getTextWidth(st.label) / 2, y + 6.2);

      if (order.priority && order.status !== 'collected') {
        pdf.setFillColor(220, 38, 38);
        pdf.roundedRect(margin + 55, y, 40, 9, 1.5, 1.5, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.text('PRIORIDADE', margin + 75 - pdf.getTextWidth('PRIORIDADE') / 2, y + 6.2);
      }
      y += 15;

      // Bloco: Dados principais
      const drawSection = (title: string, rows: Array<[string, string]>) => {
        pdf.setFillColor(...colors.primary);
        pdf.rect(margin, y, pw - 2 * margin, 7, 'F');
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
        pdf.text(sanitizePdfText(title), margin + 3, y + 5);
        y += 7;

        pdf.setDrawColor(...colors.border);
        const rowH = 8;
        rows.forEach((r, idx) => {
          if (idx % 2 === 0) {
            pdf.setFillColor(...colors.grayBg);
            pdf.rect(margin, y, pw - 2 * margin, rowH, 'F');
          }
          pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textMid);
          pdf.text(sanitizePdfText(r[0]), margin + 3, y + 5.5);
          pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textDark);
          pdf.text(sanitizePdfText(r[1] || '—'), margin + 60, y + 5.5);
          y += rowH;
        });
        pdf.rect(margin, y - rows.length * rowH - 7, pw - 2 * margin, rows.length * rowH + 7, 'S');
        y += 6;
      };

      drawSection('DADOS DO PEDIDO', [
        ['Cliente', order.client?.name || ''],
        ['Tinturaria', order.dyehouse || ''],
        ['Artigo', order.article?.name || ''],
        ['Máquina', order.machine?.name || '—'],
      ]);

      if (mode === 'client') {
        drawSection('QUANTIDADES', [
          ['Peças Reais', order.pieces_real != null ? String(order.pieces_real) : '—'],
          ['Peso Real', order.weight_real ? `${order.weight_real} kg` : '—'],
        ]);
      } else {
        drawSection('QUANTIDADES', [
          ['Peças Previstas', String(order.pieces_expected ?? '—')],
          ['Peças Reais', order.pieces_real != null ? String(order.pieces_real) : '—'],
          ['Peso Previsto', order.weight_expected ? `${order.weight_expected} kg` : '—'],
          ['Peso Real', order.weight_real ? `${order.weight_real} kg` : '—'],
          ['Peso por Peça (alvo)', order.piece_weight_target != null ? `${order.piece_weight_target} kg` : '—'],
          ['Média', order.weight_avg ? `${order.weight_avg.toFixed(2)} kg/peça` : '—'],
        ]);
      }

      if (order.delivery_doc_number) {
        drawSection(order.delivery_doc_type === 'romaneio' ? 'ROMANEIO' : 'NOTA FISCAL', [
          [order.delivery_doc_type === 'romaneio' ? 'Romaneio Nº' : 'NF Nº', order.delivery_doc_number],
        ]);
      }

      if (order.priority_reason) {
        drawSection('PRIORIDADE', [
          ['Motivo', order.priority_reason],
          ['Marcado por', order.prioritizer ? `${order.prioritizer.name} #${order.prioritizer.code}` : '—'],
          ['Marcado em', order.priority_at ? format(new Date(order.priority_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'],
        ]);
      }

      if (mode !== 'client') {
        drawSection('AUDITORIA', [
          ['Criado por', order.creator ? `${order.creator.name} #${order.creator.code}` : '—'],
          ['Criado em', format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
          ['Separado por', order.separator ? `${order.separator.name} #${order.separator.code}` : '—'],
          ['Coletado por', order.collector ? `${order.collector.name} #${order.collector.code}` : '—'],
          ['Última atualização', format(new Date(order.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
        ]);
      }

      // Rodapé
      const ph = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...colors.textMid);
      pdf.text(`Documento gerado em ${dateStr} • ${sanitizePdfText(companyName)}`, pw / 2 - 50, ph - 8);

      const suffix = mode === 'client' ? '_CLIENTE' : '';
      pdf.save(`OF_${order.of_number}_${order.client?.name?.replace(/\s+/g, '_') || 'cliente'}${suffix}.pdf`);
    } catch (e: any) {
      toast({ title: 'Erro ao gerar PDF', description: e?.message, variant: 'destructive' });
    }
  };

  // Padronização visual: faixa lateral colorida + fundo neutro do card para máxima legibilidade
  const getStatusStyle = (status: string, isPriority?: boolean, hasDoc?: boolean) => {
    if (isPriority && status !== 'collected') {
      return { stripe: 'bg-red-600', label: 'PRIORIDADE', badgeClass: 'bg-red-600 text-white border-red-700' };
    }
    switch (status) {
      case 'open':
        return { stripe: 'bg-sky-600', label: 'ABERTO', badgeClass: 'bg-sky-600 text-white border-sky-700' };
      case 'separating':
        return { stripe: 'bg-amber-500', label: 'SEPARANDO', badgeClass: 'bg-amber-500 text-white border-amber-600' };
      case 'ready':
        return hasDoc
          ? { stripe: 'bg-emerald-600', label: 'PRONTO', badgeClass: 'bg-emerald-600 text-white border-emerald-700' }
          : { stripe: 'bg-violet-600', label: 'PRONTO PARA COLETA', badgeClass: 'bg-violet-600 text-white border-violet-700' };
      case 'collected':
        return { stripe: 'bg-slate-500', label: 'COLETADA', badgeClass: 'bg-slate-600 text-white border-slate-700' };
      case 'cancelled':
        return { stripe: 'bg-zinc-500', label: 'CANCELADA', badgeClass: 'bg-zinc-700 text-white border-zinc-800' };
      default:
        return { stripe: 'bg-muted', label: '', badgeClass: 'bg-muted text-foreground' };
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => { setLinkSelected(new Set()); setShowLinkModal(true); }}
          >
            <Link2 className="h-4 w-4" /> Atrelar OFs
            {activeLinkGroups.size > 0 && (
              <Badge variant="secondary" className="ml-1">{activeLinkGroups.size}</Badge>
            )}
          </Button>
          {isAdmin && (
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nova OF
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card p-3 rounded-lg border shadow-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Pesquisar por cliente, tinturaria, OF, artigo ou NF/Romaneio..." 
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
          <TabsTrigger
            value="awaiting_doc"
            className={cn(
              'gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial',
              stats.readyWithoutDoc > 0 && 'text-violet-700 data-[state=active]:bg-violet-600 data-[state=active]:text-white',
              // Pulsa para o admin enquanto houver OFs aguardando lançamento de NF/Romaneio
              isAdmin && stats.readyWithoutDoc > 0 && 'animate-pulse'
            )}
          >
            <FileText className="h-3 w-3" /> Aguardando NF/ROM
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.readyWithoutDoc}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="ready"
            className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Pronto para coleta <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.readyWithDoc}</Badge>
          </TabsTrigger>
          <TabsTrigger value="collected" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Coletadas
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Canceladas <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.cancelled}</Badge>
          </TabsTrigger>
        </TabsList>

        {activeTab === 'awaiting_doc' && (
          <Card className="mt-4 border-dashed bg-violet-500/5 border-violet-400/40">
            <CardContent className="p-3 text-xs text-violet-900 dark:text-violet-200">
              <strong>Aguardando NF/ROM</strong> — OFs já separadas. Lance a <strong>NF</strong> ou o <strong>Romaneio</strong> (apenas admin) para liberar a OF para a aba <strong>Pronto para coleta</strong>.
            </CardContent>
          </Card>
        )}

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

        <div className="mt-6 space-y-3">
          {visibleOrders.map((order) => {
            const hasDoc = !!(order as any).delivery_doc_number;
            const style = getStatusStyle(order.status, order.priority, hasDoc);
            return (
              <Card
                key={order.id}
                className="relative overflow-hidden border bg-card hover:shadow-md transition-shadow"
              >
                {/* Faixa lateral de status */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.stripe}`} />
                <CardContent className="p-4 pl-5">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    {/* Coluna principal padronizada */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Linha 1: Status + OF + Tinturaria + Prioridade */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`${style.badgeClass} font-bold text-[10px] tracking-wide uppercase px-2 py-0.5`}>
                          {style.label}
                        </Badge>
                        <span className="font-bold text-lg text-foreground">OF #{order.of_number}</span>
                        <Badge variant="outline" className="font-semibold uppercase text-[10px] border-foreground/20 text-foreground">
                          {order.dyehouse}
                        </Badge>
                        {order.priority && order.status === 'open' && (
                          <Badge variant="destructive" className="animate-pulse gap-1 text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> PRIORIDADE
                          </Badge>
                        )}
                      </div>

                      {/* Linha 2: Cliente em destaque */}
                      <div className="text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                        {order.client?.name}
                        {order.priority_reason && (
                          <Badge className="text-[10px] bg-red-600 text-white border-red-700 gap-1 py-0 px-2 h-5">
                            <MessageSquare className="h-3 w-3" /> {order.priority_reason}
                          </Badge>
                        )}
                        {order.order_type === 'weight' && (
                          <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400">
                            PEDIDO POR PESO
                          </Badge>
                        )}
                        {order.order_type === 'all' && (
                          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">
                            COLETAR TUDO
                          </Badge>
                        )}
                        {order.piece_weight_target != null && (
                          <Badge variant="outline" className="text-[10px] border-sky-500 text-sky-700 dark:text-sky-400">
                            PEÇA DE {Number(order.piece_weight_target)} KG
                          </Badge>
                        )}
                        {(order as any).delivery_doc_number && (
                          <Badge className="text-[10px] bg-emerald-600 text-white border-emerald-700 gap-1 py-0 px-2 h-5">
                            <FileText className="h-3 w-3" />
                            {(order as any).delivery_doc_type === 'romaneio' ? 'ROMANEIO' : 'NF'} {(order as any).delivery_doc_number}
                          </Badge>
                        )}
                        {(order as any).link_group_id && linkGroups.has((order as any).link_group_id) && (() => {
                          const companions = linkGroups.get((order as any).link_group_id)!.filter((x: any) => x.id !== order.id);
                          if (companions.length === 0) return null;
                          const label = companions.map((x: any) => `#${x.of_number}`).join(' + ');
                          return (
                            <Badge
                              className="text-[10px] bg-fuchsia-600 text-white border-fuchsia-700 gap-1 py-0 px-2 h-5 cursor-pointer"
                              title={`Atrelada com: ${label}`}
                              onClick={() => { setLinkSelected(new Set()); setShowLinkModal(true); }}
                            >
                              <Link2 className="h-3 w-3" /> ATRELADA A OF {label}
                            </Badge>
                          );
                        })()}
                      </div>

                      {/* Nota de edição visível para expedição quando OF voltou a Aberto */}
                      {order.edit_note && order.status === 'open' && (
                        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 flex items-start gap-2">
                          <History className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div className="text-xs text-amber-900 dark:text-amber-200">
                            <div className="font-bold uppercase text-[10px] tracking-wide">Alteração do Admin — verificar antes de separar</div>
                            <div className="mt-0.5">{order.edit_note}</div>
                            {order.editor && (
                              <div className="mt-1 text-[10px] opacity-80">
                                Por {order.editor.name} #{order.editor.code}
                                {order.last_edited_at && ` • ${format(new Date(order.last_edited_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Motivo do cancelamento visível na aba Cancelados */}
                      {order.status === 'cancelled' && order.cancellation_reason && (
                        <div className="rounded-md border border-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 p-2 flex items-start gap-2">
                          <Ban className="h-4 w-4 text-zinc-700 dark:text-zinc-300 mt-0.5 shrink-0" />
                          <div className="text-xs text-zinc-900 dark:text-zinc-100">
                            <div className="font-bold uppercase text-[10px] tracking-wide">Motivo do cancelamento</div>
                            <div className="mt-0.5">{order.cancellation_reason}</div>
                            {order.canceller && (
                              <div className="mt-1 text-[10px] opacity-80">
                                Por {order.canceller.name} #{order.canceller.code}
                                {order.cancelled_at && ` • ${format(new Date(order.cancelled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Linha 3: Grid padronizado de dados técnicos */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Artigo</div>
                          <div className="text-foreground font-medium whitespace-normal break-words">{order.article?.name || '—'}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                            {order.order_type === 'weight' ? 'Peças (info)' : 'Peças'}
                          </div>
                          <div className="text-foreground font-medium whitespace-normal break-words">
                            {(order.pieces_real ?? order.pieces_expected) ?? '—'}
                            {order.pieces_real != null && order.pieces_expected != null && order.pieces_real !== order.pieces_expected && (
                              <span className="text-muted-foreground"> / {order.pieces_expected}</span>
                            )}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Peso Total</div>
                          <div className="text-foreground font-medium whitespace-normal break-words">
                            {order.weight_real ? `${order.weight_real} kg` : (order.weight_expected ? `${order.weight_expected} kg` : '—')}
                            {order.weight_real != null && order.weight_expected != null && Number(order.weight_real) !== Number(order.weight_expected) && (
                              <span className="text-muted-foreground"> / {order.weight_expected} kg</span>
                            )}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Máquina</div>
                          <div className="text-foreground font-medium whitespace-normal break-words">{order.machine?.name || '—'}</div>
                        </div>
                      </div>

                      {order.status === 'ready' && order.weight_avg && (
                        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
                          Média: {order.weight_avg.toFixed(2)} kg/peça
                        </div>
                      )}

                    </div>

                    {/* Coluna ações + auditoria padronizada */}
                    <div className="flex flex-col items-stretch xl:items-end gap-2 xl:min-w-[220px]">
                      <div className="text-[10px] text-muted-foreground leading-tight xl:text-right">
                        <div><span className="font-semibold">Criado:</span> {order.creator?.name} #{order.creator?.code}</div>
                        <div>{format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                        {order.separated_by && (
                          <div className="mt-0.5"><span className="font-semibold">Separado:</span> {order.separator?.name} #{order.separator?.code}</div>
                        )}
                        {order.collected_by && (
                          <div className="mt-0.5"><span className="font-semibold">Coletado:</span> {order.collector?.name} #{order.collector?.code}</div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-indigo-700 border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                          onClick={() => setShowDetailsModal(order)}
                          title="Ver detalhes da OF"
                        >
                          <Eye className="h-4 w-4" /> Detalhes
                        </Button>
                        {/* Imprimir disponível em todas as abas/status */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => isAdmin ? setShowPrintChoice(order) : handlePrint(order)}
                        >
                          <Printer className="h-4 w-4" /> Imprimir
                        </Button>

                        {isAdmin && order.status === 'ready' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              'gap-1.5',
                              (order as any).delivery_doc_number
                                ? 'text-emerald-700 border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                                : 'text-violet-700 border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950'
                            )}
                            onClick={() => {
                              setDocForm({
                                type: ((order as any).delivery_doc_type as 'nf' | 'romaneio') || 'nf',
                                number: (order as any).delivery_doc_number || '',
                              });
                              setShowDocModal(order);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                            {(order as any).delivery_doc_number ? 'Alterar NF/Romaneio' : 'Adicionar NF/Romaneio'}
                          </Button>
                        )}

                        {isAdmin && order.status !== 'collected' && order.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => openEditModal(order)}
                          >
                            <Pencil className="h-4 w-4" /> Editar
                          </Button>
                        )}

                        {isAdmin && order.status !== 'collected' && order.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-zinc-700 border-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            onClick={() => { setCancelReason(''); setShowCancelModal(order); }}
                          >
                            <Ban className="h-4 w-4" /> Cancelar
                          </Button>
                        )}

                        {isAdmin && order.status === 'collected' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-red-700 border-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => { setCancelReason(''); setShowCancelModal(order); }}
                          >
                            <Ban className="h-4 w-4" /> Estornar
                          </Button>
                        )}

                        {order.status === 'open' && isAdmin && !order.priority && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => setShowPriorityModal(order)}
                          >
                            <AlertTriangle className="h-4 w-4" /> Prioridade
                          </Button>
                        )}

                        {order.status === 'open' && (role === 'expedicao' || isAdmin) && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                            onClick={() => setShowStartSepConfirm(order)}
                          >
                            <Play className="h-4 w-4" /> Iniciar Separação
                          </Button>
                        )}
                        {order.status === 'separating' && (role === 'expedicao' || isAdmin) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-indigo-700 border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                            onClick={() => {
                              setPallets([]);
                              setPalletInput({ pieces: '', weight: '', machine_id: 'none' });
                              setPalletsLoading(true);
                              setShowPalletsModal(order);
                            }}
                          >
                            <Boxes className="h-4 w-4" /> Paletes
                          </Button>
                        )}
                        {order.status === 'ready' && !!(order as any).delivery_doc_number && (role === 'expedicao' || isAdmin) && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
                            onClick={() => setShowCollectConfirm(order)}
                          >
                            <Truck className="h-4 w-4" /> Marcar Coleta
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma ordem de faturamento encontrada nesta aba.
            </div>
          )}

          {/* Paginação — somente na aba Coletadas */}
          {activeTab === 'collected' && sortedCollected.length > COLLECTED_PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2">
              <div className="text-xs text-muted-foreground">
                Mostrando <strong>{(collectedPage - 1) * COLLECTED_PAGE_SIZE + 1}</strong>–
                <strong>{Math.min(collectedPage * COLLECTED_PAGE_SIZE, sortedCollected.length)}</strong> de{' '}
                <strong>{sortedCollected.length}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  disabled={collectedPage <= 1}
                  onClick={() => setCollectedPage(p => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                {Array.from({ length: collectedTotalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === collectedTotalPages || Math.abs(p - collectedPage) <= 2)
                  .reduce<Array<number | 'gap'>>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('gap');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => p === 'gap' ? (
                    <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={p}
                      size="sm"
                      variant={p === collectedPage ? 'default' : 'outline'}
                      className="h-8 min-w-[2rem] px-2 text-xs"
                      onClick={() => setCollectedPage(p as number)}
                    >
                      {p}
                    </Button>
                  ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  disabled={collectedPage >= collectedTotalPages}
                  onClick={() => setCollectedPage(p => Math.min(collectedTotalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
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
              <div className="col-span-3 space-y-1">
                <Input value={form.of_number} onChange={e => { setForm({...form, of_number: e.target.value}); setCreateDupError(null); }} placeholder="Ex: 001" />
                <p className="text-[10px] text-muted-foreground">
                  Última OF gerada: <strong>#{lastOfNumber ?? '—'}</strong> · Sugerida: <strong>#{form.of_number || '—'}</strong>
                </p>
              </div>
            </div>
            {createDupError && (
              <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{createDupError}</span>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Tipo</Label>
              <div className="col-span-3 grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={form.order_type === 'pieces' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setForm({ ...form, order_type: 'pieces' })}
                >Por Peças</Button>
                <Button
                  type="button"
                  variant={form.order_type === 'weight' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setForm({ ...form, order_type: 'weight' })}
                >Por Peso (kg)</Button>
                <Button
                  type="button"
                  variant={form.order_type === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setForm({ ...form, order_type: 'all', pieces_expected: '', weight_expected: '', piece_weight_target: '' })}
                >Coletar Tudo</Button>
              </div>
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
              <Label className="text-right">
                Peças {form.order_type === 'weight' && <span className="text-[10px] text-muted-foreground">(opc.)</span>}
              </Label>
              <Input type="number" className="col-span-3" value={form.pieces_expected} onChange={e => setForm({...form, pieces_expected: e.target.value})} placeholder={form.order_type === 'all' ? 'Tudo disponível' : (form.order_type === 'weight' ? 'Opcional' : 'Quantidade de peças')} disabled={form.order_type === 'all'} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Peso Total (kg) {form.order_type === 'pieces' && <span className="text-[10px] text-muted-foreground">(opc.)</span>}
              </Label>
              <Input type="number" step="0.01" className="col-span-3" value={form.weight_expected} onChange={e => setForm({...form, weight_expected: e.target.value})} placeholder={form.order_type === 'all' ? 'Tudo disponível' : (form.order_type === 'weight' ? 'Ex: 1000' : 'Opcional')} disabled={form.order_type === 'all'} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Peso por Peça (kg) <span className="text-[10px] text-muted-foreground">(opc.)</span>
              </Label>
              <Input type="number" step="0.01" className="col-span-3" value={form.piece_weight_target} onChange={e => setForm({...form, piece_weight_target: e.target.value})} placeholder="Ex: 10 (cliente solicitou peças de 10kg)" disabled={form.order_type === 'all'} />
            </div>
            {form.order_type === 'all' && (
              <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200">
                Modo <strong>Coletar Tudo</strong>: a expedição vai separar e lançar todo o estoque disponível do artigo no momento da coleta. Peças e peso ficam em branco até o lançamento real.
              </div>
            )}
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
            {showLaunchModal && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-primary">OF #{showLaunchModal.of_number}</span>
                  {showLaunchModal.order_type === 'all' && (
                    <Badge variant="outline" className="text-[10px]">Coletar Tudo</Badge>
                  )}
                </div>
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{showLaunchModal.client?.name || '—'}</strong></div>
                <div><span className="text-muted-foreground">Artigo:</span> <strong>{showLaunchModal.article?.name || '—'}</strong></div>
                {showLaunchModal.machine?.name && (
                  <div><span className="text-muted-foreground">Máquina:</span> <strong>{showLaunchModal.machine.name}</strong></div>
                )}
                <div className="pt-1 border-t mt-1">
                  <span className="text-muted-foreground">Solicitado:</span>{' '}
                  <strong>{Number(showLaunchModal.pieces_expected || 0) || '—'} pç</strong>
                  {' · '}
                  <strong>{showLaunchModal.weight_expected ? `${Number(showLaunchModal.weight_expected).toFixed(2)} kg` : '—'}</strong>
                </div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400 italic pt-1">
                  Confira os dados acima antes de lançar.
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Peças {showLaunchModal?.order_type === 'weight' && <span className="text-[10px] text-muted-foreground">(opc.)</span>}
              </Label>
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

      {/* Modal Confirmar Coleta */}
      <Dialog open={!!showCollectConfirm} onOpenChange={() => setShowCollectConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Truck className="h-5 w-5" /> Confirmar Coleta
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Você tem certeza que deseja marcar a <strong>OF #{showCollectConfirm?.of_number}</strong> como coletada?
              Esta ação moverá a ordem para a aba de Coletadas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCollectConfirm(null)}>Cancelar</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={async () => {
                const target = showCollectConfirm;
                try {
                  await updateStatus.mutateAsync({ id: target.id, status: 'collected', expectedStatus: 'ready' });
                  setShowCollectConfirm(null);
                } catch (err: any) {
                  if (err?.code === 'CONFLICT') {
                    setShowCollectConfirm(null);
                    setConflictInfo({ action: 'marcar coleta', ofNumber: target.of_number, currentStatus: err.currentStatus, actor: err.actor });
                  }
                }
              }}
              disabled={updateStatus.isPending}
            >
              Confirmar Coleta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Iniciar Separação */}
      <Dialog open={!!showStartSepConfirm} onOpenChange={() => setShowStartSepConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Play className="h-5 w-5" /> Iniciar Separação
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Você tem certeza que deseja iniciar a separação da <strong>OF #{showStartSepConfirm?.of_number}</strong>?
              Esta ação moverá a ordem para a aba <strong>Separando</strong>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartSepConfirm(null)}>Cancelar</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={async () => {
                const target = showStartSepConfirm;
                try {
                  await updateStatus.mutateAsync({ id: target.id, status: 'separating', expectedStatus: 'open' });
                  setShowStartSepConfirm(null);
                } catch (err: any) {
                  if (err?.code === 'CONFLICT') {
                    setShowStartSepConfirm(null);
                    setConflictInfo({ action: 'iniciar separação', ofNumber: target.of_number, currentStatus: err.currentStatus, actor: err.actor });
                  }
                }
              }}
              disabled={updateStatus.isPending}
            >
              Confirmar Separação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar OF (admin) */}
      <Dialog open={!!showEditModal} onOpenChange={(o) => !o && setShowEditModal(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" /> Editar OF #{showEditModal?.of_number}
            </DialogTitle>
          </DialogHeader>
          {showEditModal && (showEditModal.status === 'separating' || showEditModal.status === 'ready') && (
            <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              <strong>Atenção:</strong> esta OF já está em <strong>{
                showEditModal.status === 'ready'
                  ? ((showEditModal as any).delivery_doc_number ? 'Pronto para Coleta' : 'Aguardando NF/ROM')
                  : 'Separação'
              }</strong>.
              Ao salvar, ela voltará para <strong>Aberto</strong> para que a expedição faça uma nova separação. Os dados reais já lançados (peças/peso){showEditModal.status === 'ready' ? ' e a NF/Romaneio registrada' : ''} serão limpos. Informe um motivo claro abaixo.
            </div>
          )}
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">OF #</Label>
              <Input className="col-span-3 h-9" value={editForm.of_number} onChange={e => setEditForm({...editForm, of_number: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Tipo</Label>
              <div className="col-span-3 grid grid-cols-3 gap-2">
                <Button type="button" size="sm" variant={editForm.order_type === 'pieces' ? 'default' : 'outline'} onClick={() => setEditForm({...editForm, order_type: 'pieces'})}>Por Peças</Button>
                <Button type="button" size="sm" variant={editForm.order_type === 'weight' ? 'default' : 'outline'} onClick={() => setEditForm({...editForm, order_type: 'weight'})}>Por Peso</Button>
                <Button type="button" size="sm" variant={editForm.order_type === 'all' ? 'default' : 'outline'} onClick={() => setEditForm({...editForm, order_type: 'all', pieces_expected: '', weight_expected: '', piece_weight_target: ''})}>Coletar Tudo</Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Cliente</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={editForm.client_id}
                  onValueChange={v => setEditForm({...editForm, client_id: v, article_id: ''})}
                  options={getClients().map(c => ({ value: c.id, label: c.name }))}
                  placeholder="Selecione o cliente"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Artigo</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={editForm.article_id}
                  onValueChange={v => setEditForm({...editForm, article_id: v})}
                  options={getArticles().filter(a => a.client_id === editForm.client_id).map(a => ({ value: a.id, label: a.name }))}
                  placeholder="Selecione o artigo"
                  disabled={!editForm.client_id}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Peças</Label>
              <Input type="number" className="col-span-3 h-9" value={editForm.pieces_expected} onChange={e => setEditForm({...editForm, pieces_expected: e.target.value})} placeholder={editForm.order_type === 'weight' ? 'Opcional' : 'Quantidade'} />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Peso Total (kg)</Label>
              <Input type="number" step="0.01" className="col-span-3 h-9" value={editForm.weight_expected} onChange={e => setEditForm({...editForm, weight_expected: e.target.value})} placeholder={editForm.order_type === 'weight' ? 'Ex: 1000' : 'Opcional'} />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Peso/Peça (kg)</Label>
              <Input type="number" step="0.01" className="col-span-3 h-9" value={editForm.piece_weight_target} onChange={e => setEditForm({...editForm, piece_weight_target: e.target.value})} placeholder="Opcional — ex: 10" />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Máquina</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={editForm.machine_id}
                  onValueChange={v => setEditForm({...editForm, machine_id: v})}
                  options={[{ value: 'none', label: 'NENHUMA' }, ...getMachines().map(m => ({ value: m.id, label: m.name }))]}
                  placeholder="Selecione a máquina"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right text-xs">Tinturaria</Label>
              <Input className="col-span-3 h-9" value={editForm.dyehouse} onChange={e => setEditForm({...editForm, dyehouse: e.target.value.toUpperCase()})} />
            </div>
            <div className="grid grid-cols-4 items-start gap-3">
              <Label className="text-right text-xs pt-2">
                Motivo da edição
                {showEditModal && (showEditModal.status === 'separating' || showEditModal.status === 'ready') && <span className="text-red-600"> *</span>}
              </Label>
              <textarea
                className="col-span-3 min-h-[70px] rounded-md border bg-background p-2 text-sm"
                value={editForm.edit_note}
                onChange={e => setEditForm({...editForm, edit_note: e.target.value})}
                placeholder="Ex: Cliente aumentou de 10 para 15 peças. Separar mais 5 peças do mesmo artigo."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={editOrder.isPending}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cancelar OF */}
      <Dialog open={!!showCancelModal} onOpenChange={(o) => { if (!o) { setShowCancelModal(null); setCancelReason(''); setReversalQuality('first'); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className={cn('flex items-center gap-2', showCancelModal?.status === 'collected' ? 'text-red-700' : 'text-zinc-700')}>
              <Ban className="h-5 w-5" />
              {showCancelModal?.status === 'collected'
                ? `Estornar OF #${showCancelModal?.of_number}`
                : `Cancelar OF #${showCancelModal?.of_number}`}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {showCancelModal?.status === 'collected' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  O estorno devolve as <strong>{showCancelModal?.pieces_real} pç / {Number(showCancelModal?.weight_real || 0).toFixed(2)} kg</strong> e move a OF para <strong>Canceladas</strong>.
                </p>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-foreground">Tipo do estorno *</div>
                  <div className="grid grid-cols-1 gap-2">
                    <label className={cn(
                      'flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors',
                      reversalQuality === 'first' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-border hover:bg-muted/50'
                    )}>
                      <input
                        type="radio"
                        name="rev-q"
                        className="mt-0.5"
                        checked={reversalQuality === 'first'}
                        onChange={() => setReversalQuality('first')}
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400">1ª qualidade</div>
                        <div className="text-muted-foreground">Peças voltam para o <strong>Estoque de Malha</strong>, somam em Disponível e descontam Entregue kg/Rolos.</div>
                      </div>
                    </label>
                    <label className={cn(
                      'flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors',
                      reversalQuality === 'second' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-border hover:bg-muted/50'
                    )}>
                      <input
                        type="radio"
                        name="rev-q"
                        className="mt-0.5"
                        checked={reversalQuality === 'second'}
                        onChange={() => setReversalQuality('second')}
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-amber-700 dark:text-amber-400">2ª qualidade</div>
                        <div className="text-muted-foreground">Peças vão para a aba <strong>Estoque de 2ª</strong> (saldo independente). O estoque principal não é afetado.</div>
                      </div>
                    </label>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Informe o motivo do estorno (mín. 5 caracteres):</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                A OF será movida para a aba <strong>Canceladas</strong>. Informe o motivo do cancelamento:
              </p>
            )}
            <textarea
              className="w-full min-h-[80px] rounded-md border bg-background p-2 text-sm"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={showCancelModal?.status === 'collected'
                ? 'Ex.: Coleta lançada por engano / NF cancelada na tinturaria / Cliente devolveu a malha.'
                : 'Ex.: Cliente desistiu da coleta / OF duplicada / Pedido alterado.'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelModal(null)}>Voltar</Button>
            <Button
              className={showCancelModal?.status === 'collected'
                ? 'bg-red-700 hover:bg-red-800 text-white'
                : 'bg-zinc-700 hover:bg-zinc-800 text-white'}
              onClick={handleCancel}
              disabled={updateStatus.isPending}
            >
              {showCancelModal?.status === 'collected' ? 'Confirmar Estorno' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Conflito — outro usuário alterou o status antes (delay/realtime) */}
      <Dialog open={!!conflictInfo} onOpenChange={(o) => !o && setConflictInfo(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Ação já realizada
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm">
            <p>
              Não foi possível <strong>{conflictInfo?.action}</strong> a <strong>OF #{conflictInfo?.ofNumber}</strong> porque outro usuário já alterou esta OF.
            </p>
            {conflictInfo?.currentStatus && (
              <p className="text-muted-foreground">
                Status atual: <strong className="uppercase">{
                  ({ open: 'Aberto', separating: 'Separando', ready: 'Pronto', collected: 'Coletada', cancelled: 'Cancelada' } as any)[conflictInfo.currentStatus] || conflictInfo.currentStatus
                }</strong>
                {conflictInfo.actor && (<> · por <strong>{conflictInfo.actor.name} #{conflictInfo.actor.code}</strong></>)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A lista foi atualizada e a OF foi movida para a aba correta.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setConflictInfo(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal NF / Romaneio (admin libera OF como pronta com documento) */}
      <Dialog open={!!showDocModal} onOpenChange={(o) => !o && setShowDocModal(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <FileText className="h-5 w-5" />
              {(showDocModal as any)?.delivery_doc_number ? 'Alterar' : 'Adicionar'} NF / Romaneio · OF #{showDocModal?.of_number}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs text-muted-foreground">
              Ao registrar o documento, a OF passa de <strong className="text-violet-700">PRONTO PARA COLETA</strong> para <strong className="text-emerald-700">PRONTO</strong> (verde), sinalizando à expedição que pode ser coletada.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase">Tipo de documento</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={docForm.type === 'nf' ? 'default' : 'outline'}
                  className="justify-start gap-2"
                  onClick={() => setDocForm({ ...docForm, type: 'nf' })}
                >
                  <FileText className="h-4 w-4" /> Nota Fiscal
                </Button>
                <Button
                  type="button"
                  variant={docForm.type === 'romaneio' ? 'default' : 'outline'}
                  className="justify-start gap-2"
                  onClick={() => setDocForm({ ...docForm, type: 'romaneio' })}
                >
                  <FileText className="h-4 w-4" /> Romaneio
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase">
                Nº {docForm.type === 'nf' ? 'da Nota Fiscal' : 'do Romaneio'}
              </Label>
              <Input
                value={docForm.number}
                onChange={(e) => setDocForm({ ...docForm, number: e.target.value })}
                placeholder={docForm.type === 'nf' ? 'Ex: 12345' : 'Ex: ROM-2026-001'}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocModal(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!docForm.number.trim()}
              onClick={async () => {
                try {
                  await setDeliveryDoc({ id: showDocModal.id, type: docForm.type, number: docForm.number });
                  setShowDocModal(null);
                } catch (err: any) {
                  toast({ title: 'Erro ao registrar documento', description: err?.message, variant: 'destructive' });
                }
              }}
            >
              Salvar Documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Escolha de Impressão (admin) — Controle Interno x Cliente */}
      <Dialog open={!!showPrintChoice} onOpenChange={(o) => !o && setShowPrintChoice(null)}>
        <DialogContent className="w-[95vw] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" /> Imprimir OF #{showPrintChoice?.of_number}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 overflow-hidden">
            <p className="text-xs text-muted-foreground">Escolha o tipo de impressão:</p>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3 px-3 whitespace-normal text-left items-start"
              onClick={() => { handleAdminPrintPdf(showPrintChoice, 'internal'); setShowPrintChoice(null); }}
            >
              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-left min-w-0 flex-1">
                <div className="font-semibold text-sm">Controle Interno</div>
                <div className="text-[11px] text-muted-foreground whitespace-normal break-words leading-snug">
                  PDF completo: quantidades previstas/reais, prioridade e auditoria.
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3 px-3 whitespace-normal text-left items-start"
              onClick={() => { handleAdminPrintPdf(showPrintChoice, 'client'); setShowPrintChoice(null); }}
            >
              <UserIcon className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-left min-w-0 flex-1">
                <div className="font-semibold text-sm">Cliente</div>
                <div className="text-[11px] text-muted-foreground whitespace-normal break-words leading-snug">
                  PDF resumido: sem auditoria, sem previstos e sem média. Status sempre "Pronto para Coleta".
                </div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintChoice(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Aviso de Saldo Negativo ao Criar OF */}
      <Dialog open={!!negativeWarning} onOpenChange={(o) => !o && setNegativeWarning(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Saldo do artigo
            </DialogTitle>
          </DialogHeader>
          {negativeWarning && (
            <div className="py-2 space-y-3 text-sm">
              <div className="font-semibold text-foreground">{negativeWarning.articleName}</div>
              {(negativeWarning.currentKg < 0 || negativeWarning.currentPieces < 0) ? (
                <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-950/30 p-3 text-red-900 dark:text-red-200">
                  <div className="font-bold uppercase text-xs mb-1">Saldo atual já está negativo</div>
                  <div className="text-xs">
                    Disponível: <strong>{negativeWarning.currentPieces.toFixed(0)} pç</strong> · <strong>{negativeWarning.currentKg.toFixed(2)} kg</strong>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-amber-900 dark:text-amber-200">
                  <div className="font-bold uppercase text-xs mb-1">Esta OF deixará o saldo negativo</div>
                  <div className="text-xs">
                    Disponível agora: <strong>{negativeWarning.currentPieces.toFixed(0)} pç</strong> · <strong>{negativeWarning.currentKg.toFixed(2)} kg</strong>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Solicitado</div>
                  <div className="font-semibold">{negativeWarning.requestedPieces || 0} pç</div>
                  <div className="font-semibold">{negativeWarning.requestedKg.toFixed(2)} kg</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Disponível</div>
                  <div className="font-semibold">{negativeWarning.currentPieces.toFixed(0)} pç</div>
                  <div className="font-semibold">{negativeWarning.currentKg.toFixed(2)} kg</div>
                </div>
                <div className={cn('rounded border p-2', (negativeWarning.afterKg < 0 || negativeWarning.afterPieces < 0) && 'border-red-400 bg-red-50 dark:bg-red-950/30')}>
                  <div className="text-[10px] uppercase text-muted-foreground">Após esta OF</div>
                  <div className={cn('font-semibold', negativeWarning.afterPieces < 0 && 'text-red-600')}>{negativeWarning.afterPieces.toFixed(0)} pç</div>
                  <div className={cn('font-semibold', negativeWarning.afterKg < 0 && 'text-red-600')}>{negativeWarning.afterKg.toFixed(2)} kg</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Deseja continuar mesmo assim?</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNegativeWarning(null)}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={async () => {
                if (!negativeWarning) return;
                const payload = negativeWarning.payload;
                setNegativeWarning(null);
                await submitCreateOrder(payload);
              }}
              disabled={createOrder.isPending}
            >
              Continuar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Paletes — separação por paletes */}
      <Dialog open={!!showPalletsModal} onOpenChange={(o) => { if (!o) { setShowPalletsModal(null); setPallets([]); setPalletInput({ pieces: '', weight: '', machine_id: 'none' }); } }}>
        <DialogContent
          className="sm:max-w-[560px]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Boxes className="h-5 w-5" /> Paletes · OF #{showPalletsModal?.of_number}
            </DialogTitle>
          </DialogHeader>
          {showPalletsModal && palletsLoading && (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="text-xs">Carregando paletes salvos…</span>
            </div>
          )}
          {showPalletsModal && !palletsLoading && (() => {
            const order = showPalletsModal;
            const totalPieces = pallets.reduce((s, p) => s + (p.pieces || 0), 0);
            const totalWeight = pallets.reduce((s, p) => s + (p.weight || 0), 0);
            const targetPieces = Number(order.pieces_expected || 0);
            const targetWeight = Number(order.weight_expected || 0);
            const remainingPieces = targetPieces - totalPieces;
            const remainingWeight = targetWeight - totalWeight;
            const orderType = order.order_type || 'pieces';
            const canFinish = pallets.length > 0;
            return (
              <div className="space-y-3 py-2">
                {/* Resumo do pedido */}
                <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                  <div><span className="text-muted-foreground">Cliente:</span> <strong>{order.client?.name}</strong></div>
                  <div><span className="text-muted-foreground">Artigo:</span> <strong>{order.article?.name}</strong></div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <span><span className="text-muted-foreground">Solicitado:</span> <strong>{targetPieces || '—'} pç</strong> · <strong>{targetWeight ? `${targetWeight.toFixed(2)} kg` : '—'}</strong></span>
                    {order.piece_weight_target != null && (
                      <Badge variant="outline" className="text-[10px]">Peça alvo: {Number(order.piece_weight_target)} kg</Badge>
                    )}
                  </div>
                </div>

                {/* Adicionar palete */}
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Adicionar palete</div>
                  <div className="grid grid-cols-2 gap-2">
                     <div>
                       <Label className="text-[10px] uppercase">Peças</Label>
                       <Input type="number" inputMode="numeric" pattern="[0-9]*" value={palletInput.pieces} onChange={e => setPalletInput({ ...palletInput, pieces: e.target.value })} placeholder="Ex: 25" />
                     </div>
                     <div>
                       <Label className="text-[10px] uppercase">Peso (kg)</Label>
                       <Input type="number" inputMode="decimal" step="0.01" value={palletInput.weight} onChange={e => setPalletInput({ ...palletInput, weight: e.target.value })} placeholder="Ex: 250" />
                     </div>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-[10px] uppercase">Máquina <span className="text-red-600">*</span></Label>
                      <SearchableSelect
                        value={palletInput.machine_id}
                        onValueChange={v => setPalletInput({ ...palletInput, machine_id: v })}
                        options={[
                          ...getMachines().map(m => ({ value: m.id, label: m.name })),
                          { value: '__none__', label: 'SEM MÁQUINA' },
                        ]}
                        placeholder="Selecione a máquina"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      disabled={palletBusy}
                      onClick={async () => {
                        const pc = parseInt(palletInput.pieces || '0');
                        const wt = parseFloat(palletInput.weight || '0');
                        if (!(wt > 0)) {
                          toast({ title: 'Informe o peso do palete (kg)', variant: 'destructive' });
                          return;
                        }
                        if (!palletInput.machine_id) {
                          toast({ title: 'Selecione a máquina do palete', description: 'Escolha uma máquina ou "SEM MÁQUINA" para descontar do estoque total do artigo.', variant: 'destructive' });
                          return;
                        }
                        if (!user?.company_id) return;
                        const order = showPalletsModal;
                        setPalletBusy(true);
                        try {
                          // Calcula o próximo número diretamente do banco (não do
                          // estado local) — evita paletes duplicados quando dois
                          // usuários estão registrando paletes da mesma OF.
                          const { data: maxRow } = await (supabase.from as any)('billing_order_pallets')
                            .select('pallet_number')
                            .eq('billing_order_id', order.id)
                            .order('pallet_number', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                          const localMax = pallets.reduce((m, p) => Math.max(m, p.pallet_number || 0), 0);
                          const dbMax = Number((maxRow as any)?.pallet_number ?? 0);
                          const nextNumber = Math.max(localMax, dbMax) + 1;
                          const isNoMachine = palletInput.machine_id === '__none__';
                          const palletMachineId = isNoMachine ? null : palletInput.machine_id;

                          // Se SEM MÁQUINA: computa saldo por máquina do artigo e distribui a baixa.
                          type Alloc = { machine_id: string; pieces: number; weight_kg: number };
                          const allocations: Alloc[] = [];
                          if (isNoMachine) {
                            const [prodRes, mvRes] = await Promise.all([
                              (supabase.from as any)('productions')
                                .select('machine_id, rolls_produced, weight_kg')
                                .eq('company_id', user.company_id)
                                .eq('article_id', order.article_id),
                              (supabase.from as any)('stock_movements')
                                .select('machine_id, type, pieces, weight_kg, is_second_quality, billing_order_id')
                                .eq('company_id', user.company_id)
                                .eq('article_id', order.article_id),
                            ]);
                            const bal = new Map<string, { pieces: number; weight: number }>();
                            for (const p of (prodRes.data || [])) {
                              if (!p.machine_id) continue;
                              const cur = bal.get(p.machine_id) || { pieces: 0, weight: 0 };
                              cur.pieces += Number(p.rolls_produced) || 0;
                              cur.weight += Number(p.weight_kg) || 0;
                              bal.set(p.machine_id, cur);
                            }
                            for (const mv of (mvRes.data || [])) {
                              if (mv.is_second_quality) continue;
                              if (!mv.machine_id) continue;
                              if (!['adjust_in','adjust_out','in','out','reserve','release'].includes(mv.type)) continue;
                              const cur = bal.get(mv.machine_id) || { pieces: 0, weight: 0 };
                              const kg = Number(mv.weight_kg) || 0;
                              const pcs = Number(mv.pieces) || 0;
                              if (mv.type === 'adjust_in') { cur.pieces += pcs; cur.weight += kg; }
                              else if (mv.type === 'adjust_out') { cur.pieces -= pcs; cur.weight -= kg; }
                              else if (mv.type === 'in') {
                                if (mv.billing_order_id) { /* estorno afeta entregue, não estoque produzido */ }
                                else { cur.pieces += pcs; cur.weight += kg; }
                              }
                              else if (mv.type === 'out') { cur.pieces -= pcs; cur.weight -= kg; }
                              else if (mv.type === 'reserve') { cur.pieces -= pcs; cur.weight -= kg; }
                              else if (mv.type === 'release') { cur.pieces += pcs; cur.weight += kg; }
                              bal.set(mv.machine_id, cur);
                            }
                            // Ordena por peso disponível decrescente
                            const sorted = Array.from(bal.entries())
                              .filter(([, v]) => v.weight > 0.0001 || v.pieces > 0)
                              .sort((a, b) => b[1].weight - a[1].weight);
                            let remPc = pc || 0;
                            let remKg = wt || 0;
                            for (const [mid, v] of sorted) {
                              if (remKg <= 0.0001 && remPc <= 0) break;
                              const takePc = Math.min(Math.max(v.pieces, 0), remPc);
                              const takeKg = Math.min(Math.max(v.weight, 0), remKg);
                              if (takePc <= 0 && takeKg <= 0.0001) continue;
                              allocations.push({ machine_id: mid, pieces: takePc, weight_kg: Number(takeKg.toFixed(3)) });
                              remPc -= takePc;
                              remKg -= takeKg;
                            }
                            // Sobra: joga na máquina com maior saldo restante (ou última) para preservar total exato
                            if ((remKg > 0.0001 || remPc > 0)) {
                              if (allocations.length > 0) {
                                const last = allocations[allocations.length - 1];
                                last.pieces += Math.max(remPc, 0);
                                last.weight_kg = Number((last.weight_kg + Math.max(remKg, 0)).toFixed(3));
                              } else {
                                toast({ title: 'Sem estoque em nenhuma máquina', description: 'Não há saldo positivo para descontar. Selecione uma máquina específica.', variant: 'destructive' });
                                setPalletBusy(false);
                                return;
                              }
                            }
                          }

                          // 1. Cria movimento(s) de reserva
                          const reserveRows = isNoMachine
                            ? allocations.map(a => ({
                                company_id: user.company_id,
                                article_id: order.article_id,
                                client_id: order.client_id,
                                billing_order_id: order.id,
                                machine_id: a.machine_id,
                                type: 'reserve',
                                pieces: a.pieces,
                                weight_kg: a.weight_kg,
                                reason: `OF #${order.of_number} · Palete ${nextNumber} (reserva · sem máquina)`,
                                created_by: profile?.id ?? null,
                              }))
                            : [{
                                company_id: user.company_id,
                                article_id: order.article_id,
                                client_id: order.client_id,
                                billing_order_id: order.id,
                                machine_id: palletMachineId,
                                type: 'reserve',
                                pieces: pc || 0,
                                weight_kg: wt || 0,
                                reason: `OF #${order.of_number} · Palete ${nextNumber} (reserva)`,
                                created_by: profile?.id ?? null,
                              }];
                          const { data: mvRows, error: mvErr } = await (supabase.from as any)('stock_movements').insert(reserveRows).select('id');
                          if (mvErr) throw mvErr;
                          const firstMvId = (mvRows && mvRows[0]?.id) || null;
                          // 2. Persiste palete (machine_id=null quando SEM MÁQUINA)
                          const { data: row, error: pErr } = await (supabase.from as any)('billing_order_pallets').insert({
                            billing_order_id: order.id,
                            company_id: user.company_id,
                            pallet_number: nextNumber,
                            pieces: pc || 0,
                            weight_kg: wt || 0,
                            reserve_movement_id: firstMvId,
                            machine_id: palletMachineId,
                            created_by: profile?.id ?? null,
                          }).select('id, pallet_number, pieces, weight_kg, reserve_movement_id, machine_id').single();
                          if (pErr) {
                            // rollback dos movimentos se persistência falhar
                            const ids = (mvRows || []).map((r: any) => r.id).filter(Boolean);
                            if (ids.length) await (supabase.from as any)('stock_movements').delete().in('id', ids);
                            throw pErr;
                          }
                          setPallets(prev => [...prev, {
                            id: row.id,
                            pallet_number: row.pallet_number,
                            pieces: Number(row.pieces),
                            weight: Number(row.weight_kg),
                            reserve_movement_id: row.reserve_movement_id,
                            machine_id: row.machine_id ?? null,
                          }]);
                          setPalletInput({ pieces: '', weight: '', machine_id: palletInput.machine_id });
                          refreshStockCaches();
                          toast({
                            title: `Palete ${nextNumber} salvo e reservado no estoque`,
                            description: isNoMachine
                              ? `SEM MÁQUINA: distribuído em ${allocations.length} máquina${allocations.length !== 1 ? 's' : ''} com saldo positivo.`
                              : undefined,
                          });
                        } catch (e: any) {
                          toast({ title: 'Erro ao salvar palete', description: e.message, variant: 'destructive' });
                        } finally {
                          setPalletBusy(false);
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Lista */}
                {pallets.length > 0 && (() => {
                  const machinesMap = new Map(getMachines().map(m => [m.id, m.name]));
                  const machineName = (id?: string | null) => id ? (machinesMap.get(id) || '—') : '—';
                  // Agrupamento por máquina
                  const byMachine = new Map<string, { name: string; pieces: number; weight: number; count: number }>();
                  for (const p of pallets) {
                    const key = p.machine_id || '__none__';
                    const name = p.machine_id ? machineName(p.machine_id) : 'Sem máquina';
                    const cur = byMachine.get(key) || { name, pieces: 0, weight: 0, count: 0 };
                    cur.pieces += p.pieces || 0;
                    cur.weight += p.weight || 0;
                    cur.count += 1;
                    byMachine.set(key, cur);
                  }
                  const machineGroups = Array.from(byMachine.values());
                  return (
                  <>
                  <div className="rounded-md border max-h-[180px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">#</th>
                          <th className="text-left p-2">Máquina</th>
                          <th className="text-right p-2">Peças</th>
                          <th className="text-right p-2">Peso (kg)</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pallets.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="p-2 font-semibold">Palete {p.pallet_number}</td>
                            <td className="p-2 font-medium text-indigo-700 dark:text-indigo-300">{p.machine_id ? machineName(p.machine_id) : <span className="text-muted-foreground italic">—</span>}</td>
                            <td className="p-2 text-right">{p.pieces}</td>
                            <td className="p-2 text-right">{p.weight.toFixed(2)}</td>
                            <td className="p-2">
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:text-red-700"
                                disabled={palletBusy}
                                onClick={async () => {
                                  if (!user?.company_id) return;
                                  const order = showPalletsModal;
                                  setPalletBusy(true);
                                  try {
                                    if (p.machine_id) {
                                      // Palete com máquina: uma reserva → uma liberação
                                      const { error: relErr } = await (supabase.from as any)('stock_movements').insert({
                                        company_id: user.company_id,
                                        article_id: order.article_id,
                                        client_id: order.client_id,
                                        billing_order_id: order.id,
                                        machine_id: p.machine_id,
                                        type: 'release',
                                        pieces: p.pieces || 0,
                                        weight_kg: p.weight || 0,
                                        reason: `OF #${order.of_number} · Palete ${p.pallet_number} removido (libera reserva)`,
                                        created_by: profile?.id ?? null,
                                      });
                                      if (relErr) throw relErr;
                                    } else {
                                      // SEM MÁQUINA: busca todas as reservas deste palete e libera uma por máquina
                                      const { data: reservas, error: qErr } = await (supabase.from as any)('stock_movements')
                                        .select('id, machine_id, pieces, weight_kg')
                                        .eq('company_id', user.company_id)
                                        .eq('billing_order_id', order.id)
                                        .eq('type', 'reserve')
                                        .eq('reason', `OF #${order.of_number} · Palete ${p.pallet_number} (reserva · sem máquina)`);
                                      if (qErr) throw qErr;
                                      const releases = (reservas || []).map((r: any) => ({
                                        company_id: user.company_id,
                                        article_id: order.article_id,
                                        client_id: order.client_id,
                                        billing_order_id: order.id,
                                        machine_id: r.machine_id,
                                        type: 'release',
                                        pieces: Number(r.pieces) || 0,
                                        weight_kg: Number(r.weight_kg) || 0,
                                        reason: `OF #${order.of_number} · Palete ${p.pallet_number} removido (libera reserva · sem máquina)`,
                                        created_by: profile?.id ?? null,
                                      }));
                                      if (releases.length > 0) {
                                        const { error: relErr } = await (supabase.from as any)('stock_movements').insert(releases);
                                        if (relErr) throw relErr;
                                      }
                                    }
                                    // 2. Apaga palete
                                    const { error: delErr } = await (supabase.from as any)('billing_order_pallets').delete().eq('id', p.id);
                                    if (delErr) throw delErr;
                                    setPallets(prev => prev.filter(x => x.id !== p.id));
                                    refreshStockCaches();
                                    toast({ title: `Palete ${p.pallet_number} removido — estoque liberado` });
                                  } catch (e: any) {
                                    toast({ title: 'Erro ao remover palete', description: e.message, variant: 'destructive' });
                                  } finally {
                                    setPalletBusy(false);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Resumo por máquina */}
                  <div className="rounded-md border p-2 space-y-1 bg-indigo-50/40 dark:bg-indigo-950/20">
                    <div className="text-[10px] uppercase text-muted-foreground font-semibold">Resumo por máquina</div>
                    {machineGroups.length === 1 ? (
                      <div className="text-xs font-bold text-indigo-800 dark:text-indigo-200">
                        Total — {machineGroups[0].name}: {machineGroups[0].pieces} pç · {machineGroups[0].weight.toFixed(2)} kg
                      </div>
                    ) : (
                      machineGroups.map((g, i) => (
                        <div key={i} className="text-xs font-bold text-indigo-800 dark:text-indigo-200 flex justify-between">
                          <span>{g.name} ({g.count} palete{g.count !== 1 ? 's' : ''})</span>
                          <span>{g.pieces} pç · {g.weight.toFixed(2)} kg</span>
                        </div>
                      ))
                    )}
                  </div>
                  </>
                  );
                })()}

                {/* Totais */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Paletes</div>
                    <div className="font-bold text-base">{pallets.length}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Acumulado</div>
                    <div className="font-bold">{totalPieces} pç</div>
                    <div className="font-bold">{totalWeight.toFixed(2)} kg</div>
                  </div>
                  <div className={cn('rounded-md border p-2',
                    orderType === 'pieces'
                      ? (remainingPieces === 0 ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : remainingPieces < 0 ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-amber-400')
                      : (remainingWeight <= 0 ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-400')
                  )}>
                    <div className="text-[10px] uppercase text-muted-foreground">Falta</div>
                    {targetPieces > 0 && (
                      <div className={cn('font-bold', remainingPieces < 0 && 'text-red-600', remainingPieces === 0 && 'text-emerald-600')}>
                        {remainingPieces} pç
                      </div>
                    )}
                    {targetWeight > 0 && (
                      <div className={cn('font-bold', remainingWeight < 0 && 'text-red-600', remainingWeight === 0 && 'text-emerald-600')}>
                        {remainingWeight.toFixed(2)} kg
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPalletsModal(null); setPallets([]); setPalletInput({ pieces: '', weight: '', machine_id: 'none' }); }}>Fechar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              disabled={pallets.length === 0 || updateStatus.isPending}
              onClick={() => {
                const totalWeight = pallets.reduce((s, p) => s + (p.weight || 0), 0);
                if (totalWeight <= 0) {
                  toast({ title: 'Adicione pelo menos um palete com peso para finalizar', variant: 'destructive' });
                  return;
                }
                setConfirmFinalizePallets(true);
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar com {pallets.length} palete{pallets.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Finalizar Paletes → PRONTO */}
      <Dialog open={confirmFinalizePallets} onOpenChange={setConfirmFinalizePallets}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" /> Finalizar Separação?
            </DialogTitle>
          </DialogHeader>
          {showPalletsModal && (() => {
            const totalPieces = pallets.reduce((s, p) => s + (p.pieces || 0), 0);
            const totalWeight = pallets.reduce((s, p) => s + (p.weight || 0), 0);
            const avg = totalPieces > 0 ? totalWeight / totalPieces : 0;
            const article = getArticles().find(a => a.id === showPalletsModal.article_id);
            // Preferência: peso por peça solicitado pelo cliente nesta OF; fallback: peso registrado no artigo.
            const orderPieceTarget = Number((showPalletsModal as any).piece_weight_target || 0);
            const articleWeight = Number(article?.weight_per_roll || 0);
            const refWeight = orderPieceTarget > 0 ? orderPieceTarget : articleWeight;
            const refSource = orderPieceTarget > 0 ? 'OF' : 'artigo';
            const diffPct = refWeight > 0 && avg > 0 ? ((avg - refWeight) / refWeight) * 100 : 0;
            const outOfRange = refWeight > 0 && avg > 0 && Math.abs(diffPct) > 10;
            return (
              <div className="py-3 space-y-3 text-sm">
                <p>
                  Você confirma a finalização da <strong>OF #{showPalletsModal.of_number}</strong> com{' '}
                  <strong>{pallets.length} palete{pallets.length !== 1 ? 's' : ''}</strong>?
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                  <div><span className="text-muted-foreground">Cliente:</span> <strong>{showPalletsModal.client?.name}</strong></div>
                  <div><span className="text-muted-foreground">Artigo:</span> <strong>{showPalletsModal.article?.name}</strong></div>
                  <div className="pt-1 border-t mt-1">
                    <strong>Total:</strong> {totalPieces} pç · {totalWeight.toFixed(2)} kg
                  </div>
                  {totalPieces > 0 && (
                    <div>
                      <strong>Média:</strong> {avg.toFixed(2)} kg/peça
                      {refWeight > 0 && (
                        <span className="text-muted-foreground"> · ref. {refSource}: {refWeight.toFixed(2)} kg ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)</span>
                      )}
                    </div>
                  )}
                </div>
                {outOfRange && (
                  <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold uppercase text-[10px] tracking-wide">Atenção — média fora do esperado</div>
                      <div className="mt-0.5">
                        A média calculada ({avg.toFixed(2)} kg/peça) está <strong>{diffPct >= 0 ? 'acima' : 'abaixo'}</strong> em <strong>{Math.abs(diffPct).toFixed(1)}%</strong> do peso de referência ({refSource === 'OF' ? 'peça-alvo da OF' : 'peso do artigo'}: {refWeight.toFixed(2)} kg). Confira os paletes ou siga em frente se estiver correto.
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                  Ao finalizar, a OF será movida automaticamente para a aba <strong>PRONTO</strong> e ficará disponível para coleta.
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinalizePallets(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              disabled={updateStatus.isPending}
              onClick={async () => {
                if (!showPalletsModal) return;
                const totalPieces = pallets.reduce((s, p) => s + (p.pieces || 0), 0);
                const totalWeight = pallets.reduce((s, p) => s + (p.weight || 0), 0);
                const avg = totalPieces > 0 ? totalWeight / totalPieces : 0;
                const target = showPalletsModal;
                try {
                  await updateStatus.mutateAsync({
                    id: target.id,
                    status: 'ready',
                    data: { pieces_real: totalPieces, weight_real: totalWeight, weight_avg: avg },
                    expectedStatus: 'separating',
                  });
                  setConfirmFinalizePallets(false);
                  setShowPalletsModal(null);
                  setPallets([]);
                  setPalletInput({ pieces: '', weight: '', machine_id: 'none' });
                } catch (err: any) {
                  if (err?.code === 'CONFLICT') {
                    setConfirmFinalizePallets(false);
                    setShowPalletsModal(null);
                    setPallets([]);
                    setConflictInfo({ action: 'lançar dados', ofNumber: target.of_number, currentStatus: err.currentStatus, actor: err.actor });
                  }
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Confirmar e enviar para PRONTO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Atrelar OFs */}
      <Dialog open={showLinkModal} onOpenChange={(v) => { setShowLinkModal(v); if (!v) setLinkSelected(new Set()); }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-fuchsia-600" />
              Atrelar OFs (mesma NF / Romaneio)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground">
              Marque duas ou mais OFs que serão enviadas juntas (ex.: malha + ribana complementar).
              Apenas OFs <strong>Aberto</strong>, <strong>Separando</strong> e <strong>Pronto</strong> aparecem aqui — Coletadas e Canceladas ficam fora.
              Se selecionar uma OF já atrelada, todos os grupos envolvidos serão mesclados em um único.
              {!isAdmin && (
                <div className="mt-2 text-amber-700 dark:text-amber-300 font-semibold">
                  Modo somente leitura — apenas administradores podem atrelar ou desfazer grupos.
                </div>
              )}
            </div>

            {/* Grupos existentes */}
            {activeLinkGroups.size > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Atrelações ativas ({activeLinkGroups.size})</Label>
                <div className="space-y-2">
                  {Array.from(activeLinkGroups.entries()).map(([gid, list]) => (
                    <div key={gid} className="rounded-md border bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-300 dark:border-fuchsia-800 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="text-[10px] bg-fuchsia-600 text-white border-fuchsia-700">
                            GRUPO {groupLabel(gid)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{list.length} OFs</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((o: any) => {
                            const hasDoc = !!o.delivery_doc_number;
                            const st = getStatusStyle(o.status, o.priority, hasDoc);
                            return (
                              <span
                                key={o.id}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-white',
                                  st.stripe
                                )}
                                title={st.label}
                              >
                                <strong>#{o.of_number}</strong>
                                <span className="opacity-90">{o.client?.name}</span>
                                <span className="text-[9px] font-bold uppercase opacity-90 bg-black/20 rounded px-1 py-[1px]">
                                  {st.label}
                                </span>
                                {isAdmin && (
                                  <button
                                    title="Remover do grupo"
                                    className="text-white/80 hover:text-white"
                                    onClick={async () => {
                                      try { await removeFromGroup(o.id); } catch (e: any) {
                                        toast({ title: 'Erro', description: e?.message, variant: 'destructive' });
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
                          onClick={async () => {
                            try { await unlinkGroup(gid); } catch (e: any) {
                              toast({ title: 'Erro', description: e?.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Link2Off className="h-4 w-4" /> Desfazer
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de OFs elegíveis */}
            {isAdmin && (<div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Selecione as OFs para atrelar</Label>
                <span className="text-xs text-muted-foreground">
                  {linkSelected.size} selecionada{linkSelected.size !== 1 ? 's' : ''}
                </span>
              </div>
              {linkableOrders.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8 border rounded-md">
                  Nenhuma OF em aberto, separando ou pronta no momento.
                </div>
              ) : (
                <div className="border rounded-md divide-y max-h-[40vh] overflow-y-auto">
                  {linkableOrders.map((o: any) => {
                    const checked = linkSelected.has(o.id);
                    const statusLabel = o.status === 'open' ? (o.priority ? 'Aberto Prioritário' : 'Aberto') : o.status === 'separating' ? 'Separando' : 'Pronto';
                    const statusColor = o.status === 'open'
                      ? (o.priority ? 'bg-red-600' : 'bg-sky-600')
                      : o.status === 'separating' ? 'bg-amber-500' : 'bg-emerald-600';
                    return (
                      <label
                        key={o.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50',
                          checked && 'bg-fuchsia-50 dark:bg-fuchsia-950/30'
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(linkSelected);
                            if (v) next.add(o.id); else next.delete(o.id);
                            setLinkSelected(next);
                          }}
                        />
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-6 gap-2 items-center text-sm">
                          <div className="flex items-center gap-2">
                            <Badge className={cn('text-[10px] text-white border-0', statusColor)}>{statusLabel}</Badge>
                            <span className="font-bold">#{o.of_number}</span>
                          </div>
                          <div className="sm:col-span-2 truncate">
                            <span className="font-medium">{o.client?.name}</span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{o.article?.name || '—'}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.order_type === 'weight'
                              ? `${o.weight_real ?? o.weight_expected ?? '—'} kg`
                              : `${o.pieces_real ?? o.pieces_expected ?? '—'} pç`}
                          </div>
                          <div className="text-xs">
                            {o.link_group_id ? (
                              <Badge className="text-[10px] bg-fuchsia-600 text-white">{groupLabel(o.link_group_id)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>)}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowLinkModal(false); setLinkSelected(new Set()); }}>
              Fechar
            </Button>
            {isAdmin && (
              <Button
                className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                disabled={linkSelected.size < 2 || linkBusy}
                onClick={handleLink}
              >
                <Link2 className="h-4 w-4" />
                {linkBusy ? 'Atrelando...' : `Atrelar ${linkSelected.size} OFs`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes da OF (olho) */}
      <Dialog open={!!showDetailsModal} onOpenChange={(o) => { if (!o) { setShowDetailsModal(null); setDetailsPallets([]); } }}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Eye className="h-5 w-5" /> Detalhes · OF #{showDetailsModal?.of_number}
            </DialogTitle>
          </DialogHeader>
          {showDetailsModal && (() => {
            const order = showDetailsModal;
            const machinesMap = new Map(getMachines().map((m: any) => [m.id, m.name]));
            const machineName = (id?: string | null) => id ? (machinesMap.get(id) || '—') : 'Sem máquina';
            const byMachine = new Map<string, { name: string; pieces: number; weight: number; count: number; pallets: typeof detailsPallets }>();
            for (const p of detailsPallets) {
              const key = p.machine_id || '__none__';
              const cur = byMachine.get(key) || { name: machineName(p.machine_id), pieces: 0, weight: 0, count: 0, pallets: [] };
              cur.pieces += p.pieces;
              cur.weight += p.weight;
              cur.count += 1;
              cur.pallets.push(p);
              byMachine.set(key, cur);
            }
            const groups = Array.from(byMachine.values());
            const single = groups.length === 1;
            const totalP = groups.reduce((s, g) => s + g.pieces, 0);
            const totalW = groups.reduce((s, g) => s + g.weight, 0);
            const companions = order.link_group_id && linkGroups.has(order.link_group_id)
              ? linkGroups.get(order.link_group_id)!.filter((x: any) => x.id !== order.id)
              : [];
            return (
              <div className="space-y-3 py-2 text-sm">
                {/* Cabeçalho de dados gerais */}
                <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="text-muted-foreground">Cliente:</span> <strong>{order.client?.name || '—'}</strong></div>
                    <div><span className="text-muted-foreground">Artigo:</span> <strong>{order.article?.name || '—'}</strong></div>
                    <div><span className="text-muted-foreground">Máquina (OF):</span> <strong>{order.machine?.name || '—'}</strong></div>
                    <div><span className="text-muted-foreground">Tipo:</span> <strong>{order.order_type === 'all' ? 'Coletar tudo' : order.order_type === 'weight' ? 'Por peso' : 'Por peças'}</strong></div>
                    <div><span className="text-muted-foreground">Solicitado:</span> <strong>{order.pieces_expected ?? '—'} pç · {order.weight_expected ? `${Number(order.weight_expected).toFixed(2)} kg` : '—'}</strong></div>
                    <div><span className="text-muted-foreground">Realizado:</span> <strong>{order.pieces_real ?? '—'} pç · {order.weight_real ? `${Number(order.weight_real).toFixed(2)} kg` : '—'}</strong></div>
                    {order.piece_weight_target != null && (
                      <div><span className="text-muted-foreground">Peça alvo:</span> <strong>{Number(order.piece_weight_target)} kg</strong></div>
                    )}
                    {order.weight_avg && (
                      <div><span className="text-muted-foreground">Média:</span> <strong>{Number(order.weight_avg).toFixed(2)} kg/pç</strong></div>
                    )}
                    {(order as any).delivery_doc_number && (
                      <div><span className="text-muted-foreground">{(order as any).delivery_doc_type === 'romaneio' ? 'Romaneio' : 'NF'}:</span> <strong>{(order as any).delivery_doc_number}</strong></div>
                    )}
                    {companions.length > 0 && (
                      <div className="col-span-full"><span className="text-muted-foreground">Atrelada a:</span> <strong>{companions.map((x: any) => `#${x.of_number}`).join(' + ')}</strong></div>
                    )}
                  </div>
                  <div className="pt-1 mt-1 border-t text-[10px] text-muted-foreground">
                    Criado por {order.creator?.name} #{order.creator?.code} em {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {order.separated_by && <> · Separado por {order.separator?.name} #{order.separator?.code}</>}
                    {order.collected_by && <> · Coletado por {order.collector?.name} #{order.collector?.code}</>}
                  </div>
                </div>

                {/* Paletes */}
                <div className="rounded-md border border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-3">
                  <div className="text-xs uppercase font-bold text-indigo-700 dark:text-indigo-300 mb-2 flex items-center gap-1">
                    <Boxes className="h-4 w-4" /> Paletes ({detailsPallets.length})
                  </div>
                  {detailsPallets.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">Nenhum palete registrado para esta OF.</div>
                  ) : (
                    <div className="space-y-3">
                      {groups.map((g, gi) => (
                        <div key={gi} className="rounded-md bg-white/70 dark:bg-black/30 border border-indigo-200 dark:border-indigo-900">
                          <div className="flex justify-between items-center px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 rounded-t-md">
                            <span className="font-bold text-xs text-indigo-900 dark:text-indigo-100">Máquina: {g.name}</span>
                            <span className="text-xs font-semibold">{g.pieces} pç · {g.weight.toFixed(2)} kg <span className="text-muted-foreground font-normal">({g.count} palete{g.count > 1 ? 's' : ''})</span></span>
                          </div>
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr>
                                <th className="text-left px-2 py-1">#</th>
                                <th className="text-right px-2 py-1">Peças</th>
                                <th className="text-right px-2 py-1">Peso (kg)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.pallets.map(p => (
                                <tr key={p.id} className="border-t border-indigo-100 dark:border-indigo-900">
                                  <td className="px-2 py-1">Palete {p.pallet_number}</td>
                                  <td className="px-2 py-1 text-right">{p.pieces}</td>
                                  <td className="px-2 py-1 text-right">{p.weight.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                      <div className={cn(
                        'text-xs font-bold pt-2 border-t border-indigo-200 dark:border-indigo-800 flex justify-between',
                        single ? 'text-indigo-900 dark:text-indigo-100' : 'text-indigo-900 dark:text-indigo-100'
                      )}>
                        <span>{single ? 'Total (única máquina)' : 'Total geral'}</span>
                        <span>{totalP} pç · {totalW.toFixed(2)} kg</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingOrders;