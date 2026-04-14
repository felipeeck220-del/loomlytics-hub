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
  CalendarIcon, Eye, XCircle, Filter, ChevronDown, ChevronRight, Truck, Warehouse, Layers, Pencil, Building2
} from 'lucide-react';

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
  saida: 'Saída (Malha)',
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

export default function Invoices() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  
  const { userCode, userName, logAction } = useAuditLog();
  const queryClient = useQueryClient();
  const { canSeeFinancial } = usePermissions();
  const { getClients, getArticles, getProductions } = useSharedCompanyData();
  const clients = getClients();
  const articles = getArticles();
  const productions = getProductions();
  const { minDate, maxDate } = getDateLimits();

  // ===== Fetch Yarn Types =====
  const { data: yarnTypes = [], isLoading: loadingYarns } = useQuery({
    queryKey: ['yarn_types', companyId],
    queryFn: async () => {
      const { data, error } = await sb('yarn_types').select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return (data || []) as YarnType[];
    },
    enabled: !!companyId,
  });

  // ===== Fetch Invoices =====
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', companyId],
    queryFn: () => fetchAllPaginated<Invoice>('invoices', companyId, 'created_at', false),
    enabled: !!companyId,
  });

  // ===== Fetch Invoice Items =====
  const { data: invoiceItems = [] } = useQuery({
    queryKey: ['invoice_items', companyId],
    queryFn: () => fetchAllPaginated<InvoiceItem>('invoice_items', companyId, 'created_at'),
    enabled: !!companyId,
  });

  // ===== Fetch Outsource Companies =====
  const { data: outsourceCompanies = [] } = useQuery({
    queryKey: ['outsource_companies', companyId],
    queryFn: async () => {
      const { data, error } = await sb('outsource_companies').select('id, name').eq('company_id', companyId).order('name');
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string }>;
    },
    enabled: !!companyId,
  });

  // ===== Fetch Outsource Yarn Stock =====
  const { data: outsourceYarnStock = [], isLoading: loadingYarnStock } = useQuery({
    queryKey: ['outsource_yarn_stock', companyId],
    queryFn: () => fetchAllPaginated<{
      id: string; company_id: string; outsource_company_id: string; yarn_type_id: string;
      quantity_kg: number; reference_month: string; observations: string | null;
      created_at: string; updated_at: string;
    }>('outsource_yarn_stock', companyId, 'reference_month', false),
    enabled: !!companyId,
  });

  // ===== State =====
  const [activeTab, setActiveTab] = useState('entrada');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [yarnDialogOpen, setYarnDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [saving, setSaving] = useState(false);

  // NF form state
  const [formType, setFormType] = useState<InvoiceType>('entrada');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formAccessKey, setFormAccessKey] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formBuyerName, setFormBuyerName] = useState('');
  const [formIssueDate, setFormIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formStatus, setFormStatus] = useState<InvoiceStatus>('pendente');
  const [formObservations, setFormObservations] = useState('');
  const [formItems, setFormItems] = useState<Array<{
    yarn_type_id?: string;
    article_id?: string;
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
    setFormIssueDate(format(new Date(), 'yyyy-MM-dd'));
    setFormStatus('pendente');
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

  // ===== Available months =====
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(format(new Date(), 'yyyy-MM'));
    invoices.forEach(inv => {
      if (inv.issue_date && inv.issue_date.length >= 7) {
        const m = inv.issue_date.substring(0, 7);
        const year = parseInt(m.substring(0, 4));
        if (year >= 2020 && year <= 2099) months.add(m);
      }
    });
    return Array.from(months).sort().reverse();
  }, [invoices]);

  // ===== Filtered invoices by tab + filters =====
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Tab filter
    if (activeTab === 'entrada') filtered = filtered.filter(i => i.type === 'entrada');
    else if (activeTab === 'saida') filtered = filtered.filter(i => i.type === 'saida' || i.type === 'venda_fio');

    // Status
    if (filterStatus !== 'all') filtered = filtered.filter(i => i.status === filterStatus);

    // Client
    if (filterClient !== 'all') filtered = filtered.filter(i => i.client_id === filterClient);

    // Month
    if (filterMonth !== 'all') filtered = filtered.filter(i => i.issue_date.startsWith(filterMonth));

    // Search — includes buyer_name (supplier/buyer)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(i =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.client_name || '').toLowerCase().includes(q) ||
        (i.buyer_name || '').toLowerCase().includes(q) ||
        (i.access_key || '').includes(q)
      );
    }

    return filtered;
  }, [invoices, activeTab, filterStatus, filterClient, filterMonth, searchTerm]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const active = filteredInvoices.filter(i => i.status !== 'cancelada');
    return {
      count: active.length,
      totalKg: active.reduce((s, i) => s + Number(i.total_weight_kg), 0),
      totalValue: active.reduce((s, i) => s + Number(i.total_value || 0), 0),
      pendentes: active.filter(i => i.status === 'pendente').length,
    };
  }, [filteredInvoices]);

  // ===== Available brands from items with positive stock =====
  const availableBrands = useMemo(() => {
    const brandMap = new Map<string, number>();
    // Sum entries
    invoices.filter(i => i.type === 'entrada' && i.status !== 'cancelada').forEach(inv => {
      invoiceItems.filter(it => it.invoice_id === inv.id && it.brand).forEach(it => {
        brandMap.set(it.brand!, (brandMap.get(it.brand!) || 0) + Number(it.weight_kg));
      });
    });
    // Subtract sales
    invoices.filter(i => i.type === 'venda_fio' && i.status !== 'cancelada').forEach(inv => {
      invoiceItems.filter(it => it.invoice_id === inv.id && it.brand).forEach(it => {
        brandMap.set(it.brand!, (brandMap.get(it.brand!) || 0) - Number(it.weight_kg));
      });
    });
    // Only return brands with positive stock
    return Array.from(brandMap.entries())
      .filter(([, qty]) => qty > 0)
      .map(([brand]) => brand)
      .sort();
  }, [invoices, invoiceItems]);

  // ===== Save Invoice =====
  const handleSaveInvoice = async () => {
    // Validation per type
    if (formType === 'saida' && !formClientId) { toast({ title: 'Selecione um cliente', variant: 'destructive' }); return; }
    if (formType === 'entrada' && !formSupplierName.trim()) { toast({ title: 'Informe o fornecedor', variant: 'destructive' }); return; }
    if (formType === 'venda_fio' && !formBuyerName.trim()) { toast({ title: 'Informe o cliente', variant: 'destructive' }); return; }
    if (!formInvoiceNumber.trim()) { toast({ title: 'Informe o nº da NF', variant: 'destructive' }); return; }
    if (!isDateValid(formIssueDate)) { toast({ title: 'Data inválida (limite ±5 anos)', variant: 'destructive' }); return; }
    if (formAccessKey && (formAccessKey.length !== 44 || !/^\d+$/.test(formAccessKey))) {
      toast({ title: 'Chave de acesso deve ter 44 dígitos numéricos', variant: 'destructive' }); return;
    }


    const validItems = formItems.filter(it => {
      if (formType === 'entrada' || formType === 'venda_fio') return it.yarn_type_id && parseFloat(it.weight_kg) > 0;
      if (formType === 'saida') return it.article_id && parseFloat(it.weight_kg) > 0;
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

      const clientObj = formType === 'saida' ? clients.find(c => c.id === formClientId) : null;

      // For entrada: buyer_name stores supplier; for venda_fio: buyer_name stores buyer
      const buyerNameValue = formType === 'entrada' ? formSupplierName.trim() : formType === 'venda_fio' ? formBuyerName.trim() : null;

      const observationsToSave = formObservations.trim() || null;

      const { data: invData, error: invError } = await sb('invoices').insert({
        company_id: companyId,
        type: formType,
        invoice_number: formInvoiceNumber.trim(),
        access_key: formAccessKey.trim() || null,
        client_id: formType === 'saida' ? formClientId : null,
        client_name: formType === 'saida' ? (clientObj?.name || null) : null,
        buyer_name: buyerNameValue,
        issue_date: formIssueDate,
        total_weight_kg: totalWeight,
        total_value: totalValue,
        status: formStatus,
        observations: observationsToSave,
        
        created_by_name: userName || null,
        created_by_code: userCode || null,
      }).select('id').single();

      if (invError) throw invError;

      const itemsToInsert = validItems.map(it => {
        const w = parseFloat(it.weight_kg || '0');
        const v = parseFloat(it.value_per_kg || '0');
        const yarnObj = yarnTypes.find(y => y.id === it.yarn_type_id);
        const artObj = articles.find(a => a.id === it.article_id);
        return {
          invoice_id: invData.id,
          company_id: companyId,
          yarn_type_id: it.yarn_type_id || null,
          yarn_type_name: yarnObj?.name || null,
          article_id: it.article_id || null,
          article_name: artObj?.name || null,
          weight_kg: w,
          quantity_rolls: parseFloat(it.quantity_rolls || '0'),
          quantity_boxes: parseFloat(it.quantity_boxes || '0'),
          value_per_kg: v,
          subtotal: w * v,
          brand: it.brand?.trim() || null,
        };
      });

      const { error: itemsError } = await sb('invoice_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_items'] });
      const logName = formType === 'entrada' ? formSupplierName.trim() : formType === 'venda_fio' ? formBuyerName.trim() : clientObj?.name;
      logAction('invoice_create', { invoice_number: formInvoiceNumber.trim(), type: formType, client: logName, total_weight_kg: totalWeight });
      toast({ title: 'NF registrada com sucesso!' });
      resetForm();
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro ao salvar NF', description: getFriendlyErrorMessage(e.message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ===== Cancel Invoice =====
  const handleCancelInvoice = async (inv: Invoice) => {
    const { error } = await sb('invoices').update({ status: 'cancelada' }).eq('id', inv.id);
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    logAction('invoice_cancel', { invoice_number: inv.invoice_number, client: inv.client_name });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    toast({ title: 'NF cancelada' });
  };

  // ===== Confirm Invoice =====
  const handleConfirmInvoice = async (inv: Invoice) => {
    const { error } = await sb('invoices').update({ status: 'conferida' }).eq('id', inv.id);
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    logAction('invoice_confirm', { invoice_number: inv.invoice_number, client: inv.client_name });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    toast({ title: 'NF conferida' });
  };

  // ===== View Invoice =====
  const handleViewInvoice = (inv: Invoice) => {
    setViewingInvoice(inv);
    setViewDialogOpen(true);
  };

  const viewItems = useMemo(() => {
    if (!viewingInvoice) return [];
    return invoiceItems.filter(it => it.invoice_id === viewingInvoice.id);
  }, [viewingInvoice, invoiceItems]);

  // ===== Yarn Type CRUD =====
  const handleSaveYarn = async () => {
    if (!yarnName.trim()) { toast({ title: 'Informe o nome do fio', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editingYarn) {
        await sb('yarn_types').update({ name: yarnName.trim(), composition: yarnComposition.trim() || null, color: yarnColor.trim() || null, observations: yarnObs.trim() || null }).eq('id', editingYarn.id);
      } else {
        await sb('yarn_types').insert({ company_id: companyId, name: yarnName.trim(), composition: yarnComposition.trim() || null, color: yarnColor.trim() || null, observations: yarnObs.trim() || null });
      }
      logAction(editingYarn ? 'yarn_type_update' : 'yarn_type_create', { name: yarnName.trim() });
      queryClient.invalidateQueries({ queryKey: ['yarn_types'] });
      toast({ title: editingYarn ? 'Fio atualizado!' : 'Fio cadastrado!' });
      setYarnDialogOpen(false);
      setEditingYarn(null);
      setYarnName(''); setYarnComposition(''); setYarnColor(''); setYarnObs('');
    } catch (e: any) {
      toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDeleteYarn = async (y: YarnType) => {
    const { error } = await sb('yarn_types').delete().eq('id', y.id);
    if (error) { toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' }); return; }
    logAction('yarn_type_delete', { name: y.name });
    queryClient.invalidateQueries({ queryKey: ['yarn_types'] });
    toast({ title: 'Fio excluído' });
  };

  // ===== Form Item Management =====
  const addItem = () => setFormItems(prev => [...prev, { weight_kg: '', quantity_rolls: '', quantity_boxes: '', value_per_kg: '', brand: '' }]);
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  // ===== Saldo Filters =====
  const [saldoClient, setSaldoClient] = useState('all');
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

  // ===== Saldo de Fios =====
  const yarnBalance = useMemo(() => {
    const map = new Map<string, Map<string, { received: number; sold: number; consumed: number }>>();

    // Helper to filter by month
    const matchMonth = (date: string) => saldoMonth === 'all' || date.startsWith(saldoMonth);

    // Entries (received) from non-cancelled invoices
    invoices.filter(i => i.type === 'entrada' && i.status !== 'cancelada' && matchMonth(i.issue_date)).forEach(inv => {
      const items = invoiceItems.filter(it => it.invoice_id === inv.id);
      items.forEach(it => {
        if (!it.yarn_type_id || !inv.client_id) return;
        const clientKey = inv.client_id;
        if (!map.has(clientKey)) map.set(clientKey, new Map());
        const yarnMap = map.get(clientKey)!;
        if (!yarnMap.has(it.yarn_type_id)) yarnMap.set(it.yarn_type_id, { received: 0, sold: 0, consumed: 0 });
        yarnMap.get(it.yarn_type_id)!.received += Number(it.weight_kg);
      });
    });

    // Yarn sales (sold) from non-cancelled invoices
    invoices.filter(i => i.type === 'venda_fio' && i.status !== 'cancelada' && matchMonth(i.issue_date)).forEach(inv => {
      const items = invoiceItems.filter(it => it.invoice_id === inv.id);
      items.forEach(it => {
        if (!it.yarn_type_id || !inv.client_id) return;
        const clientKey = inv.client_id;
        if (!map.has(clientKey)) map.set(clientKey, new Map());
        const yarnMap = map.get(clientKey)!;
        if (!yarnMap.has(it.yarn_type_id)) yarnMap.set(it.yarn_type_id, { received: 0, sold: 0, consumed: 0 });
        yarnMap.get(it.yarn_type_id)!.sold += Number(it.weight_kg);
      });
    });

    // Consumed from productions (via articles with yarn_type_id)
    productions.filter(p => matchMonth(p.date)).forEach(prod => {
      const article = articles.find(a => a.id === prod.article_id);
      if (!article?.yarn_type_id || !article.client_id) return;
      const clientKey = article.client_id;
      if (!map.has(clientKey)) map.set(clientKey, new Map());
      const yarnMap = map.get(clientKey)!;
      if (!yarnMap.has(article.yarn_type_id)) yarnMap.set(article.yarn_type_id, { received: 0, sold: 0, consumed: 0 });
      yarnMap.get(article.yarn_type_id)!.consumed += Number(prod.weight_kg);
    });

    // Build result
    const result: Array<{
      clientId: string;
      clientName: string;
      yarns: Array<{ yarnId: string; yarnName: string; received: number; sold: number; consumed: number; balance: number }>;
      totalReceived: number; totalSold: number; totalConsumed: number; totalBalance: number;
    }> = [];

    map.forEach((yarnMap, clientId) => {
      if (saldoClient !== 'all' && clientId !== saldoClient) return;
      const client = clients.find(c => c.id === clientId);
      const yarns: any[] = [];
      let totalReceived = 0, totalSold = 0, totalConsumed = 0, totalBalance = 0;
      yarnMap.forEach((vals, yarnId) => {
        if (saldoYarn !== 'all' && yarnId !== saldoYarn) return;
        const yarn = yarnTypes.find(y => y.id === yarnId);
        const balance = vals.received - vals.sold - vals.consumed;
        yarns.push({ yarnId, yarnName: yarn?.name || 'Desconhecido', received: vals.received, sold: vals.sold, consumed: vals.consumed, balance });
        totalReceived += vals.received; totalSold += vals.sold; totalConsumed += vals.consumed; totalBalance += balance;
      });
      if (yarns.length > 0) {
        result.push({ clientId, clientName: client?.name || 'Desconhecido', yarns, totalReceived, totalSold, totalConsumed, totalBalance });
      }
    });

    return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [invoices, invoiceItems, clients, yarnTypes, productions, articles, saldoClient, saldoYarn, saldoMonth]);

  // Global KPIs for saldo
  const saldoKpis = useMemo(() => {
    return yarnBalance.reduce((acc, g) => ({
      received: acc.received + g.totalReceived,
      sold: acc.sold + g.totalSold,
      consumed: acc.consumed + g.totalConsumed,
      balance: acc.balance + g.totalBalance,
    }), { received: 0, sold: 0, consumed: 0, balance: 0 });
  }, [yarnBalance]);

  // ===== Saldo Global de Fios (por tipo de fio, todos clientes) =====
  const yarnGlobalBalance = useMemo(() => {
    const selectedMonth = saldoGlobalMonth;
    const map = new Map<string, { yarnTypeId: string; yarnTypeName: string; purchaseMonth: number; consumedMonth: number; salesMonth: number; stockAccumulated: number }>();

    // Helper: last day of a yyyy-MM string
    const lastDayOfMonth = (ym: string): string => {
      const [year, month] = ym.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      return `${ym}-${String(lastDay).padStart(2, '0')}`;
    };

    // Initialize all yarn types
    for (const yt of yarnTypes) {
      map.set(yt.id, { yarnTypeId: yt.id, yarnTypeName: yt.name, purchaseMonth: 0, consumedMonth: 0, salesMonth: 0, stockAccumulated: 0 });
    }

    const endDate = selectedMonth === 'all' ? '9999-12-31' : lastDayOfMonth(selectedMonth);

    // 1. Compra (NFs entrada)
    const entradaInvs = invoices.filter(inv => inv.type === 'entrada' && inv.status !== 'cancelada');
    for (const inv of entradaInvs) {
      const isMonth = selectedMonth === 'all' || inv.issue_date.startsWith(selectedMonth);
      const isAccum = inv.issue_date <= endDate;
      const items = invoiceItems.filter(it => it.invoice_id === inv.id && it.yarn_type_id);
      for (const item of items) {
        const entry = map.get(item.yarn_type_id!);
        if (!entry) continue;
        if (isMonth) entry.purchaseMonth += Number(item.weight_kg);
        if (isAccum) entry.stockAccumulated += Number(item.weight_kg);
      }
    }

    // 2. Consumo (produções via artigos)
    for (const prod of productions) {
      const art = articles.find(a => a.id === prod.article_id);
      if (!art?.yarn_type_id) continue;
      const entry = map.get(art.yarn_type_id);
      if (!entry) continue;
      const isMonth = selectedMonth === 'all' || prod.date.startsWith(selectedMonth);
      const isAccum = prod.date <= endDate;
      if (isMonth) entry.consumedMonth += Number(prod.weight_kg);
      if (isAccum) entry.stockAccumulated -= Number(prod.weight_kg);
    }

    // 3. Vendas (NFs venda_fio)
    const vendaInvs = invoices.filter(inv => inv.type === 'venda_fio' && inv.status !== 'cancelada');
    for (const inv of vendaInvs) {
      const isMonth = selectedMonth === 'all' || inv.issue_date.startsWith(selectedMonth);
      const isAccum = inv.issue_date <= endDate;
      const items = invoiceItems.filter(it => it.invoice_id === inv.id && it.yarn_type_id);
      for (const item of items) {
        const entry = map.get(item.yarn_type_id!);
        if (!entry) continue;
        if (isMonth) entry.salesMonth += Number(item.weight_kg);
        if (isAccum) entry.stockAccumulated -= Number(item.weight_kg);
      }
    }

    // Filter and sort
    let result = Array.from(map.values())
      .filter(y => y.purchaseMonth > 0 || y.salesMonth > 0 || y.stockAccumulated !== 0 || y.consumedMonth > 0);

    if (saldoGlobalYarn !== 'all') {
      result = result.filter(y => y.yarnTypeId === saldoGlobalYarn);
    }

    return result.sort((a, b) => a.yarnTypeName.localeCompare(b.yarnTypeName));
  }, [invoices, invoiceItems, productions, articles, yarnTypes, saldoGlobalMonth, saldoGlobalYarn]);

  const saldoGlobalKpis = useMemo(() => yarnGlobalBalance.reduce((acc, y) => ({
    purchase: acc.purchase + y.purchaseMonth,
    stock: acc.stock + y.stockAccumulated,
    sales: acc.sales + y.salesMonth,
    consumed: acc.consumed + y.consumedMonth,
  }), { purchase: 0, stock: 0, sales: 0, consumed: 0 }), [yarnGlobalBalance]);

  // ===== Estoque Fio Terceiros useMemo =====
  const eftGroups = useMemo(() => {
    const map = new Map<string, { outsourceCompanyId: string; outsourceCompanyName: string; items: any[]; totalKg: number }>();

    for (const record of outsourceYarnStock) {
      if (eftMonth !== 'all' && record.reference_month !== eftMonth) continue;
      if (eftCompany !== 'all' && record.outsource_company_id !== eftCompany) continue;
      if (eftYarn !== 'all' && record.yarn_type_id !== eftYarn) continue;

      const cid = record.outsource_company_id;
      if (!map.has(cid)) {
        const company = outsourceCompanies.find(c => c.id === cid);
        map.set(cid, { outsourceCompanyId: cid, outsourceCompanyName: company?.name || 'Facção removida', items: [], totalKg: 0 });
      }
      const group = map.get(cid)!;
      const yarn = yarnTypes.find(y => y.id === record.yarn_type_id);
      group.items.push({
        id: record.id,
        yarnTypeId: record.yarn_type_id,
        yarnTypeName: yarn?.name || 'Fio removido',
        quantityKg: Number(record.quantity_kg),
        referenceMonth: record.reference_month,
        observations: record.observations || '',
      });
      group.totalKg += Number(record.quantity_kg);
    }

    return Array.from(map.values()).sort((a, b) => a.outsourceCompanyName.localeCompare(b.outsourceCompanyName));
  }, [outsourceYarnStock, outsourceCompanies, yarnTypes, eftMonth, eftCompany, eftYarn]);

  const eftKpis = useMemo(() => ({
    totalKg: eftGroups.reduce((s, g) => s + g.totalKg, 0),
    totalCompanies: new Set(eftGroups.map(g => g.outsourceCompanyId)).size,
    totalYarnTypes: new Set(eftGroups.flatMap(g => g.items.map(i => i.yarnTypeId))).size,
  }), [eftGroups]);

  const eftAvailableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(format(new Date(), 'yyyy-MM'));
    outsourceYarnStock.forEach(r => { if (r.reference_month) months.add(r.reference_month); });
    return Array.from(months).sort().reverse();
  }, [outsourceYarnStock]);

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
    const item = outsourceYarnStock.find((s: any) => s.id === id);
    const compName = outsourceCompanies.find(c => c.id === item?.outsource_company_id)?.name;
    logAction('outsource_yarn_stock_delete', { company: compName, month: item?.reference_month });
    queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock'] });
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

  // ===== Estoque de Malha Filters =====
  const [estoqueClient, setEstoqueClient] = useState('all');
  const [estoqueArticle, setEstoqueArticle] = useState('all');
  const [estoqueMonth, setEstoqueMonth] = useState('all');

  // ===== Estoque de Malha =====
  const malhaEstoque = useMemo(() => {
    const map = new Map<string, Map<string, { producedKg: number; producedRolls: number; deliveredKg: number; deliveredRolls: number }>>();
    const matchMonth = (date: string) => estoqueMonth === 'all' || date.startsWith(estoqueMonth);

    // 1. Produção por client_id + article_id
    for (const prod of productions) {
      if (!matchMonth(prod.date)) continue;
      const art = articles.find(a => a.id === prod.article_id);
      if (!art || !art.client_id) continue;
      if (!map.has(art.client_id)) map.set(art.client_id, new Map());
      const artMap = map.get(art.client_id)!;
      if (!artMap.has(prod.article_id!)) artMap.set(prod.article_id!, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0 });
      const entry = artMap.get(prod.article_id!)!;
      entry.producedKg += Number(prod.weight_kg);
      entry.producedRolls += Number(prod.rolls_produced);
    }

    // 2. Entregas (NFs saída e saída malha não canceladas)
    const saidaInvs = invoices.filter(i => i.type === 'saida' && i.status !== 'cancelada' && matchMonth(i.issue_date));
    for (const inv of saidaInvs) {
      const items = invoiceItems.filter(it => it.invoice_id === inv.id);
      for (const item of items) {
        if (!item.article_id || !inv.client_id) continue;
        if (!map.has(inv.client_id)) map.set(inv.client_id, new Map());
        const artMap = map.get(inv.client_id)!;
        if (!artMap.has(item.article_id)) artMap.set(item.article_id, { producedKg: 0, producedRolls: 0, deliveredKg: 0, deliveredRolls: 0 });
        const entry = artMap.get(item.article_id)!;
        entry.deliveredKg += Number(item.weight_kg);
        entry.deliveredRolls += Number(item.quantity_rolls || 0);
      }
    }

    // 3. Montar resultado
    const result: Array<{
      clientId: string; clientName: string;
      articles: Array<{ articleId: string; articleName: string; producedKg: number; producedRolls: number; deliveredKg: number; deliveredRolls: number; stockKg: number; stockRolls: number }>;
      totalProducedKg: number; totalProducedRolls: number; totalDeliveredKg: number; totalDeliveredRolls: number; totalStockKg: number; totalStockRolls: number;
    }> = [];

    map.forEach((artMap, clientId) => {
      if (estoqueClient !== 'all' && clientId !== estoqueClient) return;
      const client = clients.find(c => c.id === clientId);
      const arts: typeof result[0]['articles'] = [];
      let tPK = 0, tPR = 0, tDK = 0, tDR = 0;
      artMap.forEach((vals, articleId) => {
        if (estoqueArticle !== 'all' && articleId !== estoqueArticle) return;
        const article = articles.find(a => a.id === articleId);
        arts.push({ articleId, articleName: article?.name || 'Artigo removido', ...vals, stockKg: vals.producedKg - vals.deliveredKg, stockRolls: vals.producedRolls - vals.deliveredRolls });
        tPK += vals.producedKg; tPR += vals.producedRolls; tDK += vals.deliveredKg; tDR += vals.deliveredRolls;
      });
      if (arts.length > 0) {
        result.push({ clientId, clientName: client?.name || 'Cliente removido', articles: arts.sort((a, b) => a.articleName.localeCompare(b.articleName)), totalProducedKg: tPK, totalProducedRolls: tPR, totalDeliveredKg: tDK, totalDeliveredRolls: tDR, totalStockKg: tPK - tDK, totalStockRolls: tPR - tDR });
      }
    });
    return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [productions, invoices, invoiceItems, articles, clients, estoqueClient, estoqueArticle, estoqueMonth]);

  const estoqueKpis = useMemo(() => malhaEstoque.reduce((acc, g) => ({
    producedKg: acc.producedKg + g.totalProducedKg,
    deliveredKg: acc.deliveredKg + g.totalDeliveredKg,
    stockKg: acc.stockKg + g.totalStockKg,
    stockRolls: acc.stockRolls + g.totalStockRolls,
  }), { producedKg: 0, deliveredKg: 0, stockKg: 0, stockRolls: 0 }), [malhaEstoque]);

  // ===== Clear filters =====
  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterClient('all');
    setFilterMonth('all');
  };

  const hasFilters = filterStatus !== 'all' || filterClient !== 'all' || filterMonth !== 'all' || searchTerm.trim() !== '';

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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex flex-wrap gap-1 h-auto sm:w-auto sm:inline-flex">
          <TabsTrigger value="entrada" className="text-xs">Entrada de Fio</TabsTrigger>
          <TabsTrigger value="saida" className="text-xs">Venda de Fio</TabsTrigger>
          <TabsTrigger value="saldo" className="text-xs">Saldo Fios</TabsTrigger>
          <TabsTrigger value="saldoGlobal" className="text-xs">Saldo Global</TabsTrigger>
          <TabsTrigger value="estoque" className="text-xs">Estoque Malha</TabsTrigger>
          <TabsTrigger value="efterceiro" className="text-xs">Fio Terceiros</TabsTrigger>
          <TabsTrigger value="fios" className="text-xs">Tipos de Fio</TabsTrigger>
        </TabsList>

        {/* ===== ENTRADA, SAIDA & VENDA_FIO TABS ===== */}
        {['entrada', 'saida'].map(tab => {
          const tabLabel = tab === 'entrada' ? 'Entrada de Fio' : 'Venda de Fio';
          const invoiceType = tab as InvoiceType;
          return (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />NFs</div>
                <p className="text-xl font-bold text-foreground">{kpis.count}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Scale className="h-3.5 w-3.5" />Peso Total</div>
                <p className="text-xl font-bold text-foreground">{formatWeight(kpis.totalKg)}</p>
              </CardContent></Card>
              {canSeeFinancial && (
                <Card><CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="h-3.5 w-3.5" />Valor Total</div>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(kpis.totalValue)}</p>
                </CardContent></Card>
              )}
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Filter className="h-3.5 w-3.5" />Pendentes</div>
                <p className="text-xl font-bold text-warning">{kpis.pendentes}</p>
              </CardContent></Card>
            </div>

            {/* Filters + Actions */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {tab === 'entrada' ? (
                    <Button onClick={() => openNewInvoice('entrada')} size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" /> Nova Entrada
                    </Button>
                  ) : (
                    <div className="flex gap-1.5">
                      <Button onClick={() => openNewInvoice('saida')} size="sm" className="gap-1.5">
                        <Plus className="h-4 w-4" /> Nova Saída (Malha)
                      </Button>
                      <Button onClick={() => openNewInvoice('venda_fio')} size="sm" variant="outline" className="gap-1.5">
                        <Plus className="h-4 w-4" /> Venda de Fio
                      </Button>
                    </div>
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

                  {tab === 'saida' && (
                    <SearchableSelect
                      value={filterClient === 'all' ? '' : filterClient}
                      onValueChange={v => setFilterClient(v || 'all')}
                      options={[{ value: 'all', label: 'Todos clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
                      placeholder="Todos clientes"
                      searchPlaceholder="Buscar cliente..."
                      triggerClassName="w-[180px] h-8 text-xs"
                    />
                  )}

                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-7 h-8 w-[160px] text-xs"
                      placeholder="Buscar NF..."
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
                {loadingInvoices ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma NF encontrada</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                         <TableRow>
                          <TableHead className="text-xs">Nº NF</TableHead>
                          <TableHead className="text-xs">{tab === 'entrada' ? 'Fornecedor' : 'Cliente'}</TableHead>
                          {tab === 'saida' && <TableHead className="text-xs">Tipo</TableHead>}
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs text-right">Peso (kg)</TableHead>
                          {canSeeFinancial && <TableHead className="text-xs text-right">Valor (R$)</TableHead>}
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map(inv => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs font-medium">{inv.invoice_number}</TableCell>
                            <TableCell className="text-xs">{inv.buyer_name || inv.client_name || '—'}</TableCell>
                            {tab === 'saida' && <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{TYPE_LABELS[inv.type as InvoiceType] || inv.type}</Badge></TableCell>}
                            <TableCell className="text-xs">
                              {inv.issue_date ? format(parse(inv.issue_date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(Number(inv.total_weight_kg), 2)}</TableCell>
                            {canSeeFinancial && <TableCell className="text-xs text-right">{formatCurrency(Number(inv.total_value || 0))}</TableCell>}
                            <TableCell>
                              <Badge className={cn('text-[10px]', STATUS_COLORS[inv.status])}>{STATUS_LABELS[inv.status]}</Badge>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
          );
        })}

        {/* ===== SALDO DE FIOS TAB ===== */}
        <TabsContent value="saldo" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Recebido</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoKpis.received)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Scale className="h-3.5 w-3.5" />Consumido</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(saldoKpis.consumed)}</p>
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
                  value={saldoClient === 'all' ? '' : saldoClient}
                  onValueChange={v => setSaldoClient(v || 'all')}
                  options={[{ value: 'all', label: 'Todos clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="Todos clientes"
                  searchPlaceholder="Buscar cliente..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                <SearchableSelect
                  value={saldoYarn === 'all' ? '' : saldoYarn}
                  onValueChange={v => setSaldoYarn(v || 'all')}
                  options={[{ value: 'all', label: 'Todos os fios' }, ...yarnTypes.map(y => ({ value: y.id, label: y.name }))]}
                  placeholder="Todos os fios"
                  searchPlaceholder="Buscar fio..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(saldoClient !== 'all' || saldoYarn !== 'all' || saldoMonth !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSaldoClient('all'); setSaldoYarn('all'); setSaldoMonth('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Grouped by client */}
          {yarnBalance.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum dado de fio encontrado. Registre NFs de entrada e vincule tipos de fio aos artigos para ver o saldo.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {yarnBalance.map(group => (
                <Collapsible key={group.clientId} defaultOpen>
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                          <CardTitle className="text-sm font-semibold">{group.clientName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Recebido: <span className="font-semibold text-foreground">{formatWeight(group.totalReceived)}</span></span>
                          <span>Saldo: <span className={cn('font-semibold', group.totalBalance < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalBalance)}</span></span>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Tipo de Fio</TableHead>
                              <TableHead className="text-xs text-right">Recebido</TableHead>
                              <TableHead className="text-xs text-right">Consumido</TableHead>
                              <TableHead className="text-xs text-right">Vendido</TableHead>
                              <TableHead className="text-xs text-right font-bold">Saldo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.yarns.map(y => (
                              <TableRow key={y.yarnId}>
                                <TableCell className="text-xs">{y.yarnName}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(y.received)}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(y.consumed)}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(y.sold)}</TableCell>
                                <TableCell className={cn('text-xs text-right font-bold', y.balance < 0 ? 'text-destructive' : y.balance === 0 ? 'text-muted-foreground' : 'text-success')}>
                                  {formatWeight(y.balance)}
                                  {y.balance < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/30 font-semibold">
                              <TableCell className="text-xs">TOTAL</TableCell>
                              <TableCell className="text-xs text-right">{formatWeight(group.totalReceived)}</TableCell>
                              <TableCell className="text-xs text-right">{formatWeight(group.totalConsumed)}</TableCell>
                              <TableCell className="text-xs text-right">{formatWeight(group.totalSold)}</TableCell>
                              <TableCell className={cn('text-xs text-right', group.totalBalance < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalBalance)}</TableCell>
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
                  options={[{ value: 'all', label: 'Todos os fios' }, ...yarnTypes.map(y => ({ value: y.id, label: y.name }))]}
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
                <Table>
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
        <TabsContent value="estoque" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="h-3.5 w-3.5" />Produzido</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(estoqueKpis.producedKg)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Truck className="h-3.5 w-3.5" />Entregue</div>
              <p className="text-xl font-bold text-foreground">{formatWeight(estoqueKpis.deliveredKg)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Warehouse className="h-3.5 w-3.5" />Em Estoque</div>
              <p className={cn('text-xl font-bold', estoqueKpis.stockKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(estoqueKpis.stockKg)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Layers className="h-3.5 w-3.5" />Rolos em Estoque</div>
              <p className={cn('text-xl font-bold', estoqueKpis.stockRolls < 0 ? 'text-destructive' : 'text-success')}>{formatNumber(estoqueKpis.stockRolls)}</p>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={estoqueMonth} onValueChange={setEstoqueMonth}>
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
                  value={estoqueClient === 'all' ? '' : estoqueClient}
                  onValueChange={v => setEstoqueClient(v || 'all')}
                  options={[{ value: 'all', label: 'Todos clientes' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="Todos clientes"
                  searchPlaceholder="Buscar cliente..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                <SearchableSelect
                  value={estoqueArticle === 'all' ? '' : estoqueArticle}
                  onValueChange={v => setEstoqueArticle(v || 'all')}
                  options={[{ value: 'all', label: 'Todos artigos' }, ...articles.map(a => ({ value: a.id, label: a.name }))]}
                  placeholder="Todos artigos"
                  searchPlaceholder="Buscar artigo..."
                  triggerClassName="w-[220px] h-8 text-xs"
                />
                {(estoqueClient !== 'all' || estoqueArticle !== 'all' || estoqueMonth !== 'all') && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setEstoqueClient('all'); setEstoqueArticle('all'); setEstoqueMonth('all'); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Grouped by client */}
          {malhaEstoque.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum dado de estoque encontrado. Registre produção e NFs de saída para ver o estoque de malha.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {malhaEstoque.map(group => (
                <Collapsible key={group.clientId}>
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                          <CardTitle className="text-sm font-semibold">{group.clientName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Produzido: <span className="font-semibold text-foreground">{formatWeight(group.totalProducedKg)}</span></span>
                          <span>Estoque: <span className={cn('font-semibold', group.totalStockKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalStockKg)}</span></span>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Artigo</TableHead>
                              <TableHead className="text-xs text-right">Produzido kg</TableHead>
                              <TableHead className="text-xs text-right">Rolos</TableHead>
                              <TableHead className="text-xs text-right">Entregue kg</TableHead>
                              <TableHead className="text-xs text-right">Rolos</TableHead>
                              <TableHead className="text-xs text-right font-bold">Estoque kg</TableHead>
                              <TableHead className="text-xs text-right font-bold">Rolos</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.articles.map(a => (
                              <TableRow key={a.articleId}>
                                <TableCell className="text-xs">{a.articleName}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(a.producedKg)}</TableCell>
                                <TableCell className="text-xs text-right">{formatNumber(a.producedRolls)}</TableCell>
                                <TableCell className="text-xs text-right">{formatWeight(a.deliveredKg)}</TableCell>
                                <TableCell className="text-xs text-right">{formatNumber(a.deliveredRolls)}</TableCell>
                                <TableCell className={cn('text-xs text-right font-bold', a.stockKg < 0 ? 'text-destructive' : a.stockKg === 0 ? 'text-muted-foreground' : 'text-success')}>
                                  {formatWeight(a.stockKg)}
                                  {a.stockKg < 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">Alerta</Badge>}
                                </TableCell>
                                <TableCell className={cn('text-xs text-right font-bold', a.stockRolls < 0 ? 'text-destructive' : a.stockRolls === 0 ? 'text-muted-foreground' : 'text-success')}>
                                  {formatNumber(a.stockRolls)}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/30 font-semibold">
                              <TableCell className="text-xs">TOTAL</TableCell>
                              <TableCell className="text-xs text-right">{formatWeight(group.totalProducedKg)}</TableCell>
                              <TableCell className="text-xs text-right">{formatNumber(group.totalProducedRolls)}</TableCell>
                              <TableCell className="text-xs text-right">{formatWeight(group.totalDeliveredKg)}</TableCell>
                              <TableCell className="text-xs text-right">{formatNumber(group.totalDeliveredRolls)}</TableCell>
                              <TableCell className={cn('text-xs text-right', group.totalStockKg < 0 ? 'text-destructive' : 'text-success')}>{formatWeight(group.totalStockKg)}</TableCell>
                              <TableCell className={cn('text-xs text-right', group.totalStockRolls < 0 ? 'text-destructive' : 'text-success')}>{formatNumber(group.totalStockRolls)}</TableCell>
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
                  options={[{ value: 'all', label: 'Todos os fios' }, ...yarnTypes.map(y => ({ value: y.id, label: y.name }))]}
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
          {loadingYarnStock ? (
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
                        <Table>
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
           <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tipos de Fio Cadastrados</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 h-8 w-[180px] text-xs"
                    placeholder="Buscar fio..."
                    value={yarnSearchTerm}
                    onChange={e => setYarnSearchTerm(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={() => { setEditingYarn(null); setYarnName(''); setYarnComposition(''); setYarnColor(''); setYarnObs(''); setYarnDialogOpen(true); }} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Novo Fio
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingYarns ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : yarnTypes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum tipo de fio cadastrado</div>
              ) : (
                <Table>
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
                    <Label className="text-xs">Cliente *</Label>
                    <SearchableSelect
                      value={formClientId}
                      onValueChange={setFormClientId}
                      options={clients.map(c => ({ value: c.id, label: c.name }))}
                      placeholder="Selecione..."
                      searchPlaceholder="Buscar..."
                      triggerClassName="h-9 text-xs"
                    />
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
              <div>
                <Label className="text-xs">Nº da NF *</Label>
                <Input className="h-9 text-xs" inputMode="numeric" value={formInvoiceNumber} onChange={e => setFormInvoiceNumber(e.target.value.replace(/\D/g, ''))} placeholder="Ex: 12345" />
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
                        <SearchableSelect
                          value={item.article_id || ''}
                          onValueChange={v => updateItem(idx, 'article_id', v)}
                          options={(formClientId ? clientArticles : articles).map(a => ({ value: a.id, label: `${a.name}${a.client_name ? ` (${a.client_name})` : ''}` }))}
                          placeholder="Selecione..."
                          triggerClassName="h-8 text-xs"
                        />
                      ) : (
                        <SearchableSelect
                          value={item.yarn_type_id || ''}
                          onValueChange={v => updateItem(idx, 'yarn_type_id', v)}
                          options={yarnTypes.map(y => ({ value: y.id, label: y.name }))}
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
                    {formType === 'saida' && (
                      <div className="col-span-2">
                        <Label className="text-[10px]">Rolos</Label>
                        <Input className="h-8 text-xs" inputMode="numeric" type="number" min="0" value={item.quantity_rolls} onChange={e => updateItem(idx, 'quantity_rolls', e.target.value)} onKeyDown={e => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }} />
                      </div>
                    )}
                    {(formType === 'saida' || formType === 'venda_fio') && canSeeFinancial && (
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
                    {canSeeFinancial && (formType === 'saida' || formType === 'venda_fio') && (
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
                {canSeeFinancial && (formType === 'saida' || formType === 'venda_fio') && (
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
                <div><span className="text-muted-foreground text-xs">{viewingInvoice.type === 'entrada' ? 'Fornecedor:' : 'Cliente:'}</span><br />{viewingInvoice.buyer_name || viewingInvoice.client_name || '—'}</div>
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
                      {viewingInvoice.type === 'saida' && <TableHead className="text-xs text-right">Rolos</TableHead>}
                      {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableHead className="text-xs text-right">Caixas</TableHead>}
                      {canSeeFinancial && <TableHead className="text-xs text-right">R$/kg</TableHead>}
                      {canSeeFinancial && <TableHead className="text-xs text-right">Subtotal</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewItems.map(it => (
                      <TableRow key={it.id}>
                        <TableCell className="text-xs">{it.article_name || it.yarn_type_name || '—'}</TableCell>
                        {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableCell className="text-xs">{it.brand || '—'}</TableCell>}
                        <TableCell className="text-xs text-right">{formatNumber(Number(it.weight_kg), 2)}</TableCell>
                        {viewingInvoice.type === 'saida' && <TableCell className="text-xs text-right">{formatNumber(Number(it.quantity_rolls))}</TableCell>}
                        {(viewingInvoice.type === 'entrada' || viewingInvoice.type === 'venda_fio') && <TableCell className="text-xs text-right">{formatNumber(Number(it.quantity_boxes))}</TableCell>}
                        {canSeeFinancial && <TableCell className="text-xs text-right">{formatCurrency(Number(it.value_per_kg))}</TableCell>}
                        {canSeeFinancial && <TableCell className="text-xs text-right">{formatCurrency(Number(it.subtotal))}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-xs text-muted-foreground">
                Registrado por: {viewingInvoice.created_by_name || '—'} em {viewingInvoice.created_at ? format(new Date(viewingInvoice.created_at), 'dd/MM/yyyy HH:mm') : '—'}
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
                  options={yarnTypes.map(y => ({ value: y.id, label: y.name }))}
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
        title="Cancelar Nota Fiscal"
        description={`Tem certeza que deseja cancelar a NF ${cancelConfirmInvoice?.invoice_number}?`}
        onConfirm={() => { if (cancelConfirmInvoice) handleCancelInvoice(cancelConfirmInvoice); setCancelConfirmInvoice(null); }}
        confirmLabel="Cancelar NF"
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
