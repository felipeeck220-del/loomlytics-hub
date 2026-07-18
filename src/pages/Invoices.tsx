import { useState, useMemo, useEffect } from 'react';
import { BrazilianWeightInput } from '@/components/BrazilianWeightInput';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, formatWeight, getDateLimits, isDateValid } from '@/lib/formatters';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Plus, Trash2, Loader2, Search, FileText, Package, Scale, DollarSign,
  CalendarIcon, Eye, XCircle, Filter, ChevronDown, ChevronRight, Truck, Warehouse, Layers, Pencil, Building2, Download
} from 'lucide-react';
import { generateYarnSalesReportPdf } from '@/lib/yarnSalesReportPdf';

import { SearchableSelect } from '@/components/SearchableSelect';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, getFriendlyErrorMessage } from '@/lib/utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';


const sb = (table: string) => (supabase.from as any)(table);

async function fetchAllPaginated<T>(table: string, companyId: string, orderCol: string = 'created_at', ascending = true): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb(table).select('*').eq('company_id', companyId).order(orderCol, { ascending }).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

type InvoiceType = 'entrada' | 'saida' | 'venda_fio';
type InvoiceStatus = 'pendente' | 'conferida' | 'cancelada';

interface YarnType {
  id: string;
  company_id: string;
  name: string;
  composition: string | null;
  color: string | null;
  observations: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  company_id: string;
  type: InvoiceType;
  invoice_number: string;
  access_key: string | null;
  client_id: string | null;
  client_name: string | null;
  destination_name: string | null;
  buyer_name: string | null;
  issue_date: string;
  total_weight_kg: number;
  total_value: number;
  status: InvoiceStatus;
  observations: string | null;
  created_by_name: string | null;
  created_by_code: string | null;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  company_id: string;
  yarn_type_id: string | null;
  yarn_type_name: string | null;
  article_id: string | null;
  article_name: string | null;
  weight_kg: number;
  quantity_rolls: number;
  quantity_boxes: number;
  value_per_kg: number;
  subtotal: number;
  observations: string | null;
  brand: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<InvoiceType, string> = {
  entrada: 'Entrada de Fio',
  saida: 'Saída Malha',
  venda_fio: 'Venda de Fio',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pendente: 'Pendente',
  conferida: 'Conferida',
  cancelada: 'Cancelada',
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  pendente: 'bg-warning/10 text-warning',
  conferida: 'bg-success/10 text-success',
  cancelada: 'bg-destructive/10 text-destructive',
};

const formatYarnLabel = (y: { name: string; color?: string | null; composition?: string | null }) => {
  const parts = [y.name];
  if (y.color) parts.push(y.color);
  if (y.composition) parts.push(`(${y.composition})`);
  return parts.join(' — ');
};

export default function Invoices() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  
  const { userCode, userName, logAction } = useAuditLog();
  const queryClient = useQueryClient();
  // Fase 3 rpcInvoices.md: invalidação consolidada de todas as caches derivadas de invoices.
  const invalidateInvoiceCaches = () => {
    
    queryClient.invalidateQueries({ queryKey: ['yarn_balance_by_brand'] });
    queryClient.invalidateQueries({ queryKey: ['yarn_balance_by_brand_all'] });
    queryClient.invalidateQueries({ queryKey: ['yarn_global_balance'] });
    queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock_list'] });
    queryClient.invalidateQueries({ queryKey: ['invoices_bootstrap'] });
  };
  const { canSeeFinancial } = usePermissions();
  const { getClients, getArticles } = useSharedCompanyData();
  const clients = getClients();
  const articles = getArticles();
  const { minDate, maxDate } = getDateLimits();

