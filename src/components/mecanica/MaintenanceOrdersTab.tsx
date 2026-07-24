import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Play, Square, Trash2, Pencil, Clock, AlertTriangle, Wrench, Loader2, X, StickyNote, Download, FileText, Camera, ImageIcon, Eye, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type {
  Machine, MaintenanceOrder, MaintenanceOrderItem, MaintenanceOrderItemType,
  MaintenanceOrderType, MaintenanceOrderPriority, MaintenanceOrderStatus,
  NeedleInventory, SinkerInventory, Cylinder,
} from '@/types';
import { SearchableSelect } from '@/components/SearchableSelect';
import { generateOmReportPdf } from '@/lib/omReportPdf';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useMarkSourceAsRead } from '@/hooks/useMarkSourceAsRead';

const DEFAULT_MAINTENANCE_INTERVAL_DAYS = 30;

type ProgressNote = {
  id: string;
  ts: string;
  author: string | null;
  kind: 'observacao' | 'item';
  text: string;
};

type OCPhoto = {
  id: string;
  path: string;
  description: string;
  author: string | null;
  ts: string;
};

const TYPE_LABELS: Record<MaintenanceOrderType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  troca_artigo: 'Troca de Artigo',
  troca_agulhas: 'Troca de Agulheiro',
};
// Tipos disponíveis no modal "Nova OM" (corretiva foi movida para "Nova OC")
const OM_TYPE_LABELS: Partial<Record<MaintenanceOrderType, string>> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  troca_agulhas: 'Troca de Agulheiro',
};
const TYPE_COLORS: Record<MaintenanceOrderType, string> = {
  manutencao_preventiva: 'bg-warning/15 text-warning border-warning/30',
  manutencao_corretiva: 'bg-destructive/15 text-destructive border-destructive/30',
  troca_artigo: 'bg-info/15 text-info border-info/30',
  troca_agulhas: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
};

const STATUS_STYLE: Record<MaintenanceOrderStatus, { stripe: string; label: string; badgeClass: string }> = {
  aberto: { stripe: 'bg-amber-500', label: 'ABERTO', badgeClass: 'bg-amber-500 text-white border-amber-600' },
  em_curso: { stripe: 'bg-blue-600', label: 'EM CURSO', badgeClass: 'bg-blue-600 text-white border-blue-700' },
  finalizada: { stripe: 'bg-emerald-600', label: 'FINALIZADA', badgeClass: 'bg-emerald-600 text-white border-emerald-700' },
  cancelada: { stripe: 'bg-zinc-500', label: 'CANCELADA', badgeClass: 'bg-zinc-500 text-white border-zinc-600' },
};

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

