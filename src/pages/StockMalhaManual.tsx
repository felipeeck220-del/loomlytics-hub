import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/SearchableSelect';
import { BrazilianWeightInput } from '@/components/BrazilianWeightInput';
import { formatWeight, formatNumber } from '@/lib/formatters';
import { logAudit } from '@/lib/auditLog';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import { Warehouse, Plus, ChevronDown, Info, Package, Truck, Lock, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sanitizePdfText } from '@/lib/pdfUtils';

type EstoqueKPIs = {
  entradaKg: number; deliveredKg: number;
  stockKg: number; stockRolls: number;
  reservedKg: number; availableKg: number;
  machineKg?: number; machineRolls?: number;
};
type MachineNode = {
  machineId: string | null; machineName: string;
  entradaKg: number; entradaRolls: number;
  deliveredKg: number; deliveredRolls: number;
  reservedKg: number; reservedRolls: number;
  stockKg: number; stockRolls: number;
  availableKg: number; availableRolls: number;
  machineKg?: number; machineRolls?: number;
};
type ArticleNode = MachineNode & {
  articleId: string; articleName: string; byMachine: MachineNode[];
};
type ClientGroup = {
  clientId: string; clientName: string; articles: ArticleNode[];
  totalEntradaKg: number; totalDeliveredKg: number;
  totalStockKg: number; totalStockRolls: number;
  totalReservedKg: number; totalAvailableKg: number;
  totalMachineKg?: number; totalMachineRolls?: number;
};
type EstoqueResp = { groups: ClientGroup[]; kpis: EstoqueKPIs };