  // ===== Bootstrap (Fase 1 rpcInvoices.md): yarn_types + outsource_companies + company + available_months =====
  const { data: bootstrap, isLoading: loadingBootstrap } = useQuery({
    queryKey: ['invoices_bootstrap', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_invoices_bootstrap', { p_company_id: companyId });
      if (error) throw error;
      return data as {
        company: { name: string | null; logo_url: string | null };
        yarn_types: YarnType[];
        outsource_companies: Array<{ id: string; name: string }>;
        available_months_invoices: string[];
        available_months_eft: string[];
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
  const yarnTypes: YarnType[] = bootstrap?.yarn_types ?? [];
  const outsourceCompanies = bootstrap?.outsource_companies ?? [];
  const bootstrapMonthsInvoices = bootstrap?.available_months_invoices ?? [];
  const bootstrapMonthsEft = bootstrap?.available_months_eft ?? [];
  const bootstrapCompany = bootstrap?.company;
  const loadingYarns = loadingBootstrap;

  // ===== Fase 3 rpcInvoices.md =====
  // As queries diretas em `invoices` e `invoice_items` foram eliminadas. Todas as leituras
  // acontecem via RPCs (`get_invoices_list`, `get_yarn_balance_by_brand`,
  // `get_yarn_global_balance`, `get_yarn_sales_report_export`).

  // ===== State (declarado antes das RPCs paginadas p/ compor queryKey) =====

  // ===== State =====
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'entrada';
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['entrada', 'saida_malha', 'venda_fio', 'saldo', 'saldoGlobal', 'efterceiro', 'fios'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [window.location.search]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [yarnDialogOpen, setYarnDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [saving, setSaving] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination when tab or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterStatus, filterMonth, searchTerm]);

  // NF form state
  const [formType, setFormType] = useState<InvoiceType>('entrada');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formAccessKey, setFormAccessKey] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formBuyerName, setFormBuyerName] = useState('');
  const [formTinturariaName, setFormTinturariaName] = useState('');
  const [formTerceirosName, setFormTerceirosName] = useState('');
  const [formIssueDate, setFormIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formStatus, setFormStatus] = useState<InvoiceStatus>('conferida');
  const [formObservations, setFormObservations] = useState('');
  const [formItems, setFormItems] = useState<Array<{
    yarn_type_id?: string;
    article_id?: string;
    article_name_free?: string;
    weight_kg: string;
    quantity_rolls: string;
    quantity_boxes: string;
    value_per_kg: string;
    brand: string;
  }>>([{ weight_kg: '', quantity_rolls: '', quantity_boxes: '', value_per_kg: '', brand: '' }]);


  // Yarn Type form state
  const [yarnName, setYarnName] = useState('');
  const [yarnComposition, setYarnComposition] = useState('');
  const [yarnColor, setYarnColor] = useState('');
  const [yarnObs, setYarnObs] = useState('');
  const [editingYarn, setEditingYarn] = useState<YarnType | null>(null);
  const [cancelConfirmInvoice, setCancelConfirmInvoice] = useState<Invoice | null>(null);
  const [deleteYarnConfirm, setDeleteYarnConfirm] = useState<YarnType | null>(null);
  const [deleteEftConfirmId, setDeleteEftConfirmId] = useState<string | null>(null);

  // ===== Helpers =====
  const selectedClient = clients.find(c => c.id === formClientId);
  const clientArticles = articles.filter(a => a.client_id === formClientId);

  const resetForm = () => {
    setFormInvoiceNumber('');
    setFormAccessKey('');
    setFormClientId('');
    setFormSupplierName('');
    setFormBuyerName('');
    setFormTinturariaName('');
    setFormTerceirosName('');
    setFormIssueDate(format(new Date(), 'yyyy-MM-dd'));
    setFormStatus('conferida');
    setFormObservations('');
    setFormItems([{ weight_kg: '', quantity_rolls: '', quantity_boxes: '', value_per_kg: '', brand: '' }]);
  };

  const openNewInvoice = (type: InvoiceType) => {
    setFormType(type);
    resetForm();
    setDialogOpen(true);
  };

  // ===== Barcode Scanner — Global keydown listener =====
  useEffect(() => {
    if (!dialogOpen) return;
    let buffer = '';
    let lastKeyTime = 0;
    const SCANNER_THRESHOLD_MS = 80; // scanners type faster than humans

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      // Only capture digit keys
      if (/^\d$/.test(e.key)) {
        if (now - lastKeyTime > SCANNER_THRESHOLD_MS && buffer.length > 0) {
          // Too slow — reset buffer (likely manual typing)
          buffer = '';
        }
        buffer += e.key;
        lastKeyTime = now;

        // When 44 digits accumulated rapidly, fill the access key
        if (buffer.length === 44) {
          e.preventDefault();
          setFormAccessKey(buffer);
          buffer = '';
          toast({ title: 'Chave de Acesso lida com sucesso!', description: 'Código de barras de 44 dígitos detectado automaticamente.' });
        }
      } else if (e.key === 'Enter' && buffer.length === 44) {
        // Some scanners send Enter at the end
        e.preventDefault();
        setFormAccessKey(buffer);
        buffer = '';
        toast({ title: 'Chave de Acesso lida com sucesso!', description: 'Código de barras de 44 dígitos detectado automaticamente.' });
      } else if (e.key !== 'Shift') {
        // Non-digit, non-shift key — reset buffer
        buffer = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dialogOpen]);

  // ===== Available months (bootstrap Fase 1) =====
  const availableMonths = useMemo(() => {
    if (bootstrapMonthsInvoices.length > 0) return bootstrapMonthsInvoices;
    // Fallback (bootstrap ainda carregando): mês corrente.
    return [format(new Date(), 'yyyy-MM')];
  }, [bootstrapMonthsInvoices]);

  // ===== Fase 3 rpcInvoices.md: derivações antigas removidas =====
  // A lista, os KPIs e a paginação da aba ativa vêm de `rpcRows`/`rpcKpis`/`rpcTotalCount`
  // (get_invoices_list). O dropdown de marcas do formulário (`availableBrands`) é
  // alimentado por `get_yarn_balance_by_brand` (all/all) filtrando `balance > 0`.

  // ===== Save Invoice =====
  const handleSaveInvoice = async () => {
    // Validation per type
    if (formType === 'saida' && !formTinturariaName.trim()) { toast({ title: 'Informe a tinturaria', variant: 'destructive' }); return; }
    if (formType === 'entrada' && !formSupplierName.trim()) { toast({ title: 'Informe o fornecedor', variant: 'destructive' }); return; }
    if (formType === 'venda_fio' && !formBuyerName.trim()) { toast({ title: 'Informe o cliente', variant: 'destructive' }); return; }
    if (formType === 'saida' && !formInvoiceNumber.trim()) { toast({ title: 'Informe o nº da NF', variant: 'destructive' }); return; }
    if (!isDateValid(formIssueDate)) { toast({ title: 'Data inválida (limite ±5 anos)', variant: 'destructive' }); return; }
    if (formAccessKey && (formAccessKey.length !== 44 || !/^\d+$/.test(formAccessKey))) {
      toast({ title: 'Chave de acesso deve ter 44 dígitos numéricos', variant: 'destructive' }); return;
    }


    const validItems = formItems.filter(it => {
      if (formType === 'entrada' || formType === 'venda_fio') return it.yarn_type_id && parseFloat(it.weight_kg) > 0;
      if (formType === 'saida') return (it.article_id || it.article_name_free?.trim()) && parseFloat(it.weight_kg) > 0;
      return false;
    });

    if (validItems.length === 0) { toast({ title: 'Adicione ao menos um item válido', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const totalWeight = validItems.reduce((s, it) => s + parseFloat(it.weight_kg || '0'), 0);
      const totalValue = validItems.reduce((s, it) => {
        const w = parseFloat(it.weight_kg || '0');
        const v = parseFloat(it.value_per_kg || '0');
        return s + w * v;
      }, 0);

      

      // For entrada: buyer_name stores supplier; for venda_fio: buyer_name stores buyer; for saida: destination_name stores tinturaria
      const buyerNameValue = formType === 'entrada' ? formSupplierName.trim() : formType === 'venda_fio' ? formBuyerName.trim() : formType === 'saida' ? (formTerceirosName.trim() || null) : null;

      const observationsToSave = formObservations.trim() || null;

      // Fase 4 rpcInvoices.md: gravação atômica via RPC save_invoice.
      const itemsPayload = validItems.map(it => {
        const w = parseFloat(it.weight_kg || '0');
        const v = parseFloat(it.value_per_kg || '0');
        const yarnObj = yarnTypes.find(y => y.id === it.yarn_type_id);
        const artObj = articles.find(a => a.id === it.article_id);
        return {
          yarn_type_id: it.yarn_type_id || null,
          yarn_type_name: yarnObj?.name || null,
          article_id: it.article_id || null,
          article_name: formType === 'saida' ? (it.article_name_free?.trim() || artObj?.name || null) : (artObj?.name || null),
          weight_kg: w,
          quantity_rolls: parseFloat(it.quantity_rolls || '0'),
          quantity_boxes: parseFloat(it.quantity_boxes || '0'),
          value_per_kg: v,
          brand: it.brand?.trim() || null,
        };
      });
      const { error: rpcError } = await (supabase.rpc as any)('save_invoice', {
        p_id: null,
        p_payload: {
          company_id: companyId,
          type: formType,
          invoice_number: formInvoiceNumber.trim() || 'S/N',
          access_key: formAccessKey.trim() || null,
          client_id: null,
          client_name: null,
          buyer_name: buyerNameValue,
          destination_name: formType === 'saida' ? formTinturariaName.trim() : null,
          issue_date: formIssueDate,
          status: formStatus,
          observations: observationsToSave,
          created_by_name: userName || null,
          created_by_code: userCode || null,
        },
        p_items: itemsPayload,
        p_author_name: userName || null,
        p_author_code: userCode || null,
      });
      if (rpcError) throw rpcError;

      invalidateInvoiceCaches();
      
      
      const logName = formType === 'entrada' ? formSupplierName.trim() : formType === 'venda_fio' ? formBuyerName.trim() : formTinturariaName.trim();
      logAction('invoice_create', { invoice_number: formInvoiceNumber.trim() || 'S/N', type: formType, client: logName, total_weight_kg: totalWeight });
      toast({ title: 'NF registrada com sucesso!' });
      resetForm();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar NF', description: getFriendlyErrorMessage(e.message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ===== Cancel Invoice =====
  const handleCancelInvoice = async (inv: Invoice) => {
    // Fase 4 rpcInvoices.md: cancel_invoice aplica a regra "entrada = DELETE físico".
    const { data, error } = await (supabase.rpc as any)('cancel_invoice', {
      p_id: inv.id, p_author_name: userName || null, p_author_code: userCode || null,
    });
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    if (!data?.already) {
      if (inv.type === 'entrada') {
        logAction('invoice_delete', { invoice_number: inv.invoice_number, type: 'entrada' });
        toast({ title: 'NF de entrada excluída com sucesso' });
      } else {
        logAction('invoice_cancel', { invoice_number: inv.invoice_number, client: inv.client_name });
        toast({ title: 'NF cancelada' });
      }
    }
    invalidateInvoiceCaches();
  };

  // ===== Confirm Invoice =====
  const handleConfirmInvoice = async (inv: Invoice) => {
    const { data, error } = await (supabase.rpc as any)('confirm_invoice', {
      p_id: inv.id, p_author_name: userName || null, p_author_code: userCode || null,
    });
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    if (!data?.already) {
      logAction('invoice_confirm', { invoice_number: inv.invoice_number, client: inv.client_name });
      toast({ title: 'NF conferida' });
    }
    invalidateInvoiceCaches();
  };

  // ===== View Invoice =====
  const handleViewInvoice = (inv: Invoice) => {
    setViewingInvoice(inv);
    setViewDialogOpen(true);
  };

  const viewItems = useMemo<InvoiceItem[]>(() => {
    if (!viewingInvoice) return [];
    // Fase 3 rpcInvoices.md: `viewingInvoice` recebe os itens inline via get_invoices_list.
    return ((viewingInvoice as any).items ?? []) as InvoiceItem[];
  }, [viewingInvoice]);

  // ===== Yarn Type CRUD =====
  const handleSaveYarn = async () => {
    if (!yarnName.trim()) { toast({ title: 'Informe o nome do fio', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)('save_yarn_type', {
        p_id: editingYarn?.id ?? null,
        p_payload: {
          company_id: companyId,
          name: yarnName.trim(),
          composition: yarnComposition.trim() || null,
          color: yarnColor.trim() || null,
          observations: yarnObs.trim() || null,
        },
        p_author_name: userName || null,
        p_author_code: userCode || null,
      });
      if (error) throw error;
      if (!data?.already) {
        logAction(editingYarn ? 'yarn_type_update' : 'yarn_type_create', { name: yarnName.trim() });
      }
      
      queryClient.invalidateQueries({ queryKey: ['invoices_bootstrap'] });
      toast({ title: editingYarn ? 'Fio atualizado!' : 'Fio cadastrado!' });
      setYarnDialogOpen(false);
      setEditingYarn(null);
      setYarnName(''); setYarnComposition(''); setYarnColor(''); setYarnObs('');
    } catch (e: any) {
      toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDeleteYarn = async (y: YarnType) => {
    const { data, error } = await (supabase.rpc as any)('delete_yarn_type', {
      p_id: y.id, p_author_name: userName || null, p_author_code: userCode || null,
    });
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    if (!data?.already) logAction('yarn_type_delete', { name: y.name });
    
    queryClient.invalidateQueries({ queryKey: ['invoices_bootstrap'] });
    toast({ title: 'Fio excluído' });
  };

  // ===== Form Item Management =====
  const addItem = () => setFormItems(prev => [...prev, { weight_kg: '', quantity_rolls: '', quantity_boxes: '', value_per_kg: '', brand: '', article_name_free: '' }]);
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  // ===== Saldo Filters =====
  const [saldoYarn, setSaldoYarn] = useState('all');
  const [saldoMonth, setSaldoMonth] = useState('all');
  const [yarnSearchTerm, setYarnSearchTerm] = useState('');

  // ===== Saldo Global Filters =====
  const [saldoGlobalMonth, setSaldoGlobalMonth] = useState('all');
  const [saldoGlobalYarn, setSaldoGlobalYarn] = useState('all');

  // ===== Estoque Fio Terceiros State =====
  const [eftMonth, setEftMonth] = useState('all');
  const [eftCompany, setEftCompany] = useState('all');
  const [eftYarn, setEftYarn] = useState('all');
  const [eftDialogOpen, setEftDialogOpen] = useState(false);
  const [eftEditing, setEftEditing] = useState<any>(null);
  const [eftFormCompany, setEftFormCompany] = useState('');
  const [eftFormYarn, setEftFormYarn] = useState('');
  const [eftFormMonth, setEftFormMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [eftFormQty, setEftFormQty] = useState('');
  const [eftFormObs, setEftFormObs] = useState('');

  // ===== Fase 2 rpcInvoices.md: Lista paginada por aba (invoices_list) =====
  const invListType = activeTab === 'entrada' ? 'entrada'
    : activeTab === 'venda_fio' ? 'venda_fio'
    : activeTab === 'saida_malha' ? 'saida'
    : null;

  const invListQuery = useQuery({
    queryKey: ['invoices_list', companyId, invListType, filterStatus, filterMonth, searchTerm, currentPage],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_invoices_list', {
        p_company_id: companyId,
        p_type: invListType,
        p_status: filterStatus,
        p_month: filterMonth,
        p_search: searchTerm.trim() || null,
        p_page: currentPage,
        p_page_size: itemsPerPage,
      });
      if (error) throw error;
      return data as {
        rows: Array<Invoice & { items: InvoiceItem[] }>;
        total_count: number;
        kpis: { count: number; totalKg: number; totalValue: number; pendentes: number };
      };
    },
    enabled: !!companyId && !!invListType,
    staleTime: 30 * 1000,
  });
  const rpcRows = invListQuery.data?.rows ?? [];
  const rpcTotalCount = invListQuery.data?.total_count ?? 0;
  const rpcKpis = invListQuery.data?.kpis ?? { count: 0, totalKg: 0, totalValue: 0, pendentes: 0 };
  const invListLoading = invListQuery.isLoading;

  // ===== Fase 2 rpcInvoices.md: Lista agrupada de Fio Terceiros =====
  const eftListQuery = useQuery({
    queryKey: ['outsource_yarn_stock_list', companyId, eftMonth, eftCompany, eftYarn],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_outsource_yarn_stock_list', {
        p_company_id: companyId,
        p_month: eftMonth,
        p_outsource_company_id: eftCompany === 'all' ? null : eftCompany,
        p_yarn_type_id: eftYarn === 'all' ? null : eftYarn,
      });
      if (error) throw error;
      return data as {
        groups: Array<{
          outsource_company_id: string;
          outsource_company_name: string;
          items: Array<{
            id: string; yarn_type_id: string; yarn_type_name: string | null;
            yarn_color: string | null; yarn_composition: string | null;
            quantity_kg: number; reference_month: string; observations: string | null;
          }>;
          total_kg: number;
        }>;
        kpis: { total_kg: number; companies_count: number; yarn_types_count: number };
      };
    },
    enabled: !!companyId && activeTab === 'efterceiro',
    staleTime: 30 * 1000,
  });
  const eftListLoading = eftListQuery.isLoading;
  const eftListGroups = eftListQuery.data?.groups ?? [];
  const eftListKpis = eftListQuery.data?.kpis ?? { total_kg: 0, companies_count: 0, yarn_types_count: 0 };

  // ===== Fase 3 rpcInvoices.md: Saldo por marca (get_yarn_balance_by_brand) =====
  const yarnBalanceQuery = useQuery({
    queryKey: ['yarn_balance_by_brand', companyId, saldoMonth, saldoYarn],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_yarn_balance_by_brand', {
        p_company_id: companyId,
        p_month: saldoMonth,
        p_brand: saldoYarn,
      });
      if (error) throw error;
      return data as {
        rows: Array<{ brand: string; received: number; sold: number; balance: number }>;
        kpis: { totalReceived: number; totalSold: number; totalBalance: number };
        available_brands: string[];
      };
    },
    enabled: !!companyId && activeTab === 'saldo',
    staleTime: 60 * 1000,
  });
  const yarnBalance = useMemo(() => (yarnBalanceQuery.data?.rows ?? []).map(r => ({
    brand: r.brand,
    received: Number(r.received) || 0,
    sold: Number(r.sold) || 0,
    balance: Number(r.balance) || 0,
  })), [yarnBalanceQuery.data]);
  const saldoBrandOptions = yarnBalanceQuery.data?.available_brands ?? [];
  const saldoKpis = useMemo(() => {
    const k = yarnBalanceQuery.data?.kpis;
    return {
      received: Number(k?.totalReceived) || 0,
      sold:     Number(k?.totalSold)     || 0,
      balance:  Number(k?.totalBalance)  || 0,
    };
  }, [yarnBalanceQuery.data]);

  // Dropdown de marcas do formulário de NF (saldo positivo). Reaproveita a mesma RPC
  // sem filtros para não impactar o cache da aba Saldo.
  const yarnBalanceAllQuery = useQuery({
    queryKey: ['yarn_balance_by_brand_all', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_yarn_balance_by_brand', {
        p_company_id: companyId,
        p_month: 'all',
        p_brand: 'all',
      });
      if (error) throw error;
      return data as { rows: Array<{ brand: string; balance: number }> };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
  const availableBrands = useMemo(() => (
    (yarnBalanceAllQuery.data?.rows ?? [])
      .filter(r => Number(r.balance) > 0)
      .map(r => r.brand)
      .sort((a, b) => a.localeCompare(b))
  ), [yarnBalanceAllQuery.data]);

  // ===== Fase 3 rpcInvoices.md: Saldo Global (get_yarn_global_balance) =====
  const yarnGlobalBalanceQuery = useQuery({
    queryKey: ['yarn_global_balance', companyId, saldoGlobalMonth, saldoGlobalYarn],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_yarn_global_balance', {
        p_company_id: companyId,
        p_month: saldoGlobalMonth,
        p_yarn_type_id: saldoGlobalYarn === 'all' ? null : saldoGlobalYarn,
      });
      if (error) throw error;
      return data as {
        rows: Array<{
          yarn_type_id: string; yarn_type_name: string;
          yarn_color: string | null; yarn_composition: string | null;
          purchase_month: number; consumed_month: number; sales_month: number;
          stock_accumulated: number;
        }>;
        kpis: { totalPurchase: number; totalConsumed: number; totalSales: number; totalStock: number };
      };
    },
    enabled: !!companyId && activeTab === 'saldoGlobal',
    staleTime: 60 * 1000,
  });
  const yarnGlobalBalance = useMemo(() => (yarnGlobalBalanceQuery.data?.rows ?? []).map(r => ({
    yarnTypeId: r.yarn_type_id,
    yarnTypeName: formatYarnLabel({ name: r.yarn_type_name, color: r.yarn_color, composition: r.yarn_composition }),
    purchaseMonth: Number(r.purchase_month) || 0,
    consumedMonth: Number(r.consumed_month) || 0,
    salesMonth: Number(r.sales_month) || 0,
    stockAccumulated: Number(r.stock_accumulated) || 0,
  })), [yarnGlobalBalanceQuery.data]);
  const saldoGlobalKpis = useMemo(() => {
    const k = yarnGlobalBalanceQuery.data?.kpis;
    return {
      purchase: Number(k?.totalPurchase) || 0,
      consumed: Number(k?.totalConsumed) || 0,
      sales:    Number(k?.totalSales)    || 0,
      stock:    Number(k?.totalStock)    || 0,
    };
  }, [yarnGlobalBalanceQuery.data]);