function useLiveTimer(startedAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

function LiveTimer({ startedAt }: { startedAt?: string | null }) {
  const s = useLiveTimer(startedAt);
  return <span className="font-mono tabular-nums">{fmtDuration(s)}</span>;
}

interface Props {
  machines: Machine[];
  needles: NeedleInventory[];
  sinkers: SinkerInventory[];
  cylinders: Cylinder[];
  refreshMachines: () => void;
  /** 'om' = ordens não-corretivas (preventiva, troca de artigo, troca de agulheiro).
   *  'oc' = ordens de corretiva. Default 'om'. */
  mode?: 'om' | 'oc';
}

export default function MaintenanceOrdersTab({ machines, needles, sinkers, cylinders, refreshMachines, mode = 'om' }: Props) {
  const isOC = mode === 'oc';
  useMarkSourceAsRead(isOC ? 'OC' : 'OM');
  const labelShort = isOC ? 'OC' : 'OM';
  const labelLong = isOC ? 'Ordens de Corretiva' : 'Ordens de Manutenção';
  const { user } = useAuth();
  const { logAction, userName, userCode } = useAuditLog();
  const { role } = usePermissions();
  const { getMachineLogs, getProductions } = useSharedCompanyData();
  const machineLogs = getMachineLogs();
  const productions = getProductions();
  const companyId = user?.company_id || '';
  const authorLabel = userName ? (userCode ? `${userName} #${userCode}` : userName) : null;

  const canManage = role === 'admin' || role === 'lider_mecanica';
  const canExecute = canManage || role === 'mecanico' || role === 'lider' || role === 'lider_noite';
  const isAdmin = role === 'admin';
  // OC (Ordem de Corretiva): admin e líder criam
  const canCreateCorrective = role === 'admin' || role === 'lider' || role === 'lider_noite';
  // OC: mecânicos, líder de mecânica e admin (acesso total) iniciam/finalizam
  const canExecuteCorrective = role === 'admin' || role === 'mecanico' || role === 'lider_mecanica' || role === 'lider_noite';
  const canExecuteOrder = (o: MaintenanceOrder) =>
    o.type === 'manutencao_corretiva' ? canExecuteCorrective : canExecute;
  const canManageOrder = (o: MaintenanceOrder) =>
    o.type === 'manutencao_corretiva' ? canCreateCorrective : canManage;
  // Permissões efetivas para o botão "Nova ..." no cabeçalho da aba atual
  const canCreateInThisMode = isOC ? canCreateCorrective : canManage;
  // Nº exibido (OM usa om_number; OC usa oc_number; fallback para o legado)
  const displayNumber = (o: MaintenanceOrder) => {
    const raw = o.type === 'manutencao_corretiva'
      ? ((o.oc_number ?? o.om_number) as number | null | undefined)
      : (o.om_number as number | null | undefined);
    return raw != null ? String(raw).padStart(3, '0') : '—';
  };
  const labelOf = (o: MaintenanceOrder) => (o.type === 'manutencao_corretiva' ? 'OC' : 'OM');
  // Quem pode abrir o modal "Notas/Itens" (leitura em tempo real p/ admin e criadores)
  const canViewProgressNotes = (o: MaintenanceOrder) =>
    canExecuteOrder(o) || canManageOrder(o) || isAdmin;

  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [items, setItems] = useState<MaintenanceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MaintenanceOrderStatus>('aberto');
  const [finalizedSearch, setFinalizedSearch] = useState('');
  const [finalizedPage, setFinalizedPage] = useState(0);
  const FINALIZED_PAGE_SIZE = 15;
  // Confirm dialogs
  const [confirmStart, setConfirmStart] = useState<MaintenanceOrder | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<MaintenanceOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<MaintenanceOrder | null>(null);
  const [confirmFinishGate, setConfirmFinishGate] = useState(false);
  // Progress notes modal (Em Curso)
  const [progressOrder, setProgressOrder] = useState<MaintenanceOrder | null>(null);
  const [progressDraft, setProgressDraft] = useState<{ kind: 'observacao' | 'item'; text: string }>({ kind: 'observacao', text: '' });
  const [progressSaving, setProgressSaving] = useState(false);
  // OC photos (Em Curso): captura até 2 fotos com descrição
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoDraftFile, setPhotoDraftFile] = useState<File | null>(null);
  const [photoDraftPreview, setPhotoDraftPreview] = useState<string | null>(null);
  const [photoDraftDesc, setPhotoDraftDesc] = useState('');
  const [photoSignedUrls, setPhotoSignedUrls] = useState<Record<string, string>>({});
  const [viewOrder, setViewOrder] = useState<MaintenanceOrder | null>(null);

  const load = async (opts?: { silent?: boolean }) => {
    if (!companyId) return;
    if (!opts?.silent) setLoading(true);
    // [rpcmecanica Fase 2] 1 RPC consolidada em vez de 2 SELECTs
    const { data, error } = await (supabase.rpc as any)('get_maintenance_orders_list', { p_company_id: companyId });
    if (error) {
      console.error('[MaintenanceOrdersTab.load] rpc failed', error);
      toast.error('Erro ao carregar ordens de manutenção');
    }
    const payload = (data || {}) as { orders?: MaintenanceOrder[]; items?: MaintenanceOrderItem[] };
    setOrders((payload.orders as MaintenanceOrder[]) || []);
    setItems((payload.items as MaintenanceOrderItem[]) || []);
    if (!opts?.silent) setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  // Realtime: recarrega OMs/itens/observações quando qualquer usuário da empresa mexer
  useEffect(() => {
    if (!companyId) return;
    let scheduled = false;
    const bump = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { scheduled = false; load({ silent: true }); }, 400);
    };
    const channel = supabase.channel(`om-rt-${companyId}`);
    for (const t of ['maintenance_orders', 'maintenance_order_items', 'machine_maintenance_observations']) {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: t, filter: `company_id=eq.${companyId}` },
        bump,
      );
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const machineById = useMemo(() => Object.fromEntries(machines.map(m => [m.id, m])), [machines]);

  // Map user_id -> code para complementar nomes de autoria gravados sem "#código"
  const [profileCodes, setProfileCodes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!companyId) return;
    (supabase.from as any)('profiles')
      .select('user_id, code')
      .eq('company_id', companyId)
      .then(({ data }: any) => {
        const map: Record<string, string> = {};
        (data || []).forEach((p: any) => { if (p.user_id && p.code) map[p.user_id] = String(p.code); });
        setProfileCodes(map);
      });
  }, [companyId]);

  const renderAuthor = (name?: string | null, userId?: string | null) => {
    if (!name) return '—';
    if (name.includes('#')) return name;
    const code = userId ? profileCodes[userId] : null;
    return code ? `${name} #${code}` : name;
  };

  // ============ CREATE / EDIT MODAL ============
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceOrder | null>(null);
  const [correctiveMode, setCorrectiveMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  // Guarda anti double-click síncrono: o `disabled={savingOrder}` só bloqueia após
  // o próximo render. Cliques muito rápidos entram na função antes disso e
  // acabavam criando OMs/OCs duplicadas — cada uma disparando seu push.
  const savingOrderRef = useRef(false);
  const [form, setForm] = useState({
    machine_id: '',
    type: 'manutencao_preventiva' as MaintenanceOrderType,
    priority: 'normal' as MaintenanceOrderPriority,
    description: '',
  });
  // Fotos opcionais anexadas já na criação de uma OC (até 2)
  type CreatePhotoDraft = { id: string; file: File; preview: string; description: string };
  const [createPhotoDrafts, setCreatePhotoDrafts] = useState<CreatePhotoDraft[]>([]);
  const clearCreatePhotoDrafts = () => {
    setCreatePhotoDrafts(prev => {
      prev.forEach(p => { try { URL.revokeObjectURL(p.preview); } catch { /* */ } });
      return [];
    });
  };
  const addCreatePhotoDraft = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem acima de 8 MB'); return; }
    setCreatePhotoDrafts(prev => {
      if (prev.length >= 2) { toast.error('Máximo de 2 fotos'); return prev; }
      const id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
      return [...prev, { id, file, preview: URL.createObjectURL(file), description: '' }];
    });
  };
  const removeCreatePhotoDraft = (id: string) => {
    setCreatePhotoDrafts(prev => {
      const found = prev.find(p => p.id === id);
      if (found) { try { URL.revokeObjectURL(found.preview); } catch { /* */ } }
      return prev.filter(p => p.id !== id);
    });
  };
  const updateCreatePhotoDesc = (id: string, description: string) => {
    setCreatePhotoDrafts(prev => prev.map(p => p.id === id ? { ...p, description } : p));
  };
  const openCreate = () => {
    setEditing(null);
    setCorrectiveMode(false);
    setForm({ machine_id: '', type: 'manutencao_preventiva', priority: 'normal', description: '' });
    savingOrderRef.current = false;
    setSavingOrder(false);
    clearCreatePhotoDrafts();
    setCreateOpen(true);
  };
  const openCreateCorrective = () => {
    setEditing(null);
    setCorrectiveMode(true);
    setForm({ machine_id: '', type: 'manutencao_corretiva', priority: 'prioritaria', description: '' });
    savingOrderRef.current = false;
    setSavingOrder(false);
    clearCreatePhotoDrafts();
    setCreateOpen(true);
  };
  const openEdit = (o: MaintenanceOrder) => {
    setEditing(o);
    setCorrectiveMode(o.type === 'manutencao_corretiva');
    setForm({ machine_id: o.machine_id, type: o.type, priority: o.priority, description: o.description || '' });
    savingOrderRef.current = false;
    setSavingOrder(false);
    clearCreatePhotoDrafts();
    setCreateOpen(true);
  };
  const saveOrder = async () => {
    if (savingOrderRef.current) return;
    savingOrderRef.current = true;
    setSavingOrder(true);
    try {
    if (!form.machine_id) { toast.error('Selecione uma máquina'); return; }
    const isCorrective = form.type === 'manutencao_corretiva';
    if (isCorrective && !canCreateCorrective) { toast.error('Apenas admin ou líder podem criar OC'); return; }
    if (!isCorrective && !canManage) { toast.error('Sem permissão para criar OM'); return; }
    // Regras de criação:
    // - Bloqueia se já existe uma ordem do MESMO tipo (OM ou OC) em aberto/em curso na máquina
    //   (evita duplicar OM ou OC para a mesma máquina).
    // - Bloqueia se existe qualquer ordem EM CURSO na máquina (não faz sentido programar outra
    //   enquanto a máquina está parada em manutenção).
    // - PERMITE criar OC quando já existe uma OM apenas em aberto (programada) — e vice-versa.
    if (!editing) {
      const sameTypeBusy = orders.find(o =>
        o.machine_id === form.machine_id &&
        o.type === form.type &&
        (o.status === 'aberto' || o.status === 'em_curso')
      );
      if (sameTypeBusy) {
        const m = machineById[form.machine_id];
        toast.error(`${m?.name || 'Máquina'} já tem a ${labelOf(sameTypeBusy)} #${displayNumber(sameTypeBusy)} ${sameTypeBusy.status === 'aberto' ? 'em aberto' : 'em curso'}. Finalize ou cancele antes de criar outra.`);
        return;
      }
      const otherInProgress = orders.find(o =>
        o.machine_id === form.machine_id && o.status === 'em_curso'
      );
      if (otherInProgress) {
        const m = machineById[form.machine_id];
        toast.error(`${m?.name || 'Máquina'} está com a ${labelOf(otherInProgress)} #${displayNumber(otherInProgress)} em curso. Finalize antes de abrir outra ordem.`);
        return;
      }
    }
    const orderLabel = isCorrective ? 'OC' : 'OM';
    if (editing) {
      const { error } = await (supabase.from as any)('maintenance_orders').update({
        machine_id: form.machine_id, type: form.type, priority: form.priority, description: form.description || null,
      }).eq('id', editing.id);
      if (error) { toast.error(`Erro ao atualizar ${orderLabel}`); return; }
      toast.success(`${orderLabel} #${displayNumber(editing)} atualizada`);
      logAction(isCorrective ? 'oc_update' : 'om_update', { om: editing.om_number, oc: editing.oc_number });
    } else {
      const { data, error } = await (supabase.from as any)('maintenance_orders').insert({
        company_id: companyId,
        machine_id: form.machine_id,
        type: form.type,
        priority: form.priority,
        description: form.description || null,
        created_by_id: user?.id,
        created_by_name: authorLabel,
      }).select().single();
      if (error) { toast.error(`Erro ao criar ${orderLabel}`); return; }
      const created = data as any;
      const createdNum = isCorrective ? (created.oc_number ?? created.om_number) : created.om_number;
      toast.success(`${orderLabel} #${String(createdNum).padStart(3, '0')} criada`);
      logAction(isCorrective ? 'oc_create' : 'om_create', { number: createdNum, type: form.type });
      // Upload de fotos anexadas já na criação da OC (opcional, até 2)
      if (isCorrective && createPhotoDrafts.length > 0) {
        const uploaded: OCPhoto[] = [];
        const uploadedPaths: string[] = [];
        try {
          for (const draft of createPhotoDrafts) {
            const ext = (draft.file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const uid = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
            const path = `${companyId}/${created.id}/${uid}.${ext}`;
            const { error: upErr } = await supabase.storage.from('oc-photos').upload(path, draft.file, {
              contentType: draft.file.type || 'image/jpeg',
              upsert: false,
            });
            if (upErr) throw upErr;
            uploadedPaths.push(path);
            uploaded.push({
              id: uid,
              path,
              description: draft.description.trim(),
              author: authorLabel,
              ts: new Date().toISOString(),
            });
          }
          const { error: updErr } = await (supabase.from as any)('maintenance_orders')
            .update({ oc_photos: uploaded })
            .eq('id', created.id);
          if (updErr) throw updErr;
        } catch (photoErr) {
          console.error('Falha ao anexar fotos à OC', photoErr);
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('oc-photos').remove(uploadedPaths).catch(() => { /* */ });
          }
          toast.error('OC criada, mas houve erro ao anexar as fotos.');
        }
      }
      // Notificação push para mecânicos/líder de mecânica
      try {
        const machineName = machineById[form.machine_id]?.name || 'Máquina';
        const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
        const targetPath = slug ? `/${slug}/mecanica/${isCorrective ? 'oc' : 'om'}` : '/';
        supabase.functions.invoke('send-push-notification', {
          body: {
            company_id: companyId,
            title: isCorrective
              ? `Nova OC #${String(createdNum).padStart(3, '0')} — ${machineName}`
              : `Nova OM #${String(createdNum).padStart(3, '0')} — ${machineName}`,
            message: form.description || (isCorrective ? 'Ordem de Corretiva aberta' : 'Ordem de Manutenção aberta'),
            url: targetPath,
            roles: ['mecanico', 'lider_mecanica', 'lider_noite'],
            include_admins: true,
            source: isCorrective ? 'OC' : 'OM',
            ref_id: created.id,
            ref_number: `${isCorrective ? 'OC' : 'OM'} #${String(createdNum).padStart(3, '0')}`,
          },
        }).catch(() => { /* silencioso */ });
      } catch { /* silencioso */ }
    }
      setCreateOpen(false);
      clearCreatePhotoDrafts();
    await load();
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
    }
  };

  // ============ START ============
  const startOrder = async (o: MaintenanceOrder) => {
    if (!canExecuteOrder(o)) { toast.error(o.type === 'manutencao_corretiva' ? 'Apenas mecânico ou líder de mecânica podem iniciar OCs' : 'Sem permissão para iniciar OM'); return; }
    // Não permite iniciar se já existe outra ordem em curso na mesma máquina
    const inProgress = orders.find(x =>
      x.machine_id === o.machine_id && x.status === 'em_curso' && x.id !== o.id
    );
    if (inProgress) {
      const m = machineById[o.machine_id];
      toast.error(`${m?.name || 'Máquina'} está com a ${labelOf(inProgress)} #${displayNumber(inProgress)} em curso. Finalize antes de iniciar esta ordem.`);
      return;
    }
    const now = new Date().toISOString();
    // 0) fecha qualquer machine_log em aberto dessa máquina (evita 2 logs abertos)
    const { error: closeErr } = await (supabase.from as any)('machine_logs')
      .update({ ended_at: now, ended_by_name: authorLabel })
      .eq('machine_id', o.machine_id)
      .is('ended_at', null);
    if (closeErr) {
      toast.error('Falha ao fechar logs abertos da máquina. Tente novamente.');
      console.error('[startOrder] close open logs failed', { closeErr, machine_id: o.machine_id });
      return;
    }
    // 1) cria machine_log da OM
    const { data: log, error: logErr } = await (supabase.from as any)('machine_logs').insert({
      machine_id: o.machine_id,
      company_id: companyId,
      status: o.type,
      started_at: now,
      started_by_name: authorLabel,
    }).select().single();
    if (logErr) { toast.error('Erro ao registrar início'); return; }
    // 2) atualiza machines.status (com verificação, mesmo padrão de confirmFinish)
    const { error: machErr, data: machUpd } = await (supabase.from as any)('machines')
      .update({ status: o.type })
      .eq('id', o.machine_id)
      .select('id');
    if (machErr || !machUpd || (Array.isArray(machUpd) && machUpd.length === 0)) {
      toast.error('Falha ao atualizar status da máquina. Verifique em Máquinas.');
      console.error('[startOrder] machine status update failed', { machErr, machUpd, machine_id: o.machine_id });
      return;
    }
    // 3) atualiza OM
    const { error } = await (supabase.from as any)('maintenance_orders').update({
      status: 'em_curso', started_at: now, started_by_id: user?.id, started_by_name: authorLabel,
      machine_log_id: (log as any).id,
    }).eq('id', o.id);
    const isCorr = o.type === 'manutencao_corretiva';
    if (error) { toast.error(`Erro ao iniciar ${isCorr ? 'OC' : 'OM'}`); return; }
    toast.success(`${isCorr ? 'OC' : 'OM'} iniciada`);
    logAction(isCorr ? 'oc_start' : 'om_start', isCorr ? { oc: o.oc_number } : { om: o.om_number });
    refreshMachines();
    await load();
  };

  // ============ FINISH MODAL ============
  const [finishOrder, setFinishOrder] = useState<MaintenanceOrder | null>(null);
  const [finishItems, setFinishItems] = useState<Array<{ item_type: MaintenanceOrderItemType; ref_id: string; description: string; quantity: number }>>([]);
  const openFinish = (o: MaintenanceOrder) => {
    setFinishOrder(o);
    setFinishItems([]);
    setFinishNotes(o.finish_notes || '');
  };
  const [finishNotes, setFinishNotes] = useState('');
  const addItem = () => setFinishItems(p => [...p, { item_type: 'agulha', ref_id: '', description: '', quantity: 1 }]);
  const removeItem = (idx: number) => setFinishItems(p => p.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<{ item_type: MaintenanceOrderItemType; ref_id: string; description: string; quantity: number }>) =>
    setFinishItems(p => p.map((it, i) => i === idx ? { ...it, ...patch } : it));

  // Guarda anti double-click do fluxo de finalização (evita duplicar OM/OC
  // finalizadas, transações de estoque e push notifications).
  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);

  const confirmFinish = async () => {
    if (!finishOrder || !finishOrder.started_at) return;
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
    const isCorr = finishOrder.type === 'manutencao_corretiva';
    // [rpcmecanica Fase 3] Toda a finalização acontece em 1 chamada atômica.
    // Ganhos: sem status travado, sem itens/transações órfãs, idempotência real.
    const payloadItems = finishItems
      .filter(it => it.quantity > 0 && (it.ref_id || it.description))
      .map(it => ({
        item_type: it.item_type,
        ref_id: it.ref_id || null,
        description: it.description || null,
        quantity: it.quantity,
      }));
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('finalize_maintenance_order', {
      p_order_id: finishOrder.id,
      p_items: payloadItems,
      p_finish_notes: finishNotes || null,
      p_author_name: authorLabel,
      p_author_user_id: user?.id ?? null,
    });
    if (rpcErr) {
      console.error('[confirmFinish] finalize_maintenance_order failed', rpcErr);
      toast.error(`Erro ao finalizar ${isCorr ? 'OC' : 'OM'}`);
      return;
    }
    const seconds: number = (rpcData && rpcData.duration_seconds) ?? 0;
    const itemsInsertedCount: number = (rpcData && rpcData.items_inserted) ?? payloadItems.length;
    const alreadyFinalized = !!(rpcData && rpcData.already);

    if (alreadyFinalized) {
      // Idempotência: OM já estava finalizada (duplo clique / concorrência).
      // Não dispara push nem audit para não duplicar histórico.
      toast.success(`${isCorr ? 'OC' : 'OM'} já finalizada`);
      setFinishOrder(null);
      await load();
      await Promise.resolve(refreshMachines());
      return;
    }

    toast.success(`${isCorr ? 'OC' : 'OM'} finalizada`);
    logAction(
      isCorr ? 'oc_finish' : 'om_finish',
      isCorr
        ? { oc: finishOrder.oc_number, duration_s: seconds, items: itemsInsertedCount }
        : { om: finishOrder.om_number, duration_s: seconds, items: itemsInsertedCount },
    );
    // Push de finalização — notifica admins (e líderes/mecânicos envolvidos)
    try {
      const finishedNum = isCorr ? (finishOrder.oc_number ?? finishOrder.om_number) : finishOrder.om_number;
      const machineName = machineById[finishOrder.machine_id]?.name || 'Máquina';
      const slug = (typeof window !== 'undefined') ? (window.location.pathname.split('/')[1] || '') : '';
      const targetPath = slug ? `/${slug}/mecanica/${isCorr ? 'oc' : 'om'}` : '/';
      supabase.functions.invoke('send-push-notification', {
        body: {
          company_id: companyId,
          title: isCorr
            ? `OC #${String(finishedNum).padStart(3, '0')} finalizada — ${machineName}`
            : `OM #${String(finishedNum).padStart(3, '0')} finalizada — ${machineName}`,
          message: `Duração: ${fmtDuration(seconds)}${finishNotes ? ` — ${finishNotes}` : ''}`,
          url: targetPath,
          roles: ['mecanico', 'lider_mecanica', 'lider_noite'],
          include_admins: true,
          source: isCorr ? 'OC' : 'OM',
          ref_id: finishOrder.id,
          ref_number: `${isCorr ? 'OC' : 'OM'} #${String(finishedNum).padStart(3, '0')}`,
        },
      }).catch(() => { /* silencioso */ });
    } catch { /* silencioso */ }
    setFinishOrder(null);
    await load();
    await Promise.resolve(refreshMachines());
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  };

  // ============ CANCEL ============
  const cancelOrder = async (o: MaintenanceOrder, reason: string | null) => {
    if (!canManageOrder(o)) { toast.error('Sem permissão para cancelar esta ordem'); return; }
    const label = o.type === 'manutencao_corretiva' ? 'OC' : 'OM';
    if (o.status !== 'aberto') { toast.error(`Só é possível cancelar ${label}s em aberto`); return; }
    const { error } = await (supabase.from as any)('maintenance_orders').update({
      status: 'cancelada', cancelled_at: new Date().toISOString(), cancelled_by_id: user?.id, cancelled_by_name: authorLabel,
      cancellation_reason: reason,
    }).eq('id', o.id);
    if (error) { toast.error('Erro ao cancelar'); return; }
    toast.success(`${label} cancelada`);
    logAction(
      o.type === 'manutencao_corretiva' ? 'oc_cancel' : 'om_cancel',
      o.type === 'manutencao_corretiva' ? { oc: o.oc_number, reason } : { om: o.om_number, reason },
    );
    await load();
  };

  // ============ PROGRESS NOTES (em curso) ============
  const openProgress = (o: MaintenanceOrder) => {
    setProgressOrder(o);
    setProgressDraft({ kind: 'observacao', text: '' });
    resetPhotoDraft();
  };
  const currentProgressList: ProgressNote[] = useMemo(() => {
    if (!progressOrder) return [];
    const fresh = orders.find(o => o.id === progressOrder.id) || progressOrder;
    return Array.isArray(fresh.progress_notes) ? (fresh.progress_notes as ProgressNote[]) : [];
  }, [orders, progressOrder]);

  const currentPhotos: OCPhoto[] = useMemo(() => {
    if (!progressOrder) return [];
    const fresh = orders.find(o => o.id === progressOrder.id) || progressOrder;
    return Array.isArray((fresh as any).oc_photos) ? ((fresh as any).oc_photos as OCPhoto[]) : [];
  }, [orders, progressOrder]);

  // Gera signed URLs para preview das fotos no modal
  useEffect(() => {
    if (!progressOrder || currentPhotos.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = currentPhotos.filter(p => !photoSignedUrls[p.path]);
      if (missing.length === 0) return;
      const entries: Array<[string, string]> = [];
      for (const p of missing) {
        const { data } = await supabase.storage.from('oc-photos').createSignedUrl(p.path, 3600);
        if (data?.signedUrl) entries.push([p.path, data.signedUrl]);
      }
      if (!cancelled && entries.length) {
        setPhotoSignedUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => { cancelled = true; };
  }, [progressOrder, currentPhotos, photoSignedUrls]);

  // Signed URLs para fotos do modal "Ver Relatório" (finalizada)
  const viewOrderPhotos: OCPhoto[] = useMemo(() => {
    if (!viewOrder) return [];
    const fresh = orders.find(o => o.id === viewOrder.id) || viewOrder;
    return Array.isArray((fresh as any).oc_photos) ? ((fresh as any).oc_photos as OCPhoto[]) : [];
  }, [orders, viewOrder]);
  useEffect(() => {
    if (!viewOrder || viewOrderPhotos.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = viewOrderPhotos.filter(p => !photoSignedUrls[p.path]);
      if (missing.length === 0) return;
      const entries: Array<[string, string]> = [];
      for (const p of missing) {
        const { data } = await supabase.storage.from('oc-photos').createSignedUrl(p.path, 3600);
        if (data?.signedUrl) entries.push([p.path, data.signedUrl]);
      }
      if (!cancelled && entries.length) {
        setPhotoSignedUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => { cancelled = true; };
  }, [viewOrder, viewOrderPhotos, photoSignedUrls]);

  const resetPhotoDraft = () => {
    setPhotoDraftFile(null);
    setPhotoDraftDesc('');
    if (photoDraftPreview) { try { URL.revokeObjectURL(photoDraftPreview); } catch { /* */ } }
    setPhotoDraftPreview(null);
  };

  const onPickPhoto = (file: File | null) => {
    if (photoDraftPreview) { try { URL.revokeObjectURL(photoDraftPreview); } catch { /* */ } }
    if (!file) { setPhotoDraftFile(null); setPhotoDraftPreview(null); return; }
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem acima de 8 MB'); return; }
    setPhotoDraftFile(file);
    setPhotoDraftPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async () => {
    if (!progressOrder || !photoDraftFile) return;
    if (currentPhotos.length >= 2) { toast.error('Máximo de 2 fotos por OC'); return; }
    const desc = photoDraftDesc.trim();
    if (!desc) { toast.error('Adicione uma descrição para a foto'); return; }
    setPhotoUploading(true);
    try {
      const ext = (photoDraftFile.name.split('.').pop() || 'jpg').toLowerCase();
      const id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
      const path = `${companyId}/${progressOrder.id}/${id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('oc-photos').upload(path, photoDraftFile, {
        contentType: photoDraftFile.type || 'image/jpeg',
        upsert: false,
      });
      if (upErr) { toast.error('Erro ao enviar foto'); console.error(upErr); return; }
      const photo: OCPhoto = { id, path, description: desc, author: authorLabel, ts: new Date().toISOString() };
      const next = [...currentPhotos, photo];
      const { error } = await (supabase.from as any)('maintenance_orders')
        .update({ oc_photos: next })
        .eq('id', progressOrder.id);
      if (error) {
        await supabase.storage.from('oc-photos').remove([path]);
        toast.error('Erro ao salvar foto');
        return;
      }
      setOrders(prev => prev.map(o => o.id === progressOrder.id ? { ...o, oc_photos: next } as any : o));
      toast.success('Foto adicionada');
      logAction('oc_photo_add', { oc: progressOrder.oc_number });
      resetPhotoDraft();
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = async (photo: OCPhoto) => {
    if (!progressOrder) return;
    const next = currentPhotos.filter(p => p.id !== photo.id);
    const { error } = await (supabase.from as any)('maintenance_orders')
      .update({ oc_photos: next })
      .eq('id', progressOrder.id);
    if (error) { toast.error('Erro ao remover foto'); return; }
    await supabase.storage.from('oc-photos').remove([photo.path]).catch(() => { /* */ });
    setOrders(prev => prev.map(o => o.id === progressOrder.id ? { ...o, oc_photos: next } as any : o));
    setPhotoSignedUrls(prev => { const c = { ...prev }; delete c[photo.path]; return c; });
    logAction('oc_photo_remove', { oc: progressOrder.oc_number });
  };

  const addProgressNote = async () => {
    if (!progressOrder) return;
    const text = progressDraft.text.trim();
    if (!text) { toast.error('Escreva uma observação ou item'); return; }
    setProgressSaving(true);
    const note: ProgressNote = {
      id: (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`,
      ts: new Date().toISOString(),
      author: authorLabel,
      kind: progressDraft.kind,
      text,
    };
    const next = [...currentProgressList, note];
    const { error } = await (supabase.from as any)('maintenance_orders')
      .update({ progress_notes: next })
      .eq('id', progressOrder.id);
    setProgressSaving(false);
    if (error) { toast.error('Erro ao salvar'); return; }
    // atualiza estado local
    setOrders(prev => prev.map(o => o.id === progressOrder.id ? { ...o, progress_notes: next } : o));
    setProgressDraft({ kind: progressDraft.kind, text: '' });
    toast.success('Registrado');
    const isCorrNote = progressOrder.type === 'manutencao_corretiva';
    logAction(
      isCorrNote ? 'oc_progress_note_add' : 'om_progress_note_add',
      isCorrNote
        ? { oc: progressOrder.oc_number, kind: note.kind }
        : { om: progressOrder.om_number, kind: note.kind },
    );
  };

  const removeProgressNote = async (noteId: string) => {
    if (!progressOrder) return;
    const next = currentProgressList.filter(n => n.id !== noteId);
    const { error } = await (supabase.from as any)('maintenance_orders')
      .update({ progress_notes: next })
      .eq('id', progressOrder.id);
    if (error) { toast.error('Erro ao remover'); return; }
    setOrders(prev => prev.map(o => o.id === progressOrder.id ? { ...o, progress_notes: next } : o));
    const isCorrRm = progressOrder.type === 'manutencao_corretiva';
    logAction(
      isCorrRm ? 'oc_progress_note_remove' : 'om_progress_note_remove',
      isCorrRm ? { oc: progressOrder.oc_number } : { om: progressOrder.om_number },
    );
  };

  // ============ PDF RELATÓRIO (finalizada) ============
  const downloadReport = async (o: MaintenanceOrder) => {
    try {
      const its = itemsByOrder[o.id] || [];
      const machine = machineById[o.machine_id];
      await generateOmReportPdf({
        order: o, items: its, machine, needles, sinkers, cylinders,
        companyId, authorLabel, renderAuthor,
      });
      logAction('om_report_download', { om: o.om_number });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar relatório');
    }
  };

  const deleteOrder = async (o: MaintenanceOrder) => {
    if (!canManageOrder(o)) { toast.error('Sem permissão para excluir esta ordem'); return; }
    const label = o.type === 'manutencao_corretiva' ? 'OC' : 'OM';
    if (o.status === 'finalizada' && !isAdmin) {
      toast.error(`Apenas administradores podem excluir ${label}s finalizadas.`);
      return;
    }
    if (o.status === 'em_curso') {
      toast.error(`Não é possível excluir uma ${label} em curso. Finalize ou cancele primeiro.`);
      return;
    }
    await (supabase.from as any)('maintenance_order_items').delete().eq('order_id', o.id);
    await (supabase.from as any)('maintenance_orders').delete().eq('id', o.id);
    toast.success(`${label} excluída`);
    logAction(
      o.type === 'manutencao_corretiva' ? 'oc_delete' : 'om_delete',
      o.type === 'manutencao_corretiva' ? { oc: o.oc_number } : { om: o.om_number },
    );
    await load();
  };

  // Filtra por modo (OM = não-corretivas; OC = apenas corretivas)
  const modeOrders = useMemo(
    () => orders.filter(o => (isOC ? o.type === 'manutencao_corretiva' : o.type !== 'manutencao_corretiva')),
    [orders, isOC],
  );
  const filtered = useMemo(() => modeOrders.filter(o => o.status === tab), [modeOrders, tab]);
  const counts = useMemo(() => ({
    aberto: modeOrders.filter(o => o.status === 'aberto').length,
    em_curso: modeOrders.filter(o => o.status === 'em_curso').length,
    finalizada: modeOrders.filter(o => o.status === 'finalizada').length,
    cancelada: modeOrders.filter(o => o.status === 'cancelada').length,
  }), [modeOrders]);

  // Urgência de manutenção por máquina (mesma lógica do Calendário)
  const urgencyByMachine = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const map = new Map<string, { daysLeft: number | null; kgLeft: number | null; kgTarget: number | null; intervalDays: number }>();
    for (const m of machines) {
      const prev = machineLogs
        .filter((l: any) => l.machine_id === m.id && (l.status === 'manutencao_preventiva' || l.status === 'troca_agulhas'))
        .sort((a: any, b: any) => new Date(b.ended_at || b.started_at).getTime() - new Date(a.ended_at || a.started_at).getTime());
      const last = prev[0] || null;
      const lastDate = last ? new Date((last as any).ended_at || (last as any).started_at) : null;
      const intervalDays = (m as any).maintenance_interval_days && (m as any).maintenance_interval_days > 0
        ? (m as any).maintenance_interval_days
        : DEFAULT_MAINTENANCE_INTERVAL_DAYS;
      const nextDate = lastDate ? new Date(lastDate.getTime() + intervalDays * 86400000) : null;
      const daysLeft = nextDate ? Math.ceil((nextDate.getTime() - today.getTime()) / 86400000) : null;
      const fromDateStr = lastDate
        ? `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`
        : null;
      const kgTarget = (m as any).maintenance_kg_target && (m as any).maintenance_kg_target > 0 ? (m as any).maintenance_kg_target : null;
      // Sem histórico de preventiva → kg restantes é desconhecido (evita inflar com produção acumulada de sempre)
      const kgSince = fromDateStr
        ? productions
            .filter((p: any) => p.machine_id === m.id && String(p.date) >= fromDateStr)
            .reduce((s: number, p: any) => s + (Number(p.weight_kg) || 0), 0)
        : null;
      const kgLeft = kgTarget != null && kgSince != null ? kgTarget - kgSince : null;
      map.set(m.id, { daysLeft, kgLeft, kgTarget, intervalDays });
    }
    return map;
  }, [machines, machineLogs, productions]);

  const daysBadgeClass = (d: number | null) => {
    if (d == null) return 'bg-muted text-muted-foreground border-muted-foreground/30';
    if (d <= 0) return 'bg-destructive text-destructive-foreground border-destructive';
    if (d <= 3) return 'bg-destructive/20 text-destructive border-destructive/40';
    if (d <= 7) return 'bg-warning/25 text-warning-foreground border-warning/40';
    return 'bg-success/20 text-success-foreground border-success/40';
  };
  const daysLabel = (d: number | null) => {
    if (d == null) return 'Sem histórico';
    if (d <= 0) return `Vencida (${Math.abs(d)}d)`;
    if (d === 1) return '1 dia';
    return `${d} dias`;
  };
  const kgBadgeClass = (kgLeft: number | null, kgTarget: number | null) => {
    if (kgTarget == null || kgLeft == null) return 'bg-muted text-muted-foreground border-muted-foreground/30';
    if (kgLeft <= 0) return 'bg-destructive text-destructive-foreground border-destructive';
    if (kgLeft <= kgTarget * 0.1) return 'bg-warning/25 text-warning-foreground border-warning/40';
    return 'bg-success/20 text-success-foreground border-success/40';
  };
  const kgLabel = (kgLeft: number | null, kgTarget: number | null) => {
    if (kgTarget == null) return 'Sem meta';
    if (kgLeft == null) return 'Sem histórico';
    const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    if (kgLeft <= 0) return `Atingido (${fmt(Math.abs(kgLeft))} kg acima)`;
    return `${fmt(kgLeft)} kg restantes`;
  };

  // Ordena a lista de Aberto por urgência (mais urgente primeiro)
  const displayed = useMemo(() => {
    if (tab !== 'aberto') return filtered;
    // OC não segue meta preventiva — ordena por Prioritária primeiro, depois mais recente.
    if (isOC) {
      return [...filtered].sort((a, b) => {
        const pa = a.priority === 'prioritaria' ? 0 : 1;
        const pb = b.priority === 'prioritaria' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    const score = (o: MaintenanceOrder) => {
      const u = urgencyByMachine.get(o.machine_id);
      if (!u) return Number.POSITIVE_INFINITY;
      const dScore = u.daysLeft ?? Number.POSITIVE_INFINITY;
      const kScore = u.kgTarget != null && u.kgLeft != null ? (u.kgLeft / u.kgTarget) * 30 : Number.POSITIVE_INFINITY;
      return Math.min(dScore, kScore);
    };
    return [...filtered].sort((a, b) => score(a) - score(b));
  }, [filtered, tab, urgencyByMachine, isOC]);

  const itemsByOrder = useMemo(() => {
    const m: Record<string, MaintenanceOrderItem[]> = {};
    items.forEach(it => { (m[it.order_id] ||= []).push(it); });
    return m;
  }, [items]);

  // Busca + paginação para aba "Finalizadas"
  const finalizedFiltered = useMemo(() => {
    if (tab !== 'finalizada') return displayed;
    const q = finalizedSearch.trim().toLowerCase();
    if (!q) return displayed;
    return displayed.filter(o => {
      const num = displayNumber(o).toLowerCase();
      const machineName = (machineById[o.machine_id]?.name || '').toLowerCase();
      const desc = (o.description || '').toLowerCase();
      return num.includes(q) || machineName.includes(q) || desc.includes(q);
    });
  }, [displayed, tab, finalizedSearch, machineById]);

  const finalizedTotal = finalizedFiltered.length;
  const finalizedTotalPages = Math.max(1, Math.ceil(finalizedTotal / FINALIZED_PAGE_SIZE));
  const finalizedPageSafe = Math.min(finalizedPage, finalizedTotalPages - 1);
  const pagedFinalized = useMemo(() => {
    if (tab !== 'finalizada') return displayed;
    const start = finalizedPageSafe * FINALIZED_PAGE_SIZE;
    return finalizedFiltered.slice(start, start + FINALIZED_PAGE_SIZE);
  }, [tab, displayed, finalizedFiltered, finalizedPageSafe]);

  useEffect(() => { setFinalizedPage(0); }, [finalizedSearch, tab, mode]);

  const listToRender = tab === 'finalizada' ? pagedFinalized : displayed;

  if (loading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando {labelShort}s…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {isOC ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Wrench className="h-5 w-5" />}
            {labelLong}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isOC
              ? 'Ordem de Corretiva — máquina apresentou problema. Admin/líder criam; mecânico e líder de mecânica iniciam e finalizam.'
              : 'Fluxo Aberto → Em curso → Finalizada. Criada por admin/líder mecânica; mecânico inicia e finaliza.'}
          </p>
        </div>
        {canCreateInThisMode && (
          isOC ? (
            <Button
              onClick={openCreateCorrective}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <AlertTriangle className="h-4 w-4 mr-1" /> Nova OC
            </Button>
          ) : (
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nova OM</Button>
          )
        )}
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as MaintenanceOrderStatus)}>
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/50 gap-1 w-full lg:w-fit">
          <TabsTrigger
            value="aberto"
            className={cn(
              'gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial',
              counts.aberto > 0 && 'data-[state=active]:bg-amber-500 data-[state=active]:text-white'
            )}
          >
            <AlertTriangle className="h-3 w-3" /> Aberto
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{counts.aberto}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="em_curso"
            className={cn(
              'gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial',
              counts.em_curso > 0 && 'data-[state=active]:bg-blue-600 data-[state=active]:text-white',
              counts.em_curso > 0 && 'animate-pulse'
            )}
          >
            <Clock className="h-3 w-3" /> Em Curso
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{counts.em_curso}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="finalizada"
            className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Square className="h-3 w-3" /> Finalizadas
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{counts.finalizada}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="cancelada"
            className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-muted-foreground data-[state=active]:text-background"
          >
            <X className="h-3 w-3" /> Canceladas
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{counts.cancelada}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {tab === 'finalizada' && (
            <div className="mb-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={finalizedSearch}
                onChange={e => setFinalizedSearch(e.target.value)}
                placeholder={`Buscar ${labelShort} finalizada por número, máquina ou descrição…`}
                className="pl-9"
              />
            </div>
          )}
          {listToRender.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">Nenhuma {labelShort} nessa lista.</div>
          ) : (
            <div className="space-y-3">
              {listToRender.map(o => {
                const m = machineById[o.machine_id];
                const its = itemsByOrder[o.id] || [];
                const style = STATUS_STYLE[o.status];
                const u = o.status === 'aberto' ? urgencyByMachine.get(o.machine_id) : null;
                return (
                  <Card
                    key={o.id}
                    className="relative overflow-hidden border bg-card hover:shadow-md transition-shadow"
                  >
                    {/* Faixa lateral de status */}
                    <div className={cn('absolute left-0 top-0 bottom-0 w-1.5', style.stripe)} />
                    <CardContent className="p-4 pl-5">
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        {/* Coluna principal */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Linha 1: Status + OM# + Tipo + Prioridade */}
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn(style.badgeClass, 'font-bold text-[10px] tracking-wide uppercase px-2 py-0.5')}>
                              {style.label}
                            </Badge>
                            <span className={cn('font-bold text-lg', o.type === 'manutencao_corretiva' ? 'text-destructive' : 'text-foreground')}>{labelOf(o)} #{displayNumber(o)}</span>
                            <Badge variant="outline" className={cn('font-semibold uppercase text-[10px]', TYPE_COLORS[o.type])}>
                              {TYPE_LABELS[o.type]}
                            </Badge>
                            {o.type === 'manutencao_corretiva' && o.status === 'aberto' ? (
                              o.priority === 'prioritaria' ? (
                                <Badge variant="destructive" className="animate-pulse gap-1 text-[10px] font-bold">
                                  <AlertTriangle className="h-3 w-3" /> MÁQUINA PARADA
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 text-white border-emerald-700 gap-1 text-[10px] font-bold">
                                  <Play className="h-3 w-3" /> EM OPERAÇÃO
                                </Badge>
                              )
                            ) : o.priority === 'prioritaria' && o.status === 'aberto' && (
                              <Badge variant="destructive" className="animate-pulse gap-1 text-[10px]">
                                <AlertTriangle className="h-3 w-3" /> PRIORITÁRIA
                              </Badge>
                            )}
                            {o.status === 'aberto' && (
                              <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">
                                <Clock className="h-3 w-3" /> Aguardando início <LiveTimer startedAt={o.created_at} />
                              </Badge>
                            )}
                            {o.status === 'em_curso' && o.started_at && (
                              <Badge className="bg-blue-600 text-white border-blue-700 gap-1 text-[10px] px-2 py-0.5">
                                <Clock className="h-3 w-3" /> <LiveTimer startedAt={o.started_at} />
                              </Badge>
                            )}
                          </div>

                          {/* Linha 2: Máquina em destaque */}
                          <div className="text-base font-semibold text-foreground">
                            {m?.name || '—'}
                          </div>

                          {/* Urgência de manutenção (Aberto) — puxada do Calendário por máquina.
                              Não exibida para OC (corretiva não segue meta preventiva). */}
                          {u && o.type !== 'manutencao_corretiva' && (
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Dias p/ próxima</span>
                                <Badge variant="outline" className={cn('text-[10px] font-bold px-2 py-0.5', daysBadgeClass(u.daysLeft))}>
                                  {daysLabel(u.daysLeft)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Kg restantes</span>
                                <Badge variant="outline" className={cn('text-[10px] font-bold px-2 py-0.5 tabular-nums', kgBadgeClass(u.kgLeft, u.kgTarget))}>
                                  {kgLabel(u.kgLeft, u.kgTarget)}
                                </Badge>
                              </div>
                            </div>
                          )}

                          {/* Descrição do problema — destacada em OC */}
                          {o.description && (
                            o.type === 'manutencao_corretiva' ? (
                              <div className="rounded-md border-2 border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2 mt-1">
                                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold uppercase text-[10px] tracking-wide text-destructive">Descrição do problema</div>
                                  <div className="mt-1 text-sm text-foreground font-medium whitespace-pre-wrap break-words">{o.description}</div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground line-clamp-2">{o.description}</p>
                            )
                          )}

                          {/* Motivo do cancelamento */}
                          {o.status === 'cancelada' && o.cancellation_reason && (
                            <div className="rounded-md border border-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 p-2 flex items-start gap-2">
                              <X className="h-4 w-4 text-zinc-700 dark:text-zinc-300 mt-0.5 shrink-0" />
                              <div className="text-xs text-zinc-900 dark:text-zinc-100">
                                <div className="font-bold uppercase text-[10px] tracking-wide">Motivo do cancelamento</div>
                                <div className="mt-0.5">{o.cancellation_reason}</div>
                              </div>
                            </div>
                          )}

                          {/* Grid de dados técnicos */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Início</div>
                              <div className="text-foreground font-medium tabular-nums">
                                {o.started_at ? format(new Date(o.started_at), 'dd/MM HH:mm') : '—'}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Fim</div>
                              <div className="text-foreground font-medium tabular-nums">
                                {o.finished_at ? format(new Date(o.finished_at), 'dd/MM HH:mm') : '—'}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Duração</div>
                              <div className="text-foreground font-medium tabular-nums">
                                {o.status === 'finalizada' ? fmtDuration(o.duration_seconds || 0) : '—'}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Itens Trocados</div>
                              <div className="text-foreground font-medium">
                                {its.length > 0 ? `${its.length} item(s)` : '—'}
                              </div>
                            </div>
                          </div>

                          {/* Itens trocados detalhado (apenas finalizada) */}
                          {o.status === 'finalizada' && its.length > 0 && (
                            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                              <div className="font-semibold text-[10px] uppercase text-emerald-700 dark:text-emerald-400 tracking-wide mb-1">Itens trocados</div>
                              <ul className="text-xs space-y-0.5">
                                {its.map(it => (
                                  <li key={it.id} className="text-foreground">
                                    <span className="font-semibold">{it.quantity}×</span> {it.item_type}
                                    {it.needle_id ? ` — agulha ${needles.find(n => n.id === it.needle_id)?.reference_code || ''}` :
                                      it.sinker_id ? ` — platina ${sinkers.find(s => s.id === it.sinker_id)?.reference_code || ''}` :
                                      it.cylinder_id ? ` — cilindro ${cylinders.find(c => c.id === it.cylinder_id)?.brand || ''}` :
                                      it.description ? ` — ${it.description}` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Coluna ações + auditoria */}
                        <div className="flex flex-col items-stretch xl:items-end gap-2 xl:min-w-[240px]">
                          <div className="text-[10px] text-muted-foreground leading-tight xl:text-right">
                            <div><span className="font-semibold">Criada:</span> {renderAuthor(o.created_by_name, o.created_by_id)}</div>
                            <div>{format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')}</div>
                            {o.started_by_name && (
                              <div className="mt-0.5"><span className="font-semibold">Iniciada:</span> {renderAuthor(o.started_by_name, o.started_by_id)}</div>
                            )}
                            {o.finished_by_name && (
                              <div className="mt-0.5"><span className="font-semibold">Finalizada:</span> {renderAuthor(o.finished_by_name, o.finished_by_id)}</div>
                            )}
                            {o.cancelled_by_name && (
                              <div className="mt-0.5"><span className="font-semibold">Cancelada:</span> {renderAuthor(o.cancelled_by_name, o.cancelled_by_id)}</div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            {o.status === 'aberto' && canExecuteOrder(o) && (
                              <Button size="sm" onClick={() => setConfirmStart(o)} className="gap-1.5">
                                <Play className="h-3.5 w-3.5" /> Iniciar
                              </Button>
                            )}
                            {o.status === 'aberto' && canManageOrder(o) && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openEdit(o)} className="gap-1.5">
                                  <Pencil className="h-3.5 w-3.5" /> Editar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setCancelReason(''); setConfirmCancel(o); }} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
                                  <X className="h-3.5 w-3.5" /> Cancelar
                                </Button>
                              </>
                            )}
                            {o.status === 'em_curso' && canViewProgressNotes(o) && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openProgress(o)} className="gap-1.5 border-blue-500/40 text-blue-600 hover:bg-blue-500/10">
                                  <StickyNote className="h-3.5 w-3.5" /> Notas/Itens
                                  {Array.isArray(o.progress_notes) && o.progress_notes.length > 0 && (
                                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{o.progress_notes.length}</Badge>
                                  )}
                                </Button>
                                {canExecuteOrder(o) && (
                                  <Button size="sm" onClick={() => openFinish(o)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <Square className="h-3.5 w-3.5" /> Finalizar
                                  </Button>
                                )}
                              </>
                            )}
                            {o.status === 'finalizada' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setViewOrder(o)} className="gap-1.5 border-blue-500/40 text-blue-600 hover:bg-blue-500/10">
                                  <Eye className="h-3.5 w-3.5" /> Ver Relatório
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => downloadReport(o)} className="gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10">
                                  <Download className="h-3.5 w-3.5" /> Baixar Relatório
                                </Button>
                              </>
                            )}
                            {canManageOrder(o) && o.status === 'cancelada' && (
                              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(o)} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
                                <Trash2 className="h-3.5 w-3.5" /> Excluir
                              </Button>
                            )}
                            {isAdmin && o.status === 'finalizada' && (
                              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(o)} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
                                <Trash2 className="h-3.5 w-3.5" /> Excluir
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {tab === 'finalizada' && finalizedTotal > FINALIZED_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Mostrando {finalizedPageSafe * FINALIZED_PAGE_SIZE + 1}
                –{Math.min(finalizedTotal, (finalizedPageSafe + 1) * FINALIZED_PAGE_SIZE)} de {finalizedTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFinalizedPage(p => Math.max(0, p - 1))}
                  disabled={finalizedPageSafe === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <span className="text-xs font-medium">
                  <span className="px-2 py-1 bg-primary text-primary-foreground rounded-md">{finalizedPageSafe + 1}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  {finalizedTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFinalizedPage(p => Math.min(finalizedTotalPages - 1, p + 1))}
                  disabled={finalizedPageSafe >= finalizedTotalPages - 1}
                >
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Modal */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) clearCreatePhotoDrafts(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Editar ${labelOf(editing)} #${displayNumber(editing)}`
                : correctiveMode ? 'Nova OC — Ordem de Corretiva' : 'Nova OM'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {correctiveMode && !editing && (
              <div className="rounded border border-destructive/30 bg-destructive/10 text-destructive text-xs p-2 flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Ordem de Corretiva — quando a máquina apresenta um problema. Fica disponível para mecânicos/líder de mecânica iniciarem.</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Máquina *</Label>
              <SearchableSelect
                value={form.machine_id}
                onValueChange={v => setForm(p => ({ ...p, machine_id: v }))}
                placeholder="Selecione a máquina"
                searchPlaceholder="Buscar máquina..."
                options={machines.map(m => ({ value: m.id, label: m.name }))}
                autoFocusSearch={false}
                className="max-h-[50vh]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={form.type}
                  onValueChange={v => setForm(p => ({ ...p, type: v as MaintenanceOrderType }))}
                  disabled={correctiveMode}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {correctiveMode
                      ? <SelectItem value="manutencao_corretiva">Manutenção Corretiva</SelectItem>
                      : Object.entries(OM_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as MaintenanceOrderPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {correctiveMode ? (
                      <>
                        <SelectItem value="normal">Em operação</SelectItem>
                        <SelectItem value="prioritaria">Máquina parada</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="prioritaria">Prioritária</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{correctiveMode ? 'Descrição do problema' : 'Descrição / serviço'}</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder={correctiveMode ? 'Descreva o problema apresentado pela máquina' : 'O que precisa ser feito'}
              />
            </div>
            {correctiveMode && !editing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5" />
                    Fotos do problema (opcional)
                  </Label>
                  <span className="text-[10px] text-muted-foreground">{createPhotoDrafts.length}/2</span>
                </div>
                {createPhotoDrafts.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {createPhotoDrafts.map(d => (
                      <div key={d.id} className="border rounded overflow-hidden bg-muted/30 relative">
                        <img src={d.preview} alt="preview" className="w-full h-28 object-cover" />
                        <button
                          type="button"
                          onClick={() => removeCreatePhotoDraft(d.id)}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 shadow"
                          aria-label="Remover foto"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <Textarea
                          rows={2}
                          value={d.description}
                          onChange={e => updateCreatePhotoDesc(d.id, e.target.value)}
                          placeholder="Descrição (opcional)"
                          className="text-xs rounded-none border-0 border-t focus-visible:ring-0"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {createPhotoDrafts.length < 2 && (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-md p-3 cursor-pointer text-xs text-muted-foreground hover:bg-muted/40 transition">
                    <ImageIcon className="h-4 w-4" />
                    <span>Adicionar foto ({createPhotoDrafts.length === 0 ? 'até 2' : 'mais 1'})</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        addCreatePhotoDraft(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); clearCreatePhotoDrafts(); }} disabled={savingOrder}>Cancelar</Button>
            <Button onClick={saveOrder} disabled={savingOrder}>
              {savingOrder && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editing ? 'Salvar' : correctiveMode ? 'Criar OC' : 'Criar OM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finish Modal */}
      <Dialog open={!!finishOrder} onOpenChange={v => !v && setFinishOrder(null)}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none p-0 flex flex-col sm:rounded-none [&>button.absolute]:hidden">
          <DialogHeader className="p-4 border-b flex flex-row items-center justify-between sm:justify-between space-y-0 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-5 w-5 text-emerald-600" />
              Finalizar {finishOrder ? labelOf(finishOrder) : 'OM'} #{finishOrder ? displayNumber(finishOrder) : ''}
              {finishOrder && (
                <Badge variant="outline" className="ml-2">{TYPE_LABELS[finishOrder.type]} · {machineById[finishOrder.machine_id]?.name || ''}</Badge>
              )}
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={() => setFinishOrder(null)}>Fechar</Button>
          </DialogHeader>
          {finishOrder && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl w-full mx-auto">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Início</div><div className="font-medium">{finishOrder.started_at ? format(new Date(finishOrder.started_at), 'dd/MM/yyyy HH:mm:ss') : '—'}</div></div>
                <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Fim (agora)</div><div className="font-medium">{format(new Date(), 'dd/MM/yyyy HH:mm:ss')}</div></div>
                <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Tempo total</div><div className="font-medium text-emerald-600"><LiveTimer startedAt={finishOrder.started_at} /></div></div>
              </div>

              {/* Anotações já registradas em curso (readonly aqui) */}
              {Array.isArray(finishOrder.progress_notes) && finishOrder.progress_notes.length > 0 && (
                <div className="border rounded p-3 bg-muted/30">
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Anotações registradas em curso ({finishOrder.progress_notes.length})</div>
                  <ul className="space-y-1 text-xs max-h-40 overflow-y-auto">
                    {(finishOrder.progress_notes as ProgressNote[]).map(n => (
                      <li key={n.id} className="flex gap-2 items-start">
                        <Badge variant="outline" className="text-[9px] shrink-0">{n.kind === 'item' ? 'ITEM' : 'OBS'}</Badge>
                        <span className="flex-1">{n.text}</span>
                        <span className="text-muted-foreground shrink-0">{format(new Date(n.ts), 'dd/MM HH:mm')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Itens trocados</Label>
                  <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item</Button>
                </div>
                {finishItems.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item — pode finalizar sem trocar peças.</p>}
                <div className="space-y-2">
                  {finishItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end border rounded p-2">
                      <div className="col-span-1 md:col-span-3 space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select value={it.item_type} onValueChange={v => updateItem(idx, { item_type: v as MaintenanceOrderItemType, ref_id: '' })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agulha">Agulha</SelectItem>
                            <SelectItem value="platina">Platina</SelectItem>
                            <SelectItem value="cilindro">Cilindro</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 md:col-span-6 space-y-1 order-last md:order-none">
                        <Label className="text-xs">Referência</Label>
                        {it.item_type === 'outro' ? (
                          <Input value={it.description} onChange={e => updateItem(idx, { description: e.target.value })} placeholder="Descreva o item" />
                        ) : (
                          <SearchableSelect
                            value={it.ref_id}
                            onValueChange={v => updateItem(idx, { ref_id: v })}
                            placeholder="Selecionar"
                            searchPlaceholder="Buscar..."
                            options={
                              it.item_type === 'agulha' ? needles.map(n => ({ value: n.id, label: `${n.brand} · ${n.reference_code}` })) :
                              it.item_type === 'platina' ? sinkers.map(s => ({ value: s.id, label: `${s.brand} · ${s.reference_code}` })) :
                              cylinders.map(c => ({ value: c.id, label: `${c.brand} ${c.model || ''}`.trim() }))
                            }
                          />
                        )}
                      </div>
                      <div className="col-span-1 md:col-span-2 space-y-1">
                        <Label className="text-xs">Qtd</Label>
                        <Input type="number" inputMode="numeric" min={1} value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="col-span-2 md:col-span-1 flex md:block justify-end">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <Label className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Observações finais</Label>
                <p className="text-xs text-muted-foreground">Registre aqui um resumo final: itens trocados que não estão na lista acima, observações do serviço, causa raiz, recomendações etc. Este texto fica salvo na OM e aparece no relatório em PDF.</p>
                <Textarea rows={8} value={finishNotes} onChange={e => setFinishNotes(e.target.value)} placeholder="Ex.: Realizada troca completa de agulhas. Verificada folga no cilindro — recomenda-se preventiva em 30 dias..." />
              </div>
            </div>
          )}
          <div className="border-t p-4 flex justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={() => setFinishOrder(null)}>Fechar</Button>
            <Button onClick={() => setConfirmFinishGate(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              <Square className="h-4 w-4" /> Confirmar finalização
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Notes Modal (Em Curso) */}
      <Dialog open={!!progressOrder} onOpenChange={v => !v && setProgressOrder(null)}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none p-0 flex flex-col sm:rounded-none [&>button.absolute]:hidden">
          <DialogHeader className="p-4 border-b space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <StickyNote className="h-5 w-5 text-blue-600 shrink-0" />
                <span>Notas & Itens — {progressOrder ? labelOf(progressOrder) : 'OM'} #{progressOrder ? displayNumber(progressOrder) : ''}</span>
              </DialogTitle>
              <Button variant="outline" size="sm" onClick={() => setProgressOrder(null)}>Fechar</Button>
            </div>
            {progressOrder && (
              <div className="text-sm text-muted-foreground">
                {machineById[progressOrder.machine_id]?.name || ''}
              </div>
            )}
          </DialogHeader>
          {progressOrder && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl w-full mx-auto space-y-5">
              <div className="rounded-md border-l-4 border-blue-500 bg-blue-500/5 p-3 text-sm">
                <div className="font-semibold text-foreground">Relatório temporário</div>
                <div className="text-xs text-muted-foreground mt-0.5">Cada anotação é salva na OM imediatamente. Feche o modal quando quiser — nada se perde. Estas anotações também entram no relatório em PDF ao finalizar a OM.</div>
              </div>

              {/* Adicionar (somente quem executa a ordem) */}
              {canExecuteOrder(progressOrder) ? (
              <div className="border rounded-lg p-4 space-y-3 bg-card">
                <Label className="font-semibold">Nova anotação</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={progressDraft.kind === 'observacao' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setProgressDraft(p => ({ ...p, kind: 'observacao' }))}
                    className="gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" /> Observação
                  </Button>
                  <Button
                    type="button"
                    variant={progressDraft.kind === 'item' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setProgressDraft(p => ({ ...p, kind: 'item' }))}
                    className="gap-1.5"
                  >
                    <Wrench className="h-3.5 w-3.5" /> Item trocado
                  </Button>
                </div>
                <Textarea
                  rows={5}
                  value={progressDraft.text}
                  onChange={e => setProgressDraft(p => ({ ...p, text: e.target.value }))}
                  placeholder={progressDraft.kind === 'item'
                    ? 'Ex.: Troquei 24 agulhas ref. 100 na cabeça 3'
                    : 'Ex.: Cilindro apresentando folga leve, verificar próxima preventiva'}
                />
                <div className="flex justify-end">
                  <Button onClick={addProgressNote} disabled={progressSaving} className="gap-1.5">
                    {progressSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Salvar anotação
                  </Button>
                </div>
              </div>
              ) : (
                <div className="rounded-md border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
                  Visualização somente leitura. Apenas mecânico ou líder de mecânica podem registrar/remover anotações desta ordem.
                </div>
              )}

              {/* Fotos do problema (somente OC) */}
              {progressOrder.type === 'manutencao_corretiva' && (
                <div className="border rounded-lg p-4 space-y-3 bg-card">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="font-semibold flex items-center gap-2">
                      <Camera className="h-4 w-4 text-blue-600" /> Fotos do problema
                      <Badge variant="outline" className="text-[10px]">{currentPhotos.length}/2</Badge>
                    </Label>
                    <span className="text-[11px] text-muted-foreground">Até 2 fotos com descrição. Aparecem no relatório final.</span>
                  </div>

                  {/* Grid das fotos já enviadas */}
                  {currentPhotos.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentPhotos.map(p => (
                        <div key={p.id} className="relative border rounded-md overflow-hidden bg-muted/40 group">
                          {photoSignedUrls[p.path] ? (
                            <img src={photoSignedUrls[p.path]} alt={p.description} className="w-full h-40 object-cover" />
                          ) : (
                            <div className="w-full h-40 flex items-center justify-center text-muted-foreground text-xs">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
                            </div>
                          )}
                          <div className="p-2 text-xs">
                            <div className="whitespace-pre-wrap break-words">{p.description}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {format(new Date(p.ts), 'dd/MM/yyyy HH:mm')} · {p.author || '—'}
                            </div>
                          </div>
                          {canExecuteOrder(progressOrder) && (
                            <Button size="icon" variant="destructive" onClick={() => removePhoto(p)}
                              className="absolute top-1 right-1 h-7 w-7 opacity-90">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formulário de upload */}
                  {canExecuteOrder(progressOrder) && currentPhotos.length < 2 && (
                    <div className="border-t pt-3 space-y-2">
                      {photoDraftPreview ? (
                        <div className="flex flex-col sm:flex-row gap-3">
                          <img src={photoDraftPreview} alt="preview" className="w-full sm:w-48 h-40 object-cover rounded-md border" />
                          <div className="flex-1 space-y-2">
                            <Label className="text-xs">Descrição da foto *</Label>
                            <Textarea rows={4} value={photoDraftDesc} onChange={e => setPhotoDraftDesc(e.target.value)}
                              placeholder="Ex.: Agulha quebrada na cabeça 3, causou furos no tecido" />
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="outline" onClick={resetPhotoDraft} disabled={photoUploading}>
                                <X className="h-3.5 w-3.5 mr-1" /> Descartar
                              </Button>
                              <Button size="sm" onClick={uploadPhoto} disabled={photoUploading || !photoDraftDesc.trim()}>
                                {photoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                                Salvar foto
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex">
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              onChange={e => onPickPhoto(e.target.files?.[0] || null)} />
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-sm px-3 py-2 cursor-pointer hover:bg-blue-700">
                              <Camera className="h-4 w-4" /> Tirar foto
                            </span>
                          </label>
                          <label className="inline-flex">
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => onPickPhoto(e.target.files?.[0] || null)} />
                            <span className="inline-flex items-center gap-1.5 rounded-md border text-sm px-3 py-2 cursor-pointer hover:bg-muted">
                              <ImageIcon className="h-4 w-4" /> Escolher da galeria
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Lista */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Anotações registradas ({currentProgressList.length})</Label>
                </div>
                {currentProgressList.length === 0 ? (
                  <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
                    Nenhuma anotação ainda. Registre acima o que for feito ou observado durante a manutenção.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...currentProgressList].reverse().map(n => (
                      <div key={n.id} className={cn(
                        'border rounded-lg p-3 flex gap-3 items-start',
                        n.kind === 'item' ? 'border-l-4 border-l-amber-500 bg-amber-500/5' : 'border-l-4 border-l-blue-500 bg-blue-500/5'
                      )}>
                        <Badge variant="outline" className={cn(
                          'shrink-0 uppercase text-[10px]',
                          n.kind === 'item' ? 'border-amber-500 text-amber-700 dark:text-amber-400' : 'border-blue-500 text-blue-700 dark:text-blue-400'
                        )}>
                          {n.kind === 'item' ? 'Item' : 'Obs'}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm whitespace-pre-wrap break-words">{n.text}</div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {format(new Date(n.ts), 'dd/MM/yyyy HH:mm')} · {n.author || '—'}
                          </div>
                        </div>
                        {canExecuteOrder(progressOrder) && (
                          <Button size="icon" variant="ghost" onClick={() => removeProgressNote(n.id)} className="shrink-0 h-8 w-8">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="border-t p-4 flex justify-end shrink-0">
            <Button variant="outline" onClick={() => setProgressOrder(null)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm: Start */}
      <Dialog open={!!confirmStart} onOpenChange={v => !v && setConfirmStart(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Iniciar {confirmStart ? labelOf(confirmStart) : 'OM'}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Iniciar a {confirmStart ? labelOf(confirmStart) : 'OM'} #{confirmStart ? displayNumber(confirmStart) : ''} parará a máquina e começará o cronômetro.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStart(null)}>Cancelar</Button>
            <Button onClick={async () => { const o = confirmStart!; setConfirmStart(null); await startOrder(o); }}>Iniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Cancel */}
      <Dialog open={!!confirmCancel} onOpenChange={v => !v && setConfirmCancel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancelar {confirmCancel ? labelOf(confirmCancel) : 'OM'}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Cancelar a {confirmCancel ? labelOf(confirmCancel) : 'OM'} #{confirmCancel ? displayNumber(confirmCancel) : ''}? Esta ação não pode ser desfeita.
          </p>
          <Textarea rows={2} placeholder="Motivo do cancelamento (opcional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(null)}>Voltar</Button>
            <Button variant="destructive" onClick={async () => { const o = confirmCancel!; const r = cancelReason || null; setConfirmCancel(null); await cancelOrder(o, r); }}>Cancelar {confirmCancel ? labelOf(confirmCancel) : 'OM'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Delete */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Excluir {confirmDelete ? labelOf(confirmDelete) : 'OM'}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir definitivamente a {confirmDelete ? labelOf(confirmDelete) : 'OM'} #{confirmDelete ? displayNumber(confirmDelete) : ''} e seus itens?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Voltar</Button>
            <Button variant="destructive" onClick={async () => { const o = confirmDelete!; setConfirmDelete(null); await deleteOrder(o); }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Finish */}
      <Dialog open={confirmFinishGate} onOpenChange={setConfirmFinishGate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar finalização?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            A máquina voltará a "Ativa", o histórico será fechado e os itens trocados aplicados (referências em uso e estoque).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinishGate(false)} disabled={finishing}>Voltar</Button>
            <Button
              disabled={finishing}
              onClick={async () => { setConfirmFinishGate(false); await confirmFinish(); }}
            >
              {finishing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Report Modal (finalizada) */}
      <Dialog open={!!viewOrder} onOpenChange={v => !v && setViewOrder(null)}>
        <DialogContent className="max-w-[80vw] w-[80vw] max-h-[80vh] overflow-y-auto sm:max-w-[80vw]">
          {viewOrder && (() => {
            const o = orders.find(x => x.id === viewOrder.id) || viewOrder;
            const m = machineById[o.machine_id];
            const its = itemsByOrder[o.id] || [];
            const notes: ProgressNote[] = Array.isArray(o.progress_notes) ? (o.progress_notes as ProgressNote[]) : [];
            const photos: OCPhoto[] = Array.isArray((o as any).oc_photos) ? ((o as any).oc_photos as OCPhoto[]) : [];
            const isCorr = o.type === 'manutencao_corretiva';
            const label = isCorr ? 'OC' : 'OM';
            const num = isCorr ? ((o as any).oc_number ?? o.om_number) : o.om_number;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-5 w-5" />
                    Relatório {label} #{num != null ? String(num).padStart(3, '0') : '—'}
                    <Badge className={cn('ml-1', TYPE_COLORS[o.type])} variant="outline">{TYPE_LABELS[o.type]}</Badge>
                    <Badge className={cn('ml-1', STATUS_STYLE[o.status].badgeClass)}>{STATUS_STYLE[o.status].label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-5 mt-2 text-sm">
                  {/* Máquina + Datas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded border p-3 bg-muted/30 space-y-1">
                      <div className="text-xs uppercase text-muted-foreground font-semibold">Máquina</div>
                      <div className="font-semibold">{m?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {m?.model ? `Modelo ${m.model}` : ''}{m?.serial_number ? ` · Série ${m.serial_number}` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Prioridade: <span className="font-medium">{o.priority === 'prioritaria' ? 'Prioritária' : 'Normal'}</span>
                      </div>
                    </div>
                    <div className="rounded border p-3 bg-muted/30 space-y-1">
                      <div className="text-xs uppercase text-muted-foreground font-semibold">Datas & Autores</div>
                      <div><span className="text-muted-foreground">Criada:</span> {renderAuthor(o.created_by_name, o.created_by_id)} · {format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')}</div>
                      {o.started_at && (
                        <div><span className="text-muted-foreground">Iniciada:</span> {renderAuthor(o.started_by_name, o.started_by_id)} · {format(new Date(o.started_at), 'dd/MM/yyyy HH:mm')}</div>
                      )}
                      {o.finished_at && (
                        <div><span className="text-muted-foreground">Finalizada:</span> {renderAuthor(o.finished_by_name, o.finished_by_id)} · {format(new Date(o.finished_at), 'dd/MM/yyyy HH:mm')}</div>
                      )}
                      <div><span className="text-muted-foreground">Duração:</span> <span className="font-semibold">{fmtDuration(o.duration_seconds || 0)}</span></div>
                    </div>
                  </div>

                  {/* Descrição */}
                  {o.description && (
                    <div className="rounded border p-3">
                      <div className="text-xs uppercase text-muted-foreground font-semibold mb-1">Descrição / Serviço</div>
                      <div className="whitespace-pre-wrap">{o.description}</div>
                    </div>
                  )}

                  {/* Itens trocados */}
                  <div className="rounded border p-3">
                    <div className="text-xs uppercase text-muted-foreground font-semibold mb-2">Itens trocados ({its.length})</div>
                    {its.length === 0 ? (
                      <div className="text-muted-foreground text-xs">Nenhum item registrado.</div>
                    ) : (
                      <ul className="space-y-1">
                        {its.map(it => {
                          const ref = it.needle_id ? `Agulha ${needles.find(n => n.id === it.needle_id)?.reference_code || ''}` :
                                      it.sinker_id ? `Platina ${sinkers.find(s => s.id === it.sinker_id)?.reference_code || ''}` :
                                      it.cylinder_id ? `Cilindro ${cylinders.find(c => c.id === it.cylinder_id)?.brand || ''}` :
                                      it.description || '—';
                          return (
                            <li key={it.id} className="flex items-center justify-between border-b last:border-b-0 py-1">
                              <span><Badge variant="outline" className="mr-2">{it.item_type}</Badge>{ref}</span>
                              <span className="text-xs text-muted-foreground">Qtd: <span className="font-semibold text-foreground">{it.quantity}</span></span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Notas de progresso */}
                  {notes.length > 0 && (
                    <div className="rounded border p-3">
                      <div className="text-xs uppercase text-muted-foreground font-semibold mb-2">Notas & Itens ({notes.length})</div>
                      <ul className="space-y-2">
                        {notes.map(n => (
                          <li key={n.id} className="text-xs border-l-2 border-blue-500/40 pl-2">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">{n.kind === 'item' ? 'Item' : 'Obs'}</Badge>
                              <span>{format(new Date(n.ts), 'dd/MM/yyyy HH:mm')}</span>
                              {n.author && <span>· {n.author}</span>}
                            </div>
                            <div className="mt-0.5 whitespace-pre-wrap text-foreground">{n.text}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Fotos OC */}
                  {photos.length > 0 && (
                    <div className="rounded border p-3">
                      <div className="text-xs uppercase text-muted-foreground font-semibold mb-2">Fotos do problema ({photos.length})</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {photos.map(p => {
                          const url = photoSignedUrls[p.path];
                          return (
                            <div key={p.id} className="border rounded overflow-hidden bg-muted/30">
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer">
                                  <img src={url} alt={p.description} className="w-full h-56 object-contain bg-black/5" />
                                </a>
                              ) : (
                                <div className="h-56 flex items-center justify-center text-muted-foreground text-xs">
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" /> Carregando…
                                </div>
                              )}
                              <div className="p-2 text-xs">
                                <div className="whitespace-pre-wrap">{p.description || '—'}</div>
                                <div className="mt-1 text-muted-foreground">
                                  {format(new Date(p.ts), 'dd/MM/yyyy HH:mm')}{p.author ? ` · ${p.author}` : ''}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Observações finais */}
                  {o.finish_notes && (
                    <div className="rounded border p-3 bg-emerald-500/5 border-emerald-500/30">
                      <div className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-semibold mb-1">Observações Finais</div>
                      <div className="whitespace-pre-wrap">{o.finish_notes}</div>
                    </div>
                  )}
                </div>
                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setViewOrder(null)}>Fechar</Button>
                  <Button onClick={() => downloadReport(o)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Download className="h-4 w-4" /> Baixar PDF
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}