const TYPE_LABEL: Record<string, string> = {
  adjust_in: 'Entrada manual',
  adjust_out: 'Saída manual',
  in: 'Estorno OF',
  out: 'Saída OF',
  reserve: 'Reserva OF',
  release: 'Liberação OF',
};
const TYPE_COLOR: Record<string, string> = {
  adjust_in: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  adjust_out: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  in: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  out: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  reserve: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  release: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

function ManualEntryModal({
  open, onOpenChange, clients, articles, machines, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  clients: any[]; articles: any[]; machines: any[]; onSaved: () => void;
}) {
  const { user, profile } = useAuth();
  const [type, setType] = useState<'adjust_in' | 'adjust_out'>('adjust_in');
  const [dest, setDest] = useState<'expedicao' | 'maquina'>('expedicao');
  const [clientId, setClientId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType('adjust_in'); setDest('expedicao'); setClientId(''); setArticleId(''); setMachineId('');
      setPieces(''); setWeight(''); setReason('');
    }
  }, [open]);

  const filteredArticles = useMemo(
    () => articles.filter((a: any) => a.client_id === clientId).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [articles, clientId]
  );

  const handleSave = async () => {
    const piecesNum = parseInt(pieces || '0', 10);
    const weightNum = parseFloat(weight || '0');
    if (!clientId) return toast.error('Cliente obrigatório');
    if (!articleId) return toast.error('Artigo obrigatório');
    if (!machineId) return toast.error('Máquina obrigatória');
    if (!(weightNum > 0) && !(piecesNum > 0)) return toast.error('Informe peças ou peso');
    if (reason.trim().length < 5) return toast.error('Motivo mínimo 5 caracteres');
    if (!user?.company_id) return;

    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)('save_manual_stock_manual_entry', {
        p_payload: {
          company_id: user.company_id,
          article_id: articleId,
          client_id: clientId,
          machine_id: machineId,
          type,
          pieces: piecesNum,
          weight_kg: weightNum,
          reason: reason.trim(),
          on_machine: dest === 'maquina',
        },
      });
      if (error) throw error;

      await logAudit({
        action: 'STOCK_MANUAL_ADJUST',
        companyId: user.company_id,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userCode: (user as any).code,
        details: {
          scope: 'manual_stock_movements',
          movement_id: data,
          type, client_id: clientId, article_id: articleId, machine_id: machineId,
          pieces: piecesNum, weight_kg: weightNum, reason: reason.trim(),
          on_machine: dest === 'maquina',
        },
      });

      toast.success(
        dest === 'maquina'
          ? (type === 'adjust_in' ? 'Palete lançado na máquina' : 'Baixa no palete da máquina registrada')
          : (type === 'adjust_in' ? 'Entrada manual registrada' : 'Saída manual registrada')
      );
      onSaved();
      // Limpa só peças/peso para novo lançamento em sequência; mantém cliente/artigo/máquina/motivo
      setPieces('');
      setWeight('');
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" />
            Lançamento Manual — Estoque Malha (Manual)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Tipo</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="adjust_in" /> Entrada
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="adjust_out" /> Saída
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Destino</Label>
            <RadioGroup value={dest} onValueChange={(v) => setDest(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="expedicao" /> Estoque da expedição
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="maquina" /> Palete na máquina
              </label>
            </RadioGroup>
            <p className="text-[10px] text-muted-foreground">
              "Palete na máquina" contabiliza em <strong>Em maq.</strong> e já soma em Disp. Rolos — ao puxar o palete para a expedição use "Ajustar palete" na máquina, sem duplicar peças.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Cliente *</Label>
            <SearchableSelect
              value={clientId}
              onValueChange={(v) => { setClientId(v); setArticleId(''); }}
              options={clients.map((c: any) => ({ value: c.id, label: c.name }))}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Artigo *</Label>
            <SearchableSelect
              value={articleId}
              onValueChange={setArticleId}
              options={filteredArticles.map((a: any) => ({ value: a.id, label: a.name }))}
              placeholder={clientId ? 'Selecione o artigo' : 'Escolha um cliente primeiro'}
              searchPlaceholder="Buscar artigo..."
              disabled={!clientId}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Máquina *</Label>
            <SearchableSelect
              value={machineId}
              onValueChange={setMachineId}
              options={machines.map((m: any) => ({ value: m.id, label: m.name }))}
              placeholder="Selecione a máquina"
              searchPlaceholder="Buscar máquina..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Peças</Label>
              <Input
                type="number" min={0}
                value={pieces}
                onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0" className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Peso (kg)</Label>
              <BrazilianWeightInput value={weight} onChange={setWeight} placeholder="0,00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Motivo *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder='Ex.: "Saldo inicial", "Ajuste de contagem"'
              className="text-xs min-h-[70px]" maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PalletTarget = {
  clientId: string; clientName: string;
  articleId: string; articleName: string;
  machineId: string; machineName: string;
  machineRolls: number; machineKg: number;
};

function MachinePalletModal({
  target, onOpenChange, onSaved,
}: {
  target: PalletTarget | null; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'add' | 'move'>('add');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [addPieces, setAddPieces] = useState('');
  const [addWeight, setAddWeight] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setMode('add'); setPieces(''); setWeight(''); setAddPieces(''); setAddWeight(''); setReason('');
    }
  }, [target]);

  if (!target) return null;

  const handleSave = async () => {
    if (!user?.company_id) return;
    const pc = parseInt(pieces || '0', 10) || 0;
    const kg = parseFloat(weight || '0') || 0;
    const addPc = mode === 'move' ? (parseInt(addPieces || '0', 10) || 0) : 0;
    const addKg = mode === 'move' ? (parseFloat(addWeight || '0') || 0) : 0;
    if (pc <= 0 && kg <= 0 && addPc <= 0 && addKg <= 0) return toast.error('Informe peças ou peso');
    if (reason.trim().length < 5) return toast.error('Motivo mínimo 5 caracteres');
    if (mode === 'move' && (pc > target.machineRolls + addPc)) {
      return toast.error('Peças acima do saldo em máquina');
    }
    if (mode === 'move' && (kg > target.machineKg + addKg + 0.0001)) {
      return toast.error('Peso acima do saldo em máquina');
    }

    setSaving(true);
    try {
      const payload = {
        company_id: user.company_id,
        client_id: target.clientId,
        article_id: target.articleId,
        machine_id: target.machineId,
        add_pieces: mode === 'add' ? pc : addPc,
        add_weight_kg: mode === 'add' ? kg : addKg,
        move_pieces: mode === 'move' ? pc : 0,
        move_weight_kg: mode === 'move' ? kg : 0,
        reason: reason.trim(),
      };
      const { error } = await (supabase.rpc as any)('save_manual_stock_machine_adjust', { p_payload: payload });
      if (error) throw error;

      await logAudit({
        action: 'STOCK_MANUAL_MACHINE_PALLET',
        companyId: user.company_id,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userCode: (user as any).code,
        details: { scope: 'manual_stock_movements', mode, ...payload },
      });

      toast.success(mode === 'add' ? 'Palete da máquina atualizado' : 'Peças transferidas para a expedição');
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      const msg = String(err?.message || '');
      toast.error(msg.includes('insufficient_machine_stock')
        ? 'Quantidade maior que o saldo em máquina'
        : getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Palete na máquina — {target.machineName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {target.clientName} · {target.articleName} — em máquina hoje:{' '}
            <strong>{formatNumber(target.machineRolls)} pç</strong> ({formatWeight(target.machineKg)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="add" /> Adicionar peças e manter na máquina
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="move" /> Lançar peças para o estoque da expedição
            </label>
          </RadioGroup>

          {mode === 'move' && (
            <div className="grid grid-cols-2 gap-3 rounded-md border p-2 bg-muted/30">
              <div className="space-y-1 col-span-2">
                <Label className="text-[11px] text-muted-foreground">Antes de transferir, adicionar peças ao palete (opcional)</Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Peças a somar</Label>
                <Input type="number" min={0} value={addPieces} className="h-8 text-xs" placeholder="0"
                  onChange={(e) => setAddPieces(e.target.value.replace(/[^\d]/g, ''))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Peso a somar (kg)</Label>
                <BrazilianWeightInput value={addWeight} onChange={setAddWeight} placeholder="0,00" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{mode === 'add' ? 'Peças' : 'Peças p/ expedição'}</Label>
              <Input type="number" min={0} value={pieces} className="h-8 text-xs" placeholder="0"
                onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Peso (kg)</Label>
              <BrazilianWeightInput value={weight} onChange={setWeight} placeholder="0,00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Motivo *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={mode === 'add' ? 'Ex.: "Conferência do palete na máquina"' : 'Ex.: "Palete fechado puxado para expedição"'}
              className="text-xs min-h-[64px]" maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StockMalhaManual() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const companyId = user?.company_id || '';
  const { getClients, getArticles, getMachines, refreshData } = useSharedCompanyData();
  const clients = getClients();
  const articles = getArticles();
  const machines = getMachines();
  const queryClient = useQueryClient();

  const canEdit = role === 'admin' || (role as any) === 'expedicao';

  const [tab, setTab] = useState<'estoque' | 'movimentos'>('estoque');
  const [openManual, setOpenManual] = useState(false);
  const [palletTarget, setPalletTarget] = useState<PalletTarget | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // Estoque filters
  const [fClient, setFClient] = useState<string>('all');
  const [fArticle, setFArticle] = useState<string>('all');
  const [fMonth, setFMonth] = useState<string>('all');

  // Movements filters
  const [mType, setMType] = useState<string>('all');
  const [mFrom, setMFrom] = useState<string>('');
  const [mTo, setMTo] = useState<string>('');
  const [mClient, setMClient] = useState<string>('all');
  const [mArticle, setMArticle] = useState<string>('all');
  const [mOfSearch, setMOfSearch] = useState<string>('');
  const [mPage, setMPage] = useState<number>(1);
  const pageSize = 20;

  // Bootstrap (available months)
  const { data: bootstrap } = useQuery({
    queryKey: ['manual-stock-bootstrap', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_bootstrap', { p_company_id: companyId });
      if (error) throw error;
      return data as { company: any; available_months: string[] };
    },
    enabled: !!companyId,
  });

  const { data: estoque, isLoading: loadingEstoque } = useQuery({
    queryKey: ['manual-stock-estoque', companyId, fClient, fArticle, fMonth],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_estoque', {
        p_company_id: companyId,
        p_client_id: fClient === 'all' ? null : fClient,
        p_article_id: fArticle === 'all' ? null : fArticle,
        p_month: fMonth || 'all',
      });
      if (error) throw error;
      return data as EstoqueResp;
    },
    enabled: !!companyId && tab === 'estoque',
  });

  const { data: mvData, isLoading: loadingMv } = useQuery({
    queryKey: ['manual-stock-mv', companyId, mType, mFrom, mTo, mClient, mArticle, mOfSearch, mPage],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_manual_stock_movements', {
        p_company_id: companyId,
        p_type: mType,
        p_from: mFrom || null,
        p_to: mTo || null,
        p_page: mPage,
        p_page_size: pageSize,
        p_client_id: mClient === 'all' ? null : mClient,
        p_article_id: mArticle === 'all' ? null : mArticle,
        p_of_search: mOfSearch.trim() || null,
      });
      if (error) throw error;
      return data as { rows: any[]; total_count: number };
    },
    enabled: !!companyId && tab === 'movimentos',
  });

  // Realtime: refetch on any change (per OFR-realtime memory pattern)
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['manual-stock-estoque', companyId] });
        queryClient.invalidateQueries({ queryKey: ['manual-stock-mv', companyId] });
        queryClient.invalidateQueries({ queryKey: ['manual-stock-bootstrap', companyId] });
      }, 250);
    };
    const ch = (supabase as any)
      .channel(`manual-stock-${companyId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'manual_stock_movements', filter: `company_id=eq.${companyId}` },
        refresh)
      // Reservas/baixas vêm das Ordens de Faturamento (status e paletes)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'billing_orders', filter: `company_id=eq.${companyId}` },
        refresh)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'billing_order_pallets', filter: `company_id=eq.${companyId}` },
        refresh)
      .subscribe();
    // Reconecta ao voltar para a aba (mobile/PWA suspende o socket)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(ch);
    };
  }, [companyId, queryClient]);

  const clientOpts = useMemo(
    () => [{ value: 'all', label: 'Todos' }, ...clients.map((c: any) => ({ value: c.id, label: c.name }))],
    [clients]
  );
  const articleOpts = useMemo(() => {
    const scope = fClient === 'all' ? articles : articles.filter((a: any) => a.client_id === fClient);
    return [{ value: 'all', label: 'Todos' }, ...scope.map((a: any) => ({ value: a.id, label: a.name }))];
  }, [articles, fClient]);
  const mArticleOpts = useMemo(() => {
    const scope = mClient === 'all' ? articles : articles.filter((a: any) => a.client_id === mClient);
    return [{ value: 'all', label: 'Todos' }, ...scope.map((a: any) => ({ value: a.id, label: a.name }))];
  }, [articles, mClient]);

  const totalPages = Math.max(1, Math.ceil((mvData?.total_count || 0) / pageSize));

  const kpis = estoque?.kpis;
  const groups = estoque?.groups || [];
  const totalRolls = useMemo(() => {
    const acc = { entrada: 0, delivered: 0, reserved: 0, available: 0, machine: 0 };
    for (const g of groups) {
      for (const a of g.articles || []) {
        acc.entrada += Number(a.entradaRolls || 0);
        acc.delivered += Number(a.deliveredRolls || 0);
        acc.reserved += Number(a.reservedRolls || 0);
        acc.available += Number(a.availableRolls || 0);
        acc.machine += Number(a.machineRolls || 0);
      }
    }
    return acc;
  }, [groups]);
  const companyInfo = bootstrap?.company as { name?: string; logo_url?: string | null } | undefined;

  // ============== EXPORT PDF ==============
  const [exportingArticleId, setExportingArticleId] = useState<string | null>(null);
  const [clientExportGroup, setClientExportGroup] = useState<ClientGroup | null>(null);
  const [exportingClientId, setExportingClientId] = useState<string | null>(null);

  const loadLogoDataUrl = (url: string): Promise<{ data: string; width: number; height: number } | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const drawStandardHeader = (
    pdf: any,
    opts: { company?: { name?: string; logo_url?: string | null }; logoInfo: any; title: string; subtitle?: string }
  ) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 12;
    const dateStr = new Date().toLocaleString('pt-BR');
    const colors = {
      grayBg: [249, 250, 251] as [number, number, number],
      border: [229, 231, 235] as [number, number, number],
      textDark: [17, 24, 39] as [number, number, number],
      textMid: [75, 85, 99] as [number, number, number],
    };
    const headerH = 25;
    const leftX = margin + 5;
    const y = margin;
    const titleMaxWidth = pageWidth - 2 * margin - 90;
    pdf.setFillColor(...colors.grayBg);
    pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'F');
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'S');
    if (opts.logoInfo) {
      try {
        const w = opts.logoInfo.width, h = opts.logoInfo.height;
        const s = Math.min(24 / w, 14 / h);
        pdf.addImage(opts.logoInfo.data, 'PNG', leftX, y + 2.5, w * s, h * s);
      } catch {
        if (opts.company?.name) {
          pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colors.textDark);
          pdf.text(sanitizePdfText(opts.company.name), leftX, y + 10);
        }
      }
    } else if (opts.company?.name) {
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      pdf.text(sanitizePdfText(opts.company.name), leftX, y + 10);
    }
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.textMid);
    pdf.text(sanitizePdfText(dateStr), leftX, y + 22);

    pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textDark);
    const titleLines = pdf.splitTextToSize(sanitizePdfText(opts.title), titleMaxWidth) as string[];
    let titleY = y + 9;
    titleLines.forEach((line: string) => {
      const tw = pdf.getTextWidth(line);
      pdf.text(line, (pageWidth - tw) / 2, titleY);
      titleY += 6;
    });
    if (opts.subtitle) {
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colors.textMid);
      const sub = sanitizePdfText(opts.subtitle);
      const sw = pdf.getTextWidth(sub);
      pdf.text(sub, (pageWidth - sw) / 2, titleY + 1);
    }
    return y + headerH + 10;
  };

  const handleExportArticlePdf = async (group: ClientGroup, article: ArticleNode) => {
    const key = `${group.clientId}::${article.articleId}`;
    if (exportingArticleId) return;
    setExportingArticleId(key);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 12;
      const logoInfo = companyInfo?.logo_url ? await loadLogoDataUrl(companyInfo.logo_url) : null;
      const startY = drawStandardHeader(pdf, {
        company: companyInfo,
        logoInfo,
        title: 'ESTOQUE DE MALHA POR ARTIGO',
        subtitle: `${article.articleName} — ${group.clientName}`,
      });

      const rows = (article.byMachine || [])
        .filter((m) => m.machineId && Number(m.availableRolls || 0) >= 1)
        .sort((a, b) => (a.machineName || '').localeCompare(b.machineName || ''));
      if (rows.length === 0) {
        toast.info('Nenhuma máquina com saldo disponível (≥ 1 rolo) para este artigo.');
        setExportingArticleId(null);
        return;
      }
      const total = rows.reduce((s, r) => s + Number(r.availableRolls || 0), 0);
      const body: any[] = rows.map((m) => [
        sanitizePdfText(m.machineName || 'Máquina removida'),
        sanitizePdfText(article.articleName),
        formatNumber(Number(m.availableRolls || 0)),
      ]);
      body.push([
        { content: 'TOTAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatNumber(total), styles: { halign: 'center', fontStyle: 'bold' } },
      ]);

      autoTable(pdf, {
        head: [['MÁQUINA', 'ARTIGO', 'DISP. ROLOS']],
        body,
        startY,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold' },
          1: { halign: 'left' },
          2: { halign: 'center' },
        },
        didParseCell: (d: any) => {
          if (d.section === 'head') {
            d.cell.styles.halign = d.column.index === 2 ? 'center' : 'left';
          }
        },
      });
      const safe = (article.articleName || 'artigo').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40);
      pdf.save(`estoque_manual_${safe}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (e: any) {
      console.error(e);
      toast.error('Falha ao gerar PDF: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setExportingArticleId(null);
    }
  };

  const handleExportClientPdf = async (group: ClientGroup | null, mode: 'geral' | 'byMachine') => {
    if (!group) return;
    const key = `${group.clientId}::${mode}`;
    if (exportingClientId) return;
    setExportingClientId(key);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 12;
      const logoInfo = companyInfo?.logo_url ? await loadLogoDataUrl(companyInfo.logo_url) : null;
      const title = mode === 'geral'
        ? 'ESTOQUE DE MALHA POR CLIENTE — GERAL'
        : 'ESTOQUE DE MALHA POR CLIENTE — POR MÁQUINA';
      const startY = drawStandardHeader(pdf, {
        company: companyInfo,
        logoInfo,
        title,
        subtitle: group.clientName,
      });

      const articles = (group.articles || []).filter((a) => Number(a.availableRolls || 0) >= 1);
      if (articles.length === 0) {
        toast.info('Nenhum artigo com saldo disponível (≥ 1 rolo) para este cliente.');
        setExportingClientId(null);
        return;
      }

      if (mode === 'geral') {
        const body = articles.map((a) => [
          sanitizePdfText(a.articleName || '-'),
          formatNumber(Number(a.availableRolls || 0)),
        ]);
        autoTable(pdf, {
          head: [['ARTIGO', 'DISP. ROLOS']],
          body,
          startY,
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'center' } },
          didParseCell: (d: any) => {
            if (d.section === 'head') {
              d.cell.styles.halign = d.column.index === 0 ? 'left' : 'center';
            }
          },
        });
      } else {
        const body: any[] = [];
        for (const a of articles) {
          const machines = (a.byMachine || [])
            .filter((m) => m.machineId && Number(m.availableRolls || 0) >= 1)
            .sort((x, y) => (x.machineName || '').localeCompare(y.machineName || ''));
          if (machines.length === 0) continue;
          machines.forEach((m) => {
            body.push([
              sanitizePdfText(a.articleName || '-'),
              sanitizePdfText(m.machineName || 'Máquina removida'),
              formatNumber(Number(m.availableRolls || 0)),
            ]);
          });
          const subtotal = machines.reduce((s, m) => s + Number(m.availableRolls || 0), 0);
          body.push([
            { content: `Subtotal — ${sanitizePdfText(a.articleName || '-')}`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } },
            { content: formatNumber(subtotal), styles: { halign: 'center', fontStyle: 'bold', fillColor: [243, 244, 246] } },
          ]);
        }
        if (body.length === 0) {
          toast.info('Nenhuma máquina com saldo disponível (≥ 1 rolo) para este cliente.');
          setExportingClientId(null);
          return;
        }
        autoTable(pdf, {
          head: [['MÁQUINA', 'ARTIGO', 'DISP. ROLOS']],
          body: body.map((row: any) => {
            // reorder cells from [ARTIGO, MÁQUINA, DISP] to [MÁQUINA, ARTIGO, DISP]
            if (Array.isArray(row) && row.length === 3) {
              return [row[1], row[0], row[2]];
            }
            return row;
          }),
          startY,
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'left' }, 2: { halign: 'center' } },
          didParseCell: (d: any) => {
            if (d.section === 'head') {
              d.cell.styles.halign = d.column.index === 2 ? 'center' : 'left';
            }
          },
        });
      }

      const safe = (group.clientName || 'cliente').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40);
      pdf.save(`estoque_manual_cliente_${safe}_${mode}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
      setClientExportGroup(null);
    } catch (e: any) {
      console.error(e);
      toast.error('Falha ao gerar PDF: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setExportingClientId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            Estoque Malha (Manual)
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Armazém paralelo — entradas somente manuais. Saídas espelham automaticamente as OFs (reserva, liberação e coleta).
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setOpenManual(true)}>
            <Plus className="h-4 w-4 mr-1" /> Lançamento manual
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentações</TabsTrigger>
        </TabsList>

        {/* ============= ESTOQUE ============= */}
        <TabsContent value="estoque" className="space-y-3">
          {/* KPIs no estilo Estoque (Clientes) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Entradas manuais</div>
              <p className="text-xl font-bold text-foreground">{formatNumber(totalRolls.entrada)} pç</p>
              <p className="text-[11px] text-muted-foreground">{formatWeight(kpis?.entradaKg || 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Entregue (OF coletadas)</div>
              <p className="text-xl font-bold text-foreground">{formatNumber(totalRolls.delivered)} pç</p>
              <p className="text-[11px] text-muted-foreground">{formatWeight(kpis?.deliveredKg || 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Lock className="h-3.5 w-3.5" />Reservado (OFs Pronto)</div>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatNumber(totalRolls.reserved)} pç</p>
              <p className="text-[11px] text-muted-foreground">{formatWeight(kpis?.reservedKg || 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Rolos disp.</div>
              <p className={cn('text-xl font-bold', totalRolls.available < 0 ? 'text-destructive' : 'text-success')}>
                {formatNumber(totalRolls.available)} pç
              </p>
              <p className="text-[11px] text-muted-foreground">{formatWeight(kpis?.availableKg || 0)}</p>
              <p className="text-[11px] text-indigo-600 dark:text-indigo-300">Em maq.: {formatNumber(totalRolls.machine)} pç</p>
            </CardContent></Card>
          </div>

          {/* Filtros no estilo Estoque (Clientes) */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={fMonth} onValueChange={setFMonth}>
                  <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo período</SelectItem>
                    {(bootstrap?.available_months || []).map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SearchableSelect
                  value={fClient === 'all' ? '' : fClient}
                  onValueChange={(v) => { setFClient(v || 'all'); setFArticle('all'); }}
                  options={clientOpts.map(o => o.value === 'all' ? { value: 'all', label: 'Todos clientes' } : o)}
                  placeholder="Todos clientes"
                  searchPlaceholder="Buscar cliente..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                <SearchableSelect
                  value={fArticle === 'all' ? '' : fArticle}
                  onValueChange={(v) => setFArticle(v || 'all')}
                  options={articleOpts.map(o => o.value === 'all' ? { value: 'all', label: 'Todos artigos' } : o)}
                  placeholder="Todos artigos"
                  searchPlaceholder="Buscar artigo..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(fClient !== 'all' || fArticle !== 'all' || fMonth !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8"
                    onClick={() => { setFClient('all'); setFArticle('all'); setFMonth('all'); }}>
                    Limpar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {loadingEstoque ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Carregando estoque…</CardContent></Card>
          ) : groups.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Info className="h-6 w-6" />
              Nenhum saldo. Adicione uma entrada manual para começar.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <Collapsible key={g.clientId}>
                  <Card>
                    <CollapsibleTrigger className="w-full group">
                      <CardHeader className="p-3 md:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0 w-full md:w-auto">
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                          <CardTitle className="text-sm font-semibold truncate min-w-0 flex-1 text-left">{g.clientName}</CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            title="Exportar PDF do cliente (todos os artigos)"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setClientExportGroup(g); }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs text-muted-foreground min-w-0 w-full md:w-auto text-left">
                          <span className="whitespace-nowrap">Entradas: <span className="font-semibold text-foreground">{formatNumber((g.articles || []).reduce((s, a) => s + Number(a.entradaRolls || 0), 0))} pç</span></span>
                          <span className="whitespace-nowrap">Reservado: <span className="font-semibold text-amber-600 dark:text-amber-400">{formatNumber((g.articles || []).reduce((s, a) => s + Number(a.reservedRolls || 0), 0))} pç</span></span>
                          <span className="whitespace-nowrap">Em maq.: <span className="font-semibold text-indigo-600 dark:text-indigo-300">{formatNumber((g.articles || []).reduce((s, a) => s + Number(a.machineRolls || 0), 0))} pç</span></span>
                          <span className="whitespace-nowrap">Disponível: <span className={cn('font-semibold', g.totalAvailableKg < 0 ? 'text-destructive' : 'text-success')}>{formatNumber((g.articles || []).reduce((s, a) => s + Number(a.availableRolls || 0), 0))} pç</span></span>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0">
                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-border">
                          {(g.articles || []).map((a) => (
                            <ArticleRowMobile key={a.articleId} article={a}
                              expanded={expandedArticle === `${g.clientId}::${a.articleId}`}
                              canEdit={canEdit}
                              onPallet={(m) => setPalletTarget({
                                clientId: g.clientId, clientName: g.clientName,
                                articleId: a.articleId, articleName: a.articleName,
                                machineId: m.machineId as string, machineName: m.machineName,
                                machineRolls: Number(m.machineRolls || 0), machineKg: Number(m.machineKg || 0),
                              })}
                              onToggle={() => setExpandedArticle(expandedArticle === `${g.clientId}::${a.articleId}` ? null : `${g.clientId}::${a.articleId}`)} />
                          ))}
                        </div>
                        {/* Desktop table — mesmo layout de Estoque (Clientes) */}
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Artigo</TableHead>
                                <TableHead className="text-xs text-right">Entradas (kg)</TableHead>
                                <TableHead className="text-xs text-right">Rolos entrados</TableHead>
                                <TableHead className="text-xs text-right">Entregue (kg)</TableHead>
                                <TableHead className="text-xs text-right">Rolos entregues</TableHead>
                                <TableHead className="text-xs text-right">Físico kg</TableHead>
                                <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">Rolos reservados</TableHead>
                                <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">Reservado kg</TableHead>
                                <TableHead className="text-xs text-right font-bold">Disponível kg</TableHead>
                                <TableHead className="text-xs text-right font-bold text-indigo-700 dark:text-indigo-300">Em maq.</TableHead>
                                <TableHead className="text-xs text-right font-bold">Disp. Rolos</TableHead>
                                <TableHead className="text-xs text-right w-[70px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(g.articles || []).map((a) => {
                                const key = `${g.clientId}::${a.articleId}`;
                                const isOpen = expandedArticle === key;
                                return (
                                  <React.Fragment key={a.articleId}>
                                    <TableRow className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => setExpandedArticle(isOpen ? null : key)}>
                                      <TableCell className="text-xs">
                                        <div className="flex items-center gap-1.5">
                                          <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen ? '' : '-rotate-90')} />
                                          <span className="flex-1">{a.articleName}</span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            title="Baixar PDF do estoque deste artigo"
                                            onClick={(e) => { e.stopPropagation(); handleExportArticlePdf(g, a); }}
                                            disabled={exportingArticleId === `${g.clientId}::${a.articleId}`}
                                          >
                                            {exportingArticleId === `${g.clientId}::${a.articleId}`
                                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              : <Download className="h-3.5 w-3.5" />}
                                          </Button>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs text-right">{formatWeight(a.entradaKg)}</TableCell>
                                      <TableCell className="text-xs text-right">{formatNumber(a.entradaRolls)}</TableCell>
                                      <TableCell className="text-xs text-right">{formatWeight(a.deliveredKg)}</TableCell>
                                      <TableCell className="text-xs text-right">{formatNumber(a.deliveredRolls)}</TableCell>
                                      <TableCell className={cn('text-xs text-right', a.stockKg < 0 ? 'text-destructive' : a.stockKg === 0 ? 'text-muted-foreground' : 'text-foreground')}>
                                        {formatWeight(a.stockKg)}
                                        {a.stockKg < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                                      </TableCell>
                                      <TableCell className="text-xs text-right text-amber-700 dark:text-amber-400">{formatNumber(a.reservedRolls)}</TableCell>
                                      <TableCell className="text-xs text-right text-amber-700 dark:text-amber-400">{formatWeight(a.reservedKg)}</TableCell>
                                      <TableCell className={cn('text-xs text-right font-bold', a.availableKg < 0 ? 'text-destructive' : a.availableKg === 0 ? 'text-muted-foreground' : 'text-success')}>
                                        {formatWeight(a.availableKg)}
                                      </TableCell>
                                      <TableCell className="text-xs text-right font-bold text-indigo-700 dark:text-indigo-300">
                                        {formatNumber(Number(a.machineRolls || 0))} pç
                                      </TableCell>
                                      <TableCell className={cn('text-xs text-right font-bold', a.availableRolls < 0 ? 'text-destructive' : a.availableRolls === 0 ? 'text-muted-foreground' : 'text-success')}>
                                        {formatNumber(a.availableRolls)}
                                      </TableCell>
                                      <TableCell />
                                    </TableRow>
                                    {isOpen && (a.byMachine || []).filter(m => m.machineId).map((m, i) => (
                                      <TableRow key={`${a.articleId}-${m.machineId || i}`} className="bg-muted/30">
                                        <TableCell className="text-[11px] pl-8 text-muted-foreground">
                                          ↳ <span className="font-medium text-indigo-700 dark:text-indigo-300">{m.machineName}</span>
                                        </TableCell>
                                        <TableCell className="text-[11px] text-right">{formatWeight(m.entradaKg)}</TableCell>
                                        <TableCell className="text-[11px] text-right">{formatNumber(m.entradaRolls)}</TableCell>
                                        <TableCell className="text-[11px] text-right">{formatWeight(m.deliveredKg)}</TableCell>
                                        <TableCell className="text-[11px] text-right">{formatNumber(m.deliveredRolls)}</TableCell>
                                        <TableCell className={cn('text-[11px] text-right', m.stockKg < 0 ? 'text-destructive' : 'text-foreground')}>{formatWeight(m.stockKg)}</TableCell>
                                        <TableCell className="text-[11px] text-right text-amber-700 dark:text-amber-400">{formatNumber(m.reservedRolls)}</TableCell>
                                        <TableCell className="text-[11px] text-right text-amber-700 dark:text-amber-400">{formatWeight(m.reservedKg)}</TableCell>
                                        <TableCell className={cn('text-[11px] text-right font-semibold', m.availableKg < 0 ? 'text-destructive' : m.availableKg === 0 ? 'text-muted-foreground' : 'text-success')}>{formatWeight(m.availableKg)}</TableCell>
                                        <TableCell className="text-[11px] text-right font-semibold text-indigo-700 dark:text-indigo-300">{formatNumber(Number(m.machineRolls || 0))} pç</TableCell>
                                        <TableCell className={cn('text-[11px] text-right font-semibold', m.availableRolls < 0 ? 'text-destructive' : m.availableRolls === 0 ? 'text-muted-foreground' : 'text-success')}>{formatNumber(m.availableRolls)}</TableCell>
                                        <TableCell className="text-right">
                                          {canEdit && m.machineId && (
                                            <Button
                                              variant="outline" size="sm" className="h-6 text-[10px] px-2"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setPalletTarget({
                                                  clientId: g.clientId, clientName: g.clientName,
                                                  articleId: a.articleId, articleName: a.articleName,
                                                  machineId: m.machineId as string, machineName: m.machineName,
                                                  machineRolls: Number(m.machineRolls || 0), machineKg: Number(m.machineKg || 0),
                                                });
                                              }}
                                            >
                                              Palete
                                            </Button>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============= MOVIMENTAÇÕES ============= */}
        <TabsContent value="movimentos" className="space-y-3">
          <Card>
            <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={mType} onValueChange={(v) => { setMType(v); setMPage(1); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" className="h-9" value={mFrom} onChange={(e) => { setMFrom(e.target.value); setMPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" className="h-9" value={mTo} onChange={(e) => { setMTo(e.target.value); setMPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <SearchableSelect value={mClient} onValueChange={(v) => { setMClient(v); setMArticle('all'); setMPage(1); }}
                  options={clientOpts} placeholder="Todos" searchPlaceholder="Buscar..." />
              </div>
              <div>
                <Label className="text-xs">Artigo</Label>
                <SearchableSelect value={mArticle} onValueChange={(v) => { setMArticle(v); setMPage(1); }}
                  options={mArticleOpts} placeholder="Todos" searchPlaceholder="Buscar..." />
              </div>
              <div>
                <Label className="text-xs">Buscar OF</Label>
                <Input className="h-9" placeholder="nº OF" value={mOfSearch}
                  onChange={(e) => { setMOfSearch(e.target.value); setMPage(1); }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingMv ? (
                <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              ) : (mvData?.rows || []).length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma movimentação.</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-border">
                    {mvData!.rows.map((r) => (
                      <MvCardMobile key={r.id} row={r} />
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Cliente / Artigo</TableHead>
                          <TableHead>Máquina</TableHead>
                          <TableHead>OF</TableHead>
                          <TableHead className="text-right">Peças</TableHead>
                          <TableHead className="text-right">Kg</TableHead>
                          <TableHead>Autor / Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mvData!.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLOR[r.type] || ''}`}>{TYPE_LABEL[r.type] || r.type}</span>
                                {(r as any).on_machine && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-400 text-indigo-600 dark:text-indigo-300">Em máq.</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium">{r.client?.name || '—'}</div>
                              <div className="text-muted-foreground">{r.article?.name || '—'}</div>
                            </TableCell>
                            <TableCell className="text-xs">{r.machine?.name || '—'}</TableCell>
                            <TableCell className="text-xs">{r.billing_order?.of_number ? `#${r.billing_order.of_number}` : '—'}</TableCell>
                            <TableCell className="text-right text-xs">{formatNumber(r.pieces || 0)}</TableCell>
                            <TableCell className="text-right text-xs">{formatWeight(r.weight_kg || 0)}</TableCell>
                            <TableCell className="text-xs">
                              <div>{r.author ? `${r.author.name}${r.author.code ? ` #${r.author.code}` : ''}` : '—'}</div>
                              {r.reason && <div className="text-muted-foreground text-[10px] italic">{r.reason}</div>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              {/* Pagination */}
              {(mvData?.total_count || 0) > pageSize && (
                <div className="flex items-center justify-between p-3 border-t">
                  <div className="text-xs text-muted-foreground">
                    Página {mPage} de {totalPages} — {mvData?.total_count} registros
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={mPage <= 1} onClick={() => setMPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={mPage >= totalPages} onClick={() => setMPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ManualEntryModal
        open={openManual} onOpenChange={setOpenManual}
        clients={clients} articles={articles} machines={machines}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['manual-stock-estoque', companyId] });
          queryClient.invalidateQueries({ queryKey: ['manual-stock-mv', companyId] });
          refreshData?.();
        }}
      />
      <MachinePalletModal
        target={palletTarget}
        onOpenChange={(o) => { if (!o) setPalletTarget(null); }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['manual-stock-estoque', companyId] });
          queryClient.invalidateQueries({ queryKey: ['manual-stock-mv', companyId] });
          refreshData?.();
        }}
      />
      <Dialog open={!!clientExportGroup} onOpenChange={(o) => { if (!o) setClientExportGroup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar PDF do cliente</DialogTitle>
            <DialogDescription>
              {clientExportGroup?.clientName} — escolha o formato do relatório
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <button
              type="button"
              disabled={!!exportingClientId}
              onClick={() => handleExportClientPdf(clientExportGroup, 'byMachine')}
              className="text-left rounded-lg border p-4 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Por máquina</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Cliente → Artigo → Máquinas (com subtotal por artigo)
                  </div>
                </div>
                {exportingClientId === `${clientExportGroup?.clientId}::byMachine`
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
              </div>
            </button>
            <button
              type="button"
              disabled={!!exportingClientId}
              onClick={() => handleExportClientPdf(clientExportGroup, 'geral')}
              className="text-left rounded-lg border p-4 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Geral</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Cliente → Artigo (somando todas as peças de todas as máquinas)
                  </div>
                </div>
                {exportingClientId === `${clientExportGroup?.clientId}::geral`
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientExportGroup(null)} disabled={!!exportingClientId}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/40' : ''}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ArticleRowMobile({ article, expanded, onToggle, canEdit, onPallet }: {
  article: ArticleNode; expanded: boolean; onToggle: () => void;
  canEdit?: boolean; onPallet?: (m: MachineNode) => void;
}) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left p-3 flex items-start justify-between gap-2 hover:bg-muted/40 overflow-hidden">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm break-words">{article.articleName}</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px]">Est {formatNumber(Number(article.stockRolls || 0))} pç</Badge>
              <Badge variant="outline" className="text-[10px]">Rsv {formatNumber(Number(article.reservedRolls || 0))} pç</Badge>
              <Badge variant="outline" className="text-[10px] border-indigo-400 text-indigo-600 dark:text-indigo-300">Em maq. {formatNumber(Number(article.machineRolls || 0))} pç</Badge>
              <Badge className="text-[10px]">Disp {formatNumber(Number(article.availableRolls || 0))} pç</Badge>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 bg-muted/30 space-y-2">
          {(article.byMachine || []).map((m, i) => (
            <div key={`${m.machineId || 'na'}-${i}`} className="border rounded-md p-2 text-xs bg-background">
              <div className="font-medium break-words">{m.machineName}</div>
              <div className="flex justify-between gap-2 text-[11px] mt-1"><span>Entradas</span><span className="text-right">{formatNumber(Number(m.entradaRolls || 0))} pç</span></div>
              <div className="flex justify-between gap-2 text-[11px]"><span>Saídas OF</span><span className="text-right">{formatNumber(Number(m.deliveredRolls || 0))} pç</span></div>
              <div className="flex justify-between gap-2 text-[11px]"><span>Reservado</span><span className="text-right text-amber-600 dark:text-amber-400">{formatNumber(Number(m.reservedRolls || 0))} pç</span></div>
              <div className="flex justify-between gap-2 text-[11px]"><span>Em maq.</span><span className="text-right text-indigo-600 dark:text-indigo-300">{formatNumber(Number(m.machineRolls || 0))} pç</span></div>
              <div className="flex justify-between gap-2 text-[11px] font-semibold"><span>Disponível</span><span className="text-right">{formatNumber(Number(m.availableRolls || 0))} pç</span></div>
              {canEdit && m.machineId && (
                <Button variant="outline" size="sm" className="h-7 w-full mt-2 text-[11px]" onClick={() => onPallet?.(m)}>
                  Ajustar palete da máquina
                </Button>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MvCardMobile({ row }: { row: any }) {
  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLOR[row.type] || ''}`}>{TYPE_LABEL[row.type] || row.type}</span>
          {row.on_machine && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-400 text-indigo-600 dark:text-indigo-300">Em máq.</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </span>
      </div>
      <div className="text-sm font-medium">{row.client?.name || '—'} · {row.article?.name || '—'}</div>
      <div className="text-[11px] text-muted-foreground">
        Máquina: {row.machine?.name || '—'} {row.billing_order?.of_number ? `· OF #${row.billing_order.of_number}` : ''}
      </div>
      <div className="flex justify-between text-xs">
        <span>{formatNumber(row.pieces || 0)} peças</span>
        <span className="font-semibold">{formatWeight(row.weight_kg || 0)}</span>
      </div>
      {(row.author || row.reason) && (
        <div className="text-[10px] text-muted-foreground border-t pt-1">
          {row.author ? `${row.author.name}${row.author.code ? ` #${row.author.code}` : ''}` : ''}
          {row.reason ? ` · ${row.reason}` : ''}
        </div>
      )}
    </div>
  );
}