  // ===== Estoque Fio Terceiros — dados vêm da RPC (Fase 2) =====
  // Normaliza `groups` para o shape camelCase esperado pelo render.
  const eftGroups = useMemo(() => eftListGroups.map(g => ({
    outsourceCompanyId: g.outsource_company_id,
    outsourceCompanyName: g.outsource_company_name,
    totalKg: Number(g.total_kg) || 0,
    items: g.items.map(it => ({
      id: it.id,
      yarnTypeId: it.yarn_type_id,
      yarnTypeName: it.yarn_type_name
        ? formatYarnLabel({ name: it.yarn_type_name, color: it.yarn_color, composition: it.yarn_composition })
        : 'Fio removido',
      quantityKg: Number(it.quantity_kg) || 0,
      referenceMonth: it.reference_month,
      observations: it.observations || '',
    })),
  })), [eftListGroups]);

  const eftKpis = useMemo(() => ({
    totalKg: Number(eftListKpis.total_kg) || 0,
    totalCompanies: Number(eftListKpis.companies_count) || 0,
    totalYarnTypes: Number(eftListKpis.yarn_types_count) || 0,
  }), [eftListKpis]);

  // Total de páginas derivado da RPC (Fase 2)
  const rpcTotalPages = Math.max(1, Math.ceil(rpcTotalCount / itemsPerPage));

  const eftAvailableMonths = useMemo(() => {
    if (bootstrapMonthsEft.length > 0) return bootstrapMonthsEft;
    return [format(new Date(), 'yyyy-MM')];
  }, [bootstrapMonthsEft]);

  // ===== Estoque Fio Terceiros CRUD =====
  const handleSaveEft = async () => {
    if (!eftFormCompany || !eftFormYarn || !eftFormMonth || !eftFormQty) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' }); return;
    }
    const qty = parseFloat(eftFormQty.replace(/\./g, '').replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      toast({ title: 'Quantidade deve ser maior que zero', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        outsource_company_id: eftFormCompany,
        yarn_type_id: eftFormYarn,
        reference_month: eftFormMonth,
        quantity_kg: qty,
        observations: eftFormObs.trim() || null,
      };
      if (eftEditing) {
        const { error } = await sb('outsource_yarn_stock').update({
          quantity_kg: qty, observations: eftFormObs.trim() || null,
        }).eq('id', eftEditing.id);
        if (error) throw error;
      } else {
        const { error } = await sb('outsource_yarn_stock').upsert(payload, {
          onConflict: 'company_id,outsource_company_id,yarn_type_id,reference_month'
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock'] });
      queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock_list'] });
      const compName = outsourceCompanies.find(c => c.id === eftFormCompany)?.name;
      const yarnName2 = yarnTypes.find(y => y.id === eftFormYarn)?.name;
      logAction(eftEditing ? 'outsource_yarn_stock_update' : 'outsource_yarn_stock_create', { company: compName, yarn: yarnName2, month: eftFormMonth, qty });
      toast({ title: eftEditing ? 'Estoque atualizado!' : 'Estoque salvo!' });
      // Keep modal open, preserve company
      setEftFormYarn('');
      setEftFormQty('');
      setEftFormObs('');
      setEftEditing(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDeleteEft = async (id: string) => {
    const { error } = await sb('outsource_yarn_stock').delete().eq('id', id);
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    // Localiza o item nos grupos da RPC (Fase 2) para preservar o log de auditoria.
    let compName: string | undefined;
    let refMonth: string | undefined;
    for (const g of eftListGroups) {
      const it = g.items.find(i => i.id === id);
      if (it) { compName = g.outsource_company_name; refMonth = it.reference_month; break; }
    }
    logAction('outsource_yarn_stock_delete', { company: compName, month: refMonth });
    queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock_list'] });
    toast({ title: 'Registro excluído' });
  };

  const openEditEft = (item: any, companyId: string) => {
    setEftEditing(item);
    setEftFormCompany(companyId);
    setEftFormYarn(item.yarnTypeId);
    setEftFormMonth(item.referenceMonth);
    setEftFormQty(String(item.quantityKg));
    setEftFormObs(item.observations || '');
    setEftDialogOpen(true);
  };

  const openNewEft = () => {
    setEftEditing(null);
    setEftFormCompany('');
    setEftFormYarn('');
    setEftFormMonth(format(new Date(), 'yyyy-MM'));
    setEftFormQty('');
    setEftFormObs('');
    setEftDialogOpen(true);
  };

  // ===== Estoque de Malha — código legado removido (aba não renderizada). =====

  // ===== Clear filters =====
  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterMonth('all');
  };

  const hasFilters = filterStatus !== 'all' || filterMonth !== 'all' || searchTerm.trim() !== '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Notas Fiscais
          </h1>
          <p className="text-sm text-muted-foreground">Controle de entrada de fios e saída de malhas</p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => {
        setActiveTab(v);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', v);
        window.history.pushState({}, '', url);
      }}>
        <TabsList className="w-full flex flex-wrap gap-1 h-auto sm:w-auto sm:inline-flex">
          <TabsTrigger value="entrada" className="text-xs">Entrada de Fio</TabsTrigger>
          <TabsTrigger value="venda_fio" className="text-xs">Venda de Fio</TabsTrigger>
          <TabsTrigger value="saida_malha" className="text-xs">Saída Malha</TabsTrigger>
          <TabsTrigger value="saldo" className="text-xs">Saldo Fios</TabsTrigger>
          <TabsTrigger value="saldoGlobal" className="text-xs">Saldo Global</TabsTrigger>
          <TabsTrigger value="efterceiro" className="text-xs">Fio Terceiros</TabsTrigger>
          <TabsTrigger value="fios" className="text-xs">Tipos de Fio</TabsTrigger>
        </TabsList>

        {/* ===== ENTRADA TAB ===== */}
        {['entrada', 'venda_fio', 'saida_malha'].map(tab => {
          const tabLabel = tab === 'entrada' ? 'Entrada de Fio' : tab === 'venda_fio' ? 'Venda de Fio' : 'Saída Malha';
          return (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />NFs</div>
                <p className="text-xl font-bold text-foreground">{rpcKpis.count}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Scale className="h-3.5 w-3.5" />Peso Total</div>
                <p className="text-xl font-bold text-foreground">{formatWeight(Number(rpcKpis.totalKg))}</p>
              </CardContent></Card>
              {canSeeFinancial && (
                <Card><CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="h-3.5 w-3.5" />Valor Total</div>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(Number(rpcKpis.totalValue))}</p>
                </CardContent></Card>
              )}
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Filter className="h-3.5 w-3.5" />Pendentes</div>
                <p className="text-xl font-bold text-warning">{rpcKpis.pendentes}</p>
              </CardContent></Card>
            </div>

            {/* Filters + Actions */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {tab === 'entrada' && (
                    <Button onClick={() => openNewInvoice('entrada')} size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" /> Nova Entrada
                    </Button>
                  )}
                  {tab === 'venda_fio' && (
                    <>
                      <Button onClick={() => openNewInvoice('venda_fio')} size="sm" className="gap-1.5">
                        <Plus className="h-4 w-4" /> Venda de Fio
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={async () => {
                          try {
                            // Fase 3 rpcInvoices.md: dados do PDF via get_yarn_sales_report_export.
                            const { data, error } = await (supabase.rpc as any)('get_yarn_sales_report_export', {
                              p_company_id: companyId,
                              p_month: filterMonth,
                              p_status: filterStatus,
                              p_search: searchTerm.trim() || null,
                            });
                            if (error) throw error;
                            await generateYarnSalesReportPdf({
                              invoices: (data?.invoices ?? []) as any,
                              items:    (data?.items    ?? []) as any,
                              companyName: bootstrapCompany?.name || '',
                              companyLogoUrl: bootstrapCompany?.logo_url || null,
                              filters: { month: filterMonth, status: filterStatus, search: searchTerm },
                              canSeeFinancial,
                            });
                          } catch (e: any) {
                            toast({ title: 'Erro ao gerar relatório', description: e?.message || String(e), variant: 'destructive' });
                          }
                        }}
                      >
                        <Download className="h-4 w-4" /> Exportar
                      </Button>
                    </>
                  )}
                  {tab === 'saida_malha' && (
                    <Button onClick={() => openNewInvoice('saida')} size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" /> Saída Malha
                    </Button>
                  )}
                  <div className="flex-1" />

                  <Select value={filterMonth} onValueChange={setFilterMonth}>
                    <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os meses</SelectItem>
                      {availableMonths.map(m => (
                        <SelectItem key={m} value={m}>
                          {format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="conferida">Conferida</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-7 h-8 w-[160px] text-xs"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-8">Limpar</Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {invListLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : rpcRows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma NF encontrada</div>
                ) : (
                  <>
                  {/* Mobile: card list */}
                  <div className="md:hidden divide-y divide-border">
                    {rpcRows.map((inv: any) => {
                      const items: InvoiceItem[] = inv.items || [];
                      const yarnLabels = Array.from(new Set(items.map(it => it.yarn_type_name).filter(Boolean))).join(', ') || '—';
                      const articleLabels = items.map(it => it.article_name).filter(Boolean).join(', ') || '—';
                      return (
                        <div key={inv.id} className="p-3 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-semibold text-sm">NF #{inv.invoice_number}</span>
                            <Badge className={cn('text-[10px]', STATUS_COLORS[inv.status])}>{STATUS_LABELS[inv.status]}</Badge>
                          </div>
                          <div className="break-words">
                            <span className="text-muted-foreground">{tab === 'entrada' ? 'Fornecedor' : tab === 'saida_malha' ? 'Tinturaria' : 'Cliente'}:</span>{' '}
                            {tab === 'saida_malha' ? (inv.destination_name || '—') : (inv.destination_name || inv.buyer_name || inv.client_name || '—')}
                          </div>
                          {(tab === 'entrada' || tab === 'venda_fio') && (
                            <div className="break-words"><span className="text-muted-foreground">Tipo de Fio:</span> {yarnLabels}</div>
                          )}
                          {tab === 'saida_malha' && (
                            <>
                              <div className="break-words"><span className="text-muted-foreground">Artigo:</span> {articleLabels}</div>
                              <div className="break-words"><span className="text-muted-foreground">Terceiros:</span> {inv.buyer_name || '—'}</div>
                            </>
                          )}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-muted-foreground">{inv.issue_date ? format(parse(inv.issue_date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '—'}</span>
                            <span className="tabular-nums">
                              <span className="text-muted-foreground">Peso:</span> {formatNumber(Number(inv.total_weight_kg), 2)} kg
                              {canSeeFinancial && <> · <span className="text-muted-foreground">Valor:</span> {formatCurrency(Number(inv.total_value || 0))}</>}
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-600 font-medium break-words">
                            {inv.created_by_name ? `${inv.created_by_name}${inv.created_by_code ? ` #${inv.created_by_code}` : ''}` : '—'}
                            {inv.created_at && <span className="ml-1 text-muted-foreground/70 font-normal">{format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</span>}
                          </div>
                          <div className="flex items-center justify-end gap-1 pt-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewInvoice(inv)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {inv.status === 'pendente' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => handleConfirmInvoice(inv)} title="Conferir">
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {inv.status !== 'cancelada' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCancelConfirmInvoice(inv)} title="Cancelar">
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop: table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                         <TableRow>
                          <TableHead className="text-xs">Nº NF</TableHead>
                           <TableHead className="text-xs">{tab === 'entrada' ? 'Fornecedor' : tab === 'saida_malha' ? 'Tinturaria' : 'Cliente'}</TableHead>
                           {(tab === 'entrada' || tab === 'venda_fio') && <TableHead className="text-xs">Tipo de Fio</TableHead>}
                           {tab === 'saida_malha' && <TableHead className="text-xs">Artigo</TableHead>}
                          {tab === 'saida_malha' && <TableHead className="text-xs">Terceiros</TableHead>}
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs text-right">Peso (kg)</TableHead>
                          {canSeeFinancial && <TableHead className="text-xs text-right">Valor (R$)</TableHead>}
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Registrado por</TableHead>
                          <TableHead className="text-xs text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rpcRows.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs font-medium">{inv.invoice_number}</TableCell>
                             <TableCell className="text-xs">
                               {tab === 'saida_malha' ? (inv.destination_name || '—') : (inv.destination_name || inv.buyer_name || inv.client_name || '—')}
                             </TableCell>
                             {(tab === 'entrada' || tab === 'venda_fio') && (
                               <TableCell className="text-xs">
                                 {Array.from(new Set(((inv.items as InvoiceItem[]) || []).map(it => it.yarn_type_name).filter(Boolean))).join(', ') || '—'}
                               </TableCell>
                             )}
                             {tab === 'saida_malha' && <TableCell className="text-xs">{((inv.items as InvoiceItem[]) || []).map(it => it.article_name).filter(Boolean).join(', ') || '—'}</TableCell>}
                            {tab === 'saida_malha' && <TableCell className="text-xs">{inv.buyer_name || '—'}</TableCell>}
                            <TableCell className="text-xs">
                              {inv.issue_date ? format(parse(inv.issue_date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(Number(inv.total_weight_kg), 2)}</TableCell>
                            {canSeeFinancial && <TableCell className="text-xs text-right">{formatCurrency(Number(inv.total_value || 0))}</TableCell>}
                            <TableCell>
                              <Badge className={cn('text-[10px]', STATUS_COLORS[inv.status])}>{STATUS_LABELS[inv.status]}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] whitespace-nowrap">
                              <div className="font-medium text-xs text-emerald-600">
                                {inv.created_by_name ? `${inv.created_by_name}${inv.created_by_code ? ` #${inv.created_by_code}` : ''}` : '—'}
                              </div>
                              {inv.created_at && (
                                <div className="text-muted-foreground/70">{format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewInvoice(inv)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {inv.status === 'pendente' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => handleConfirmInvoice(inv)} title="Conferir">
                                    <FileText className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {inv.status !== 'cancelada' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCancelConfirmInvoice(inv)} title="Cancelar">
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  </>
                )}
              </CardContent>
              {rpcTotalPages > 1 && (
                <div className="flex items-center justify-center py-4 border-t gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, rpcTotalPages) }, (_, i) => {
                      let pageNum;
                      if (rpcTotalPages <= 5) pageNum = i + 1;
                      else if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= rpcTotalPages - 2) pageNum = rpcTotalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;

                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, rpcTotalPages))}
                    disabled={currentPage === rpcTotalPages}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>
          );
        })}

        {/* ===== SALDO DE FIOS TAB ===== */}
        <TabsContent value="saldo" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Recebido</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoKpis.received)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="h-3.5 w-3.5" />Vendido</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoKpis.sold)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Filter className="h-3.5 w-3.5" />Saldo</div>
              <p className={cn('text-xl font-bold', saldoKpis.balance < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(saldoKpis.balance)}</p>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={saldoMonth} onValueChange={setSaldoMonth}>
                  <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo período</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>
                        {format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SearchableSelect
                  value={saldoYarn === 'all' ? '' : saldoYarn}
                  onValueChange={v => setSaldoYarn(v || 'all')}
                  options={[{ value: 'all', label: 'Todas as marcas' }, ...saldoBrandOptions.map(b => ({ value: b, label: b }))]}
                  placeholder="Todas as marcas"
                  searchPlaceholder="Buscar marca..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(saldoYarn !== 'all' || saldoMonth !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSaldoYarn('all'); setSaldoMonth('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table by brand */}
          {yarnBalance.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum dado de fio encontrado. Registre NFs de entrada para ver o saldo por marca.
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* Mobile: card list */}
                <div className="md:hidden divide-y divide-border">
                  {yarnBalance.map(row => (
                    <div key={row.brand} className="p-3 space-y-1 text-xs">
                      <div className="font-semibold text-sm break-words">{row.brand}</div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Recebido</span><span className="tabular-nums">{formatWeight(row.received)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Vendido</span><span className="tabular-nums">{formatWeight(row.sold)}</span></div>
                      <div className="flex justify-between font-bold"><span>Saldo</span><span className={cn('tabular-nums', row.balance < 0 ? 'text-destructive' : row.balance === 0 ? 'text-muted-foreground' : 'text-success')}>
                        {formatWeight(row.balance)}
                        {row.balance < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                      </span></div>
                    </div>
                  ))}
                  <div className="p-3 space-y-1 text-xs bg-muted/30 font-semibold">
                    <div className="text-sm">TOTAL</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Recebido</span><span className="tabular-nums">{formatWeight(saldoKpis.received)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Vendido</span><span className="tabular-nums">{formatWeight(saldoKpis.sold)}</span></div>
                    <div className="flex justify-between"><span>Saldo</span><span className={cn('tabular-nums', saldoKpis.balance < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(saldoKpis.balance)}</span></div>
                  </div>
                </div>
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Marca do Fio</TableHead>
                      <TableHead className="text-xs text-right">Recebido</TableHead>
                      <TableHead className="text-xs text-right">Vendido</TableHead>
                      <TableHead className="text-xs text-right font-bold">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yarnBalance.map(row => (
                      <TableRow key={row.brand}>
                        <TableCell className="text-xs font-medium">{row.brand}</TableCell>
                        <TableCell className="text-xs text-right">{formatWeight(row.received)}</TableCell>
                        <TableCell className="text-xs text-right">{formatWeight(row.sold)}</TableCell>
                        <TableCell className={cn('text-xs text-right font-bold', row.balance < 0 ? 'text-destructive' : row.balance === 0 ? 'text-muted-foreground' : 'text-success')}>
                          {formatWeight(row.balance)}
                          {row.balance < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="text-xs">TOTAL</TableCell>
                      <TableCell className="text-xs text-right">{formatWeight(saldoKpis.received)}</TableCell>
                      <TableCell className="text-xs text-right">{formatWeight(saldoKpis.sold)}</TableCell>
                      <TableCell className={cn('text-xs text-right', saldoKpis.balance < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(saldoKpis.balance)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== SALDO GLOBAL DE FIOS TAB ===== */}
        <TabsContent value="saldoGlobal" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Compra (mês)</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoGlobalKpis.purchase)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Scale className="h-3.5 w-3.5" />Consumido (mês)</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoGlobalKpis.consumed)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Vendas (mês)</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoGlobalKpis.sales)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Estoque (acumulado)</div>
              <p className={cn('text-xl font-bold', saldoGlobalKpis.stock < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(saldoGlobalKpis.stock)}</p>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={saldoGlobalMonth} onValueChange={setSaldoGlobalMonth}>
                  <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo período</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>
                        {format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SearchableSelect
                  value={saldoGlobalYarn === 'all' ? '' : saldoGlobalYarn}
                  onValueChange={v => setSaldoGlobalYarn(v || 'all')}
                  options={[{ value: 'all', label: 'Todos os fios' }, ...yarnTypes.map(y => ({ value: y.id, label: formatYarnLabel(y) }))]}
                  placeholder="Todos os fios"
                  searchPlaceholder="Buscar fio..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(saldoGlobalMonth !== 'all' || saldoGlobalYarn !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSaldoGlobalMonth('all'); setSaldoGlobalYarn('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {yarnGlobalBalance.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum dado encontrado. Registre NFs de entrada para ver o saldo global de fios.
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* Mobile: card list */}
                <div className="md:hidden divide-y divide-border">
                  {yarnGlobalBalance.map(y => (
                    <div key={y.yarnTypeId} className="p-3 space-y-1 text-xs">
                      <div className="font-semibold text-sm break-words">{y.yarnTypeName}</div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Compra (mês)</span><span className="tabular-nums">{y.purchaseMonth > 0 ? formatWeight(y.purchaseMonth) : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Consumido (mês)</span><span className="tabular-nums">{y.consumedMonth > 0 ? formatWeight(y.consumedMonth) : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Vendas (mês)</span><span className="tabular-nums">{y.salesMonth > 0 ? formatWeight(y.salesMonth) : '—'}</span></div>
                      <div className="flex justify-between font-bold"><span>Estoque (acum.)</span><span className={cn('tabular-nums', y.stockAccumulated < 0 ? 'text-destructive' : y.stockAccumulated === 0 ? 'text-muted-foreground' : 'text-success')}>
                        {y.stockAccumulated !== 0 ? formatWeight(y.stockAccumulated) : '—'}
                        {y.stockAccumulated < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                      </span></div>
                    </div>
                  ))}
                  <div className="p-3 space-y-1 text-xs bg-muted/30 font-semibold">
                    <div className="text-sm">TOTAL</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Compra</span><span className="tabular-nums">{formatWeight(saldoGlobalKpis.purchase)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Consumido</span><span className="tabular-nums">{formatWeight(saldoGlobalKpis.consumed)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Vendas</span><span className="tabular-nums">{formatWeight(saldoGlobalKpis.sales)}</span></div>
                    <div className="flex justify-between"><span>Estoque</span><span className={cn('tabular-nums', saldoGlobalKpis.stock < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(saldoGlobalKpis.stock)}</span></div>
                  </div>
                </div>
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Tipo de Fio</TableHead>
                      <TableHead className="text-xs text-right">Compra (mês)</TableHead>
                      <TableHead className="text-xs text-right">Consumido (mês)</TableHead>
                      <TableHead className="text-xs text-right">Vendas (mês)</TableHead>
                      <TableHead className="text-xs text-right font-bold">Estoque (acumulado)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yarnGlobalBalance.map(y => (
                      <TableRow key={y.yarnTypeId}>
                        <TableCell className="text-xs font-medium">{y.yarnTypeName}</TableCell>
                        <TableCell className="text-xs text-right">{y.purchaseMonth > 0 ? formatWeight(y.purchaseMonth) : '—'}</TableCell>
                        <TableCell className="text-xs text-right">{y.consumedMonth > 0 ? formatWeight(y.consumedMonth) : '—'}</TableCell>
                        <TableCell className="text-xs text-right">{y.salesMonth > 0 ? formatWeight(y.salesMonth) : '—'}</TableCell>
                        <TableCell className={cn('text-xs text-right font-bold', y.stockAccumulated < 0 ? 'text-destructive' : y.stockAccumulated === 0 ? 'text-muted-foreground' : 'text-success')}>
                          {y.stockAccumulated !== 0 ? formatWeight(y.stockAccumulated) : '—'}
                          {y.stockAccumulated < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="text-xs">TOTAL</TableCell>
                      <TableCell className="text-xs text-right">{formatWeight(saldoGlobalKpis.purchase)}</TableCell>
                      <TableCell className="text-xs text-right">{formatWeight(saldoGlobalKpis.consumed)}</TableCell>
                      <TableCell className="text-xs text-right">{formatWeight(saldoGlobalKpis.sales)}</TableCell>
                      <TableCell className={cn('text-xs text-right font-bold', saldoGlobalKpis.stock < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(saldoGlobalKpis.stock)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== ESTOQUE DE MALHA TAB ===== */}

        {/* ===== ESTOQUE FIO TERCEIROS TAB ===== */}
        <TabsContent value="efterceiro" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Total em Terceiros</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(eftKpis.totalKg)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Building2 className="h-3.5 w-3.5" />Facções com Estoque</div>
              <p className="text-xl font-bold text-foreground">{eftKpis.totalCompanies}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Layers className="h-3.5 w-3.5" />Tipos de Fio</div>
              <p className="text-xl font-bold text-foreground">{eftKpis.totalYarnTypes}</p>
            </CardContent></Card>
          </div>

          {/* Filters + Actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                {canSeeFinancial && (
                  <Button onClick={openNewEft} size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Adicionar Estoque
                  </Button>
                )}
                <div className="flex-1" />
                <Select value={eftMonth} onValueChange={setEftMonth}>
                  <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os meses</SelectItem>
                    {eftAvailableMonths.map(m => (
                      <SelectItem key={m} value={m}>
                        {format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SearchableSelect
                  value={eftCompany === 'all' ? '' : eftCompany}
                  onValueChange={v => setEftCompany(v || 'all')}
                  options={[{ value: 'all', label: 'Todas facções' }, ...outsourceCompanies.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="Todas facções"
                  searchPlaceholder="Buscar facção..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                <SearchableSelect
                  value={eftYarn === 'all' ? '' : eftYarn}
                  onValueChange={v => setEftYarn(v || 'all')}
                  options={[{ value: 'all', label: 'Todos os fios' }, ...yarnTypes.map(y => ({ value: y.id, label: formatYarnLabel(y) }))]}
                  placeholder="Todos os fios"
                  searchPlaceholder="Buscar fio..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(eftMonth !== 'all' || eftCompany !== 'all' || eftYarn !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setEftMonth('all'); setEftCompany('all'); setEftYarn('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Grouped by outsource company */}
          {eftListLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : eftGroups.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum estoque de fio em terceiros encontrado. Cadastre registros para controlar o fio enviado às facções.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {eftGroups.map(group => (
                <Collapsible key={group.outsourceCompanyId} defaultOpen>
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                          <CardTitle className="text-sm font-semibold">{group.outsourceCompanyName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Total: <span className="font-semibold text-foreground">{formatWeight(group.totalKg)}</span></span>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0">
                        {/* Mobile: card list */}
                        <div className="md:hidden divide-y divide-border">
                          {group.items.map(item => (
                            <div key={item.id} className="p-3 space-y-1 text-xs">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-semibold text-sm break-words">{item.yarnTypeName}</span>
                                <span className="tabular-nums font-medium">{formatWeight(item.quantityKg)}</span>
                              </div>
                              <div className="text-muted-foreground">Mês Ref.: {format(parse(item.referenceMonth, 'yyyy-MM', new Date()), 'MMM/yyyy', { locale: ptBR })}</div>
                              {item.observations && <div className="text-muted-foreground break-words">Obs.: {item.observations}</div>}
                              {canSeeFinancial && (
                                <div className="flex items-center justify-end gap-1 pt-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEft(item, group.outsourceCompanyId)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteEftConfirmId(item.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="p-3 text-xs bg-muted/30 font-semibold flex items-center justify-between">
                            <span>TOTAL</span>
                            <span className="tabular-nums">{formatWeight(group.totalKg)}</span>
                          </div>
                        </div>
                        <Table className="hidden md:table">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Tipo de Fio</TableHead>
                              <TableHead className="text-xs text-right">Quantidade</TableHead>
                              <TableHead className="text-xs">Mês Ref.</TableHead>
                              <TableHead className="text-xs">Observações</TableHead>
                              {canSeeFinancial && <TableHead className="text-xs text-right">Ações</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map(item => (
                              <TableRow key={item.id}>
                                <TableCell className="text-xs font-medium">{item.yarnTypeName}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(item.quantityKg)}</TableCell>
                                <TableCell className="text-xs">
                                  {format(parse(item.referenceMonth, 'yyyy-MM', new Date()), 'MMM/yyyy', { locale: ptBR })}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{item.observations || '—'}</TableCell>
                                {canSeeFinancial && (
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEft(item, group.outsourceCompanyId)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteEftConfirmId(item.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/30 font-semibold">
                              <TableCell className="text-xs">TOTAL</TableCell>
                              <TableCell className="text-xs text-right">{formatWeight(group.totalKg)}</TableCell>
                              <TableCell className="text-xs" colSpan={canSeeFinancial ? 3 : 2}></TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== TIPOS DE FIO TAB ===== */}
        <TabsContent value="fios" className="space-y-4">
          <Card>
           <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-base">Tipos de Fio Cadastrados</CardTitle>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 h-8 w-full sm:w-[180px] text-xs"
                    placeholder="Buscar fio..."
                    value={yarnSearchTerm}
                    onChange={e => setYarnSearchTerm(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={() => { setEditingYarn(null); setYarnName(''); setYarnComposition(''); setYarnColor(''); setYarnObs(''); setYarnDialogOpen(true); }} className="gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo Fio</span><span className="sm:hidden">Novo</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingYarns ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : yarnTypes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum tipo de fio cadastrado</div>
              ) : (
                <>
                {/* Mobile: card list */}
                <div className="md:hidden divide-y divide-border">
                  {yarnTypes.filter(y => {
                    if (!yarnSearchTerm.trim()) return true;
                    const q = yarnSearchTerm.toLowerCase();
                    return y.name.toLowerCase().includes(q) || (y.composition || '').toLowerCase().includes(q) || (y.color || '').toLowerCase().includes(q);
                  }).map(y => (
                    <div key={y.id} className="p-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm break-words">{y.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditingYarn(y);
                            setYarnName(y.name);
                            setYarnComposition(y.composition || '');
                            setYarnColor(y.color || '');
                            setYarnObs(y.observations || '');
                            setYarnDialogOpen(true);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteYarnConfirm(y)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-muted-foreground break-words">Composição: {y.composition || '—'}</div>
                      <div className="text-muted-foreground break-words">Cor: {y.color || '—'}</div>
                    </div>
                  ))}
                </div>
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Composição</TableHead>
                      <TableHead className="text-xs">Cor</TableHead>
                      <TableHead className="text-xs text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yarnTypes.filter(y => {
                      if (!yarnSearchTerm.trim()) return true;
                      const q = yarnSearchTerm.toLowerCase();
                      return y.name.toLowerCase().includes(q) || (y.composition || '').toLowerCase().includes(q) || (y.color || '').toLowerCase().includes(q);
                    }).map(y => (
                      <TableRow key={y.id}>
                        <TableCell className="text-xs font-medium">{y.name}</TableCell>
                        <TableCell className="text-xs">{y.composition || '—'}</TableCell>
                        <TableCell className="text-xs">{y.color || '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                              setEditingYarn(y);
                              setYarnName(y.name);
                              setYarnComposition(y.composition || '');
                              setYarnColor(y.color || '');
                              setYarnObs(y.observations || '');
                              setYarnDialogOpen(true);
                            }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteYarnConfirm(y)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== NEW INVOICE DIALOG ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-[80vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nova NF — {TYPE_LABELS[formType]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Entity + NF Number + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                {formType === 'saida' ? (
                  <>
                    <Label className="text-xs">Tinturaria *</Label>
                    <Input className="h-9 text-xs" value={formTinturariaName} onChange={e => setFormTinturariaName(e.target.value)} placeholder="Nome da tinturaria" />
                  </>
                ) : formType === 'entrada' ? (
                  <>
                    <Label className="text-xs">Fornecedor *</Label>
                    <Input className="h-9 text-xs" value={formSupplierName} onChange={e => setFormSupplierName(e.target.value)} placeholder="Nome do fornecedor" />
                  </>
                ) : (
                  <>
                    <Label className="text-xs">Cliente *</Label>
                    <Input className="h-9 text-xs" value={formBuyerName} onChange={e => setFormBuyerName(e.target.value)} placeholder="Nome do cliente" />
                  </>
                )}
              </div>
              {formType === 'saida' && (
                <div>
                  <Label className="text-xs">Terceiros (opcional)</Label>
                  <SearchableSelect
                    value={formTerceirosName}
                    onValueChange={v => setFormTerceirosName(v === '__nenhum__' ? '' : v)}
                    options={[{ value: '__nenhum__', label: 'Nenhum' }, ...outsourceCompanies.map(c => ({ value: c.name, label: c.name }))]}
                    placeholder="Nenhum"
                    searchPlaceholder="Buscar malharia..."
                    triggerClassName="h-9 text-xs"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Nº da NF{formType === 'saida' ? ' *' : ''}</Label>
                <Input className="h-9 text-xs" value={formInvoiceNumber} onChange={e => setFormInvoiceNumber(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={formType === 'saida' ? 'Ex: 12345' : 'Opcional'} />
              </div>
              <div>
                <Label className="text-xs">Data Emissão *</Label>
                <Input type="date" className="h-9 text-xs" value={formIssueDate} onChange={e => setFormIssueDate(e.target.value)} min={minDate} max={maxDate} />
              </div>
            </div>



            <div>
              <Label className="text-xs">Chave de Acesso SEFAZ (44 dígitos, opcional — use o leitor de código de barras)</Label>
              <Input className="h-9 text-xs font-mono" maxLength={44} value={formAccessKey} onChange={e => setFormAccessKey(e.target.value.replace(/\D/g, ''))} placeholder="00000000000000000000000000000000000000000000" />
              {formAccessKey && formAccessKey.length === 44 && <span className="text-[10px] text-success">✓ Chave válida (44 dígitos)</span>}
              {formAccessKey && formAccessKey.length > 0 && formAccessKey.length !== 44 && <span className="text-[10px] text-muted-foreground">{formAccessKey.length}/44 dígitos</span>}
            </div>

            {/* Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={formStatus} onValueChange={v => setFormStatus(v as InvoiceStatus)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="conferida">Conferida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Itens da NF</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="text-xs h-7 gap-1">
                  <Plus className="h-3 w-3" /> Item
                </Button>
              </div>
              <div className="space-y-2">
                {formItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
                    {/* Yarn or Article selection */}
                    <div className={formType === 'saida' ? 'col-span-3' : 'col-span-3'}>
                      <Label className="text-[10px]">{formType === 'saida' ? 'Artigo' : 'Tipo de Fio'}</Label>
                      {formType === 'saida' ? (
                        <Input
                          className="h-8 text-xs"
                          value={item.article_name_free || ''}
                          onChange={e => updateItem(idx, 'article_name_free', e.target.value)}
                          placeholder="Nome do artigo"
                        />
                      ) : (
                        <SearchableSelect
                          value={item.yarn_type_id || ''}
                          onValueChange={v => updateItem(idx, 'yarn_type_id', v)}
                          options={yarnTypes.map(y => ({ value: y.id, label: formatYarnLabel(y) }))}
                          placeholder="Selecione..."
                          searchPlaceholder="Buscar fio..."
                          triggerClassName="h-8 text-xs"
                        />
                      )}
                    </div>
                    {/* Brand field for entrada (free text) and venda_fio (dropdown of available) */}
                    {(formType === 'entrada' || formType === 'venda_fio') && (
                      <div className="col-span-2">
                        <Label className="text-[10px]">Marca do Fio</Label>
                        {formType === 'entrada' ? (
                          <Input className="h-8 text-xs" value={item.brand} onChange={e => updateItem(idx, 'brand', e.target.value)} placeholder="Ex: Têxtil ABC" />
                        ) : (
                          <Select value={item.brand || ''} onValueChange={v => updateItem(idx, 'brand', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                            <SelectContent>
                              {availableBrands.map(b => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                              {availableBrands.length === 0 && (
                                <SelectItem value="__none__" disabled>Nenhuma marca disponível</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    <div className="col-span-2">
                      <Label className="text-[10px]">Peso (kg)</Label>
                      <BrazilianWeightInput value={item.weight_kg} onChange={v => updateItem(idx, 'weight_kg', v)} />
                    </div>
                    {(formType === 'entrada' || formType === 'venda_fio') && (
                      <div className="col-span-2">
                        <Label className="text-[10px]">Caixas</Label>
                        <Input className="h-8 text-xs" inputMode="numeric" type="number" min="0" value={item.quantity_boxes} onChange={e => updateItem(idx, 'quantity_boxes', e.target.value)} onKeyDown={e => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }} />
                      </div>
                    )}
                    {formType === 'venda_fio' && canSeeFinancial && (
                      <div className="col-span-2">
                        <Label className="text-[10px]">R$/kg</Label>
                        <Input className="h-8 text-xs" inputMode="decimal" type="number" step="0.01" min="0" value={item.value_per_kg}
                          onChange={e => updateItem(idx, 'value_per_kg', e.target.value)}
                          onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                        />
                      </div>
                    )}
                    <div className="col-span-1 flex items-end">
                      {formItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {/* Subtotal preview */}
                    {canSeeFinancial && formType === 'venda_fio' && (
                      <div className="col-span-12 text-right text-[10px] text-muted-foreground">
                        Subtotal: {formatCurrency((parseFloat(item.weight_kg || '0')) * (parseFloat(item.value_per_kg || '0')))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Observations */}
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea className="text-xs" rows={2} value={formObservations} onChange={e => setFormObservations(e.target.value)} />
            </div>

            {/* Total preview */}
            <div className="bg-muted rounded-lg p-3 text-sm flex items-center justify-between">
              <span className="font-medium">Total:</span>
              <div className="text-right">
                <div className="font-bold">{formatWeight(formItems.reduce((s, it) => s + parseFloat(it.weight_kg || '0'), 0))}</div>
                {canSeeFinancial && formType === 'venda_fio' && (
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(formItems.reduce((s, it) => s + parseFloat(it.weight_kg || '0') * parseFloat(it.value_per_kg || '0'), 0))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveInvoice} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar NF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== VIEW INVOICE DIALOG ===== */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-[70vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>NF {viewingInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {viewingInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Tipo:</span><br /><Badge variant="outline">{TYPE_LABELS[viewingInvoice.type]}</Badge></div>
                <div><span className="text-muted-foreground text-xs">{viewingInvoice.type === 'entrada' ? 'Fornecedor:' : viewingInvoice.type === 'saida' ? 'Tinturaria:' : 'Cliente:'}</span><br />{viewingInvoice.type === 'saida' ? (viewingInvoice.destination_name || '—') : (viewingInvoice.destination_name || viewingInvoice.buyer_name || viewingInvoice.client_name || '—')}</div>
                {viewingInvoice.type === 'saida' && <div><span className="text-muted-foreground text-xs">Terceiros:</span><br />{viewingInvoice.buyer_name || '—'}</div>}
                <div><span className="text-muted-foreground text-xs">Data:</span><br />{viewingInvoice.issue_date ? format(parse(viewingInvoice.issue_date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '—'}</div>
                <div><span className="text-muted-foreground text-xs">Status:</span><br /><Badge className={cn('text-[10px]', STATUS_COLORS[viewingInvoice.status])}>{STATUS_LABELS[viewingInvoice.status]}</Badge></div>
                <div><span className="text-muted-foreground text-xs">Peso Total:</span><br />{formatWeight(Number(viewingInvoice.total_weight_kg))}</div>
                {canSeeFinancial && <div><span className="text-muted-foreground text-xs">Valor Total:</span><br />{formatCurrency(Number(viewingInvoice.total_value || 0))}</div>}
              </div>
              {viewingInvoice.access_key && (
                <div className="text-xs"><span className="text-muted-foreground">Chave de Acesso:</span> <span className="font-mono">{viewingInvoice.access_key}</span></div>
              )}
              {viewingInvoice.observations && (
                <div className="text-xs"><span className="text-muted-foreground">Observações:</span> {viewingInvoice.observations}</div>
              )}

              {/* Items */}
              <div>
                <Label className="text-xs font-semibold">Itens</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{viewingInvoice.type === 'saida' ? 'Artigo' : 'Fio'}</TableHead>
                      {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableHead className="text-xs">Marca</TableHead>}
                      <TableHead className="text-xs text-right">Peso (kg)</TableHead>
                      {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableHead className="text-xs text-right">Caixas</TableHead>}
                      {canSeeFinancial && viewingInvoice.type !== 'saida' && <TableHead className="text-xs text-right">R$/kg</TableHead>}
                      {canSeeFinancial && viewingInvoice.type !== 'saida' && <TableHead className="text-xs text-right">Subtotal</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewItems.map(it => (
                      <TableRow key={it.id}>
                        <TableCell className="text-xs">{it.article_name || it.yarn_type_name || '—'}</TableCell>
                        {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableCell className="text-xs">{it.brand || '—'}</TableCell>}
                        <TableCell className="text-xs text-right">{formatNumber(Number(it.weight_kg), 2)}</TableCell>
                        {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableCell className="text-xs text-right">{formatNumber(Number(it.quantity_boxes))}</TableCell>}
                        {canSeeFinancial && viewingInvoice.type !== 'saida' && <TableCell className="text-xs text-right">{formatCurrency(Number(it.value_per_kg))}</TableCell>}
                        {canSeeFinancial && viewingInvoice.type !== 'saida' && <TableCell className="text-xs text-right">{formatCurrency(Number(it.subtotal))}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-[10px] whitespace-nowrap mt-4">
                <div className="font-medium text-xs text-emerald-600">
                  {viewingInvoice.created_by_name ? `${viewingInvoice.created_by_name}${viewingInvoice.created_by_code ? ` #${viewingInvoice.created_by_code}` : ''}` : '—'}
                </div>
                {viewingInvoice.created_at && (
                  <div className="text-muted-foreground/70">{format(new Date(viewingInvoice.created_at), 'dd/MM/yyyy HH:mm')}</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== YARN TYPE DIALOG ===== */}
      <Dialog open={yarnDialogOpen} onOpenChange={setYarnDialogOpen}>
        <DialogContent className="sm:max-w-md" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingYarn ? 'Editar Tipo de Fio' : 'Novo Tipo de Fio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input className="h-9 text-xs" value={yarnName} onChange={e => setYarnName(e.target.value)} placeholder="Ex: Algodão 30/1 branco" />
            </div>
            <div>
              <Label className="text-xs">Composição</Label>
              <Input className="h-9 text-xs" value={yarnComposition} onChange={e => setYarnComposition(e.target.value)} placeholder="Ex: 100% algodão" />
            </div>
            <div>
              <Label className="text-xs">Cor</Label>
              <Input className="h-9 text-xs" value={yarnColor} onChange={e => setYarnColor(e.target.value)} placeholder="Ex: Branco" />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea className="text-xs" rows={2} value={yarnObs} onChange={e => setYarnObs(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYarnDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveYarn} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingYarn ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== OUTSOURCE YARN STOCK DIALOG ===== */}
      <Dialog open={eftDialogOpen} onOpenChange={setEftDialogOpen}>
        <DialogContent className="sm:max-w-md" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{eftEditing ? 'Editar Estoque de Fio' : 'Adicionar Estoque de Fio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Facção *</Label>
              {eftEditing ? (
                <Input className="h-9 text-xs" value={outsourceCompanies.find(c => c.id === eftFormCompany)?.name || ''} disabled />
              ) : (
                <SearchableSelect
                  value={eftFormCompany}
                  onValueChange={v => setEftFormCompany(v)}
                  options={outsourceCompanies.map(c => ({ value: c.id, label: c.name }))}
                  placeholder="Selecione a facção..."
                  searchPlaceholder="Buscar facção..."
                  triggerClassName="h-9 text-xs"
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Tipo de Fio *</Label>
              {eftEditing ? (
                <Input className="h-9 text-xs" value={yarnTypes.find(y => y.id === eftFormYarn)?.name || ''} disabled />
              ) : (
                <SearchableSelect
                  value={eftFormYarn}
                  onValueChange={v => setEftFormYarn(v)}
                  options={yarnTypes.map(y => ({ value: y.id, label: formatYarnLabel(y) }))}
                  placeholder="Selecione o fio..."
                  searchPlaceholder="Buscar fio..."
                  triggerClassName="h-9 text-xs"
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Mês Referência *</Label>
              <Input type="month" className="h-9 text-xs" value={eftFormMonth} onChange={e => setEftFormMonth(e.target.value)} disabled={!!eftEditing} />
            </div>
            <div>
              <Label className="text-xs">Quantidade (kg) *</Label>
              <Input className="h-9 text-xs" inputMode="decimal" type="number" step="0.01" min="0" value={eftFormQty} onChange={e => setEftFormQty(e.target.value)} onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }} placeholder="Ex: 1234.56" />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea className="text-xs" rows={2} value={eftFormObs} onChange={e => setEftFormObs(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEftDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEft} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {eftEditing ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete/Cancel confirm dialogs */}
      <DeleteConfirmDialog
        open={!!cancelConfirmInvoice}
        onOpenChange={(v) => { if (!v) setCancelConfirmInvoice(null); }}
        title={cancelConfirmInvoice?.type === 'entrada' ? "Excluir Nota Fiscal" : "Cancelar Nota Fiscal"}
        description={cancelConfirmInvoice?.type === 'entrada' 
          ? `Tem certeza que deseja EXCLUIR permanentemente a NF de entrada ${cancelConfirmInvoice?.invoice_number}? Esta ação não pode ser desfeita.`
          : `Tem certeza que deseja cancelar a NF ${cancelConfirmInvoice?.invoice_number}?`}
        onConfirm={() => { if (cancelConfirmInvoice) handleCancelInvoice(cancelConfirmInvoice); setCancelConfirmInvoice(null); }}
        confirmLabel={cancelConfirmInvoice?.type === 'entrada' ? "Excluir NF" : "Cancelar NF"}
      />
      <DeleteConfirmDialog
        open={!!deleteYarnConfirm}
        onOpenChange={(v) => { if (!v) setDeleteYarnConfirm(null); }}
        title="Excluir tipo de fio"
        description={`Tem certeza que deseja excluir o fio "${deleteYarnConfirm?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => { if (deleteYarnConfirm) handleDeleteYarn(deleteYarnConfirm); setDeleteYarnConfirm(null); }}
      />
      <DeleteConfirmDialog
        open={!!deleteEftConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteEftConfirmId(null); }}
        title="Excluir registro de estoque"
        description="Tem certeza que deseja excluir este registro de estoque? Esta ação não pode ser desfeita."
        onConfirm={() => { if (deleteEftConfirmId) handleDeleteEft(deleteEftConfirmId); setDeleteEftConfirmId(null); }}
      />
    </div>
  );
}
