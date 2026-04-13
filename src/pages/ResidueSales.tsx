import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, getDateLimits, isDateValid } from '@/lib/formatters';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { SearchableSelect } from '@/components/SearchableSelect';
import {
  Plus, Trash2, Edit, Loader2, Package, DollarSign, Scale, Search,
  Recycle, Download, Hash, CalendarIcon, Users, ChevronDown, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, getFriendlyErrorMessage } from '@/lib/utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const sb = (table: string) => (supabase.from as any)(table);

interface ResidueMaterial {
  id: string;
  company_id: string;
  name: string;
  unit: string;
  default_price: number;
  created_at: string;
}

interface ResidueClient {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

interface ResidueClientPrice {
  id: string;
  company_id: string;
  client_id: string;
  material_id: string;
  unit_price: number;
  created_at: string;
}

interface ResidueSale {
  id: string;
  company_id: string;
  client_id: string | null;
  material_id: string;
  material_name: string | null;
  client_name: string;
  date: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  romaneio: string | null;
  observations: string | null;
  created_by_name: string | null;
  created_by_code: string | null;
  created_at: string;
}

export default function ResidueSales() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  const { userCode, userName, logAction } = useAuditLog();
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [deleteMatConfirmId, setDeleteMatConfirmId] = useState<string | null>(null);
  const [deleteSaleConfirmId, setDeleteSaleConfirmId] = useState<string | null>(null);
  const [deleteClientConfirmId, setDeleteClientConfirmId] = useState<string | null>(null);
  const [deletePriceConfirmId, setDeletePriceConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    sb('companies').select('name, logo_url').eq('id', companyId).maybeSingle().then(({ data }: any) => {
      if (data?.name) setCompanyName(data.name);
      if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
    });
  }, [companyId]);

  // ===== Fetch Materials =====
  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ['residue_materials', companyId],
    queryFn: async () => {
      const { data, error } = await sb('residue_materials')
        .select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return (data || []) as ResidueMaterial[];
    },
    enabled: !!companyId,
  });

  // ===== Fetch Clients =====
  const { data: residueClients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['residue_clients', companyId],
    queryFn: async () => {
      const { data, error } = await sb('residue_clients')
        .select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return (data || []) as ResidueClient[];
    },
    enabled: !!companyId,
  });

  // ===== Fetch Client Prices =====
  const { data: clientPrices = [] } = useQuery({
    queryKey: ['residue_client_prices', companyId],
    queryFn: async () => {
      const { data, error } = await sb('residue_client_prices')
        .select('*').eq('company_id', companyId).order('created_at');
      if (error) throw error;
      return (data || []) as ResidueClientPrice[];
    },
    enabled: !!companyId,
  });

  // ===== Fetch Sales =====
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['residue_sales', companyId],
    queryFn: async () => {
      const { data, error } = await sb('residue_sales')
        .select('*').eq('company_id', companyId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ResidueSale[];
    },
    enabled: !!companyId,
  });

  // ===== Material CRUD =====
  const [matDialogOpen, setMatDialogOpen] = useState(false);
  const [editingMat, setEditingMat] = useState<ResidueMaterial | null>(null);
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState('kg');

  const openNewMat = () => { setEditingMat(null); setMatName(''); setMatUnit('kg'); setMatDialogOpen(true); };
  const openEditMat = (m: ResidueMaterial) => {
    setEditingMat(m); setMatName(m.name); setMatUnit(m.unit); setMatDialogOpen(true);
  };

  const saveMat = useMutation({
    mutationFn: async () => {
      if (!matName.trim()) throw new Error('Nome obrigatório');
      if (editingMat) {
        const { error } = await sb('residue_materials').update({ name: matName.trim(), unit: matUnit }).eq('id', editingMat.id);
        if (error) throw error;
      } else {
        const { error } = await sb('residue_materials').insert({ company_id: companyId, name: matName.trim(), unit: matUnit, default_price: 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_materials'] });
      setMatDialogOpen(false);
      logAction(editingMat ? 'residue_material_update' : 'residue_material_create', { name: matName.trim(), unit: matUnit });
      toast({ title: editingMat ? 'Material atualizado' : 'Material cadastrado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deleteMat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('residue_materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, id: string) => {
      const mat = materials.find(m => m.id === id);
      logAction('residue_material_delete', { name: mat?.name });
      queryClient.invalidateQueries({ queryKey: ['residue_materials'] });
      queryClient.invalidateQueries({ queryKey: ['residue_client_prices'] });
      toast({ title: 'Material removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  // ===== Client CRUD =====
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ResidueClient | null>(null);
  const [clientName, setClientName] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // Add price to client
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceClientId, setPriceClientId] = useState('');
  const [priceMaterialId, setPriceMaterialId] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [editingPrice, setEditingPrice] = useState<ResidueClientPrice | null>(null);

  const openNewClient = () => { setEditingClient(null); setClientName(''); setClientDialogOpen(true); };
  const openEditClient = (c: ResidueClient) => { setEditingClient(c); setClientName(c.name); setClientDialogOpen(true); };

  const saveClient = useMutation({
    mutationFn: async () => {
      if (!clientName.trim()) throw new Error('Nome obrigatório');
      if (editingClient) {
        const { error } = await sb('residue_clients').update({ name: clientName.trim() }).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await sb('residue_clients').insert({ company_id: companyId, name: clientName.trim() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_clients'] });
      setClientDialogOpen(false);
      logAction(editingClient ? 'residue_client_update' : 'residue_client_create', { name: clientName.trim() });
      toast({ title: editingClient ? 'Cliente atualizado' : 'Cliente cadastrado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('residue_clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, id: string) => {
      const cl = residueClients.find(c => c.id === id);
      logAction('residue_client_delete', { name: cl?.name });
      queryClient.invalidateQueries({ queryKey: ['residue_clients'] });
      queryClient.invalidateQueries({ queryKey: ['residue_client_prices'] });
      toast({ title: 'Cliente removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  // ===== Client Price CRUD =====
  const openAddPrice = (clientId: string) => {
    setPriceClientId(clientId);
    setPriceMaterialId('');
    setPriceValue('');
    setEditingPrice(null);
    setPriceDialogOpen(true);
  };

  const openEditPrice = (p: ResidueClientPrice) => {
    setPriceClientId(p.client_id);
    setPriceMaterialId(p.material_id);
    setPriceValue(p.unit_price.toFixed(2).replace('.', ','));
    setEditingPrice(p);
    setPriceDialogOpen(true);
  };

  const getClientPrices = (clientId: string) => clientPrices.filter(p => p.client_id === clientId);

  const availableMaterialsForClient = (clientId: string) => {
    const existingIds = getClientPrices(clientId).map(p => p.material_id);
    if (editingPrice) {
      return materials; // when editing, show all
    }
    return materials.filter(m => !existingIds.includes(m.id));
  };

  const savePrice = useMutation({
    mutationFn: async () => {
      if (!priceMaterialId) throw new Error('Selecione um material');
      const price = parseFloat(priceValue.replace(',', '.')) || 0;
      if (price <= 0) throw new Error('Preço deve ser maior que zero');

      if (editingPrice) {
        const { error } = await sb('residue_client_prices').update({ unit_price: price }).eq('id', editingPrice.id);
        if (error) throw error;
      } else {
        const { error } = await sb('residue_client_prices').insert({
          company_id: companyId,
          client_id: priceClientId,
          material_id: priceMaterialId,
          unit_price: price,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_client_prices'] });
      setPriceDialogOpen(false);
      toast({ title: editingPrice ? 'Preço atualizado' : 'Material adicionado ao cliente' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deletePrice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('residue_client_prices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_client_prices'] });
      toast({ title: 'Material removido do cliente' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  // ===== Sale CRUD =====
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<ResidueSale | null>(null);
  const [saleClientId, setSaleClientId] = useState('');
  const [saleMaterialId, setSaleMaterialId] = useState('');
  const [saleQty, setSaleQty] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleRomaneio, setSaleRomaneio] = useState('');
  const [saleObs, setSaleObs] = useState('');
  const [saleDate, setSaleDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const saleClientPrices = useMemo(() => {
    if (!saleClientId) return [];
    return clientPrices.filter(p => p.client_id === saleClientId);
  }, [saleClientId, clientPrices]);

  const saleClientMaterials = useMemo(() => {
    return saleClientPrices.map(cp => {
      const mat = materials.find(m => m.id === cp.material_id);
      return mat ? { ...mat, clientPrice: cp.unit_price } : null;
    }).filter(Boolean) as (ResidueMaterial & { clientPrice: number })[];
  }, [saleClientPrices, materials]);

  const selectedSaleMaterial = saleClientMaterials.find(m => m.id === saleMaterialId);

  const openNewSale = () => {
    setEditingSale(null);
    setSaleClientId(''); setSaleMaterialId(''); setSaleQty(''); setSalePrice('');
    setSaleRomaneio(''); setSaleObs(''); setSaleDate(format(new Date(), 'yyyy-MM-dd'));
    setSaleDialogOpen(true);
  };

  const openEditSale = (s: ResidueSale) => {
    setEditingSale(s);
    setSaleClientId(s.client_id || '');
    setSaleDate(s.date);
    setSaleRomaneio(s.romaneio || '');
    setSaleObs(s.observations || '');
    // Delay setting material/price so the client effect doesn't clear them
    setTimeout(() => {
      setSaleMaterialId(s.material_id);
      setSaleQty(formatNumber(s.quantity, 2).replace('.', ''));
      setSalePrice(s.unit_price.toFixed(2).replace('.', ','));
    }, 50);
    setSaleDialogOpen(true);
  };

  // When material changes in sale, update price from client price
  useEffect(() => {
    const cp = saleClientPrices.find(p => p.material_id === saleMaterialId);
    if (cp) {
      setSalePrice(cp.unit_price.toFixed(2).replace('.', ','));
    }
  }, [saleMaterialId, saleClientPrices]);

  // When client changes, reset material
  useEffect(() => {
    setSaleMaterialId('');
    setSalePrice('');
  }, [saleClientId]);

  const parseBR = (v: string) => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;

  const saleTotal = useMemo(() => {
    return parseBR(saleQty) * parseBR(salePrice);
  }, [saleQty, salePrice]);

  const saveSale = useMutation({
    mutationFn: async () => {
      if (!saleClientId) throw new Error('Selecione um cliente');
      if (!saleMaterialId) throw new Error('Selecione um material');
      if (!saleDate) throw new Error('Data obrigatória');
      if (!isDateValid(saleDate)) throw new Error('Data fora do intervalo permitido (±5 anos)');
      const qty = parseBR(saleQty);
      const price = parseBR(salePrice);
      if (qty <= 0) throw new Error('Quantidade deve ser maior que zero');
      if (price <= 0) throw new Error('Preço deve ser maior que zero');

      const mat = materials.find(m => m.id === saleMaterialId)!;
      const client = residueClients.find(c => c.id === saleClientId)!;

      if (editingSale) {
        const { error } = await sb('residue_sales').update({
          client_id: saleClientId,
          material_id: saleMaterialId,
          material_name: mat.name,
          client_name: client.name,
          date: saleDate,
          quantity: qty,
          unit: mat.unit,
          unit_price: price,
          total: qty * price,
          romaneio: saleRomaneio.trim() || null,
          observations: saleObs.trim() || null,
        }).eq('id', editingSale.id);
        if (error) throw error;
      } else {
        const { error } = await sb('residue_sales').insert({
          company_id: companyId,
          client_id: saleClientId,
          material_id: saleMaterialId,
          material_name: mat.name,
          client_name: client.name,
          date: saleDate,
          quantity: qty,
          unit: mat.unit,
          unit_price: price,
          total: qty * price,
          romaneio: saleRomaneio.trim() || null,
          observations: saleObs.trim() || null,
          created_by_name: userName || null,
          created_by_code: userCode || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_sales'] });
      const actionName = editingSale ? 'residue_sale_update' : 'residue_sale_create';
      logAction(actionName, {
        material: materials.find(m => m.id === saleMaterialId)?.name,
        client: residueClients.find(c => c.id === saleClientId)?.name,
        date: saleDate,
      });
      if (!editingSale) {
        setSaleMaterialId(''); setSaleQty(''); setSalePrice('');
        setSaleRomaneio(''); setSaleObs('');
      } else {
        setSaleDialogOpen(false);
      }
      toast({ title: editingSale ? 'Venda atualizada' : 'Venda registrada' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('residue_sales').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, id: string) => {
      const sale = sales.find(s => s.id === id);
      logAction('residue_sale_delete', { material: sale?.material_name, client: sale?.client_name });
      queryClient.invalidateQueries({ queryKey: ['residue_sales'] });
      toast({ title: 'Registro removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  // ===== Filters =====
  const [filterMonth, setFilterMonth] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [searchText, setSearchText] = useState('');

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    sales.forEach(s => {
      if (s.date && s.date.length >= 7) {
        const ym = s.date.substring(0, 7);
        const year = parseInt(ym.substring(0, 4));
        if (year >= 2020 && year <= 2099) months.add(ym);
      }
    });
    const now = format(new Date(), 'yyyy-MM');
    months.add(now);
    return Array.from(months).sort().reverse();
  }, [sales]);

  const filteredSales = useMemo(() => {
    let filtered = sales;
    if (filterMonth !== 'all') {
      filtered = filtered.filter(s => s.date.startsWith(filterMonth));
    }
    if (dateFrom) {
      const from = format(dateFrom, 'yyyy-MM-dd');
      filtered = filtered.filter(s => s.date >= from);
    }
    if (dateTo) {
      const to = format(dateTo, 'yyyy-MM-dd');
      filtered = filtered.filter(s => s.date <= to);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(s =>
        (s.material_name || '').toLowerCase().includes(q) ||
        s.client_name.toLowerCase().includes(q) ||
        (s.romaneio || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [sales, filterMonth, dateFrom, dateTo, searchText]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const totalValue = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const totalQtyKg = filteredSales.filter(s => s.unit === 'kg').reduce((sum, s) => sum + s.quantity, 0);
    const totalQtyUn = filteredSales.filter(s => s.unit === 'unidade').reduce((sum, s) => sum + s.quantity, 0);
    return { totalValue, totalQtyKg, totalQtyUn, count: filteredSales.length };
  }, [filteredSales]);

  const clearFilters = () => {
    setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); setSearchText('');
  };

  const formatQtyInput = (value: string) => value.replace(/[^\d,.]/g, '');
  const formatPriceInput = (value: string) => value.replace(/[^\d,.]/g, '');

  const { minDate, maxDate } = getDateLimits();

  // ===== PDF Export =====
  const exportPDF = async () => {
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    const colors = {
      grayBg: [249, 250, 251] as [number, number, number],
      border: [229, 231, 235] as [number, number, number],
      textDark: [17, 24, 39] as [number, number, number],
      textMid: [75, 85, 99] as [number, number, number],
    };

    let logoInfo: { data: string; width: number; height: number } | null = null;
    if (companyLogoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = companyLogoUrl; });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        logoInfo = { data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight };
      } catch { /* ignore */ }
    }

    const fitWithinBox = (w: number, h: number, mw: number, mh: number) => {
      if (!w || !h) return { width: mw, height: mh };
      const s = Math.min(mw / w, mh / h);
      return { width: w * s, height: h * s };
    };

    const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    let periodLabel = 'Todo período';
    if (filterMonth !== 'all') {
      const [yr, mo] = filterMonth.split('-');
      const d = new Date(parseInt(yr), parseInt(mo) - 1);
      periodLabel = format(d, 'MMMM yyyy', { locale: ptBR });
    } else if (dateFrom && dateTo) {
      periodLabel = `${format(dateFrom, 'dd/MM/yyyy')} — ${format(dateTo, 'dd/MM/yyyy')}`;
    }

    const headerH = 25;
    const leftX = margin + 5;
    const rightX = pw - margin - 5;
    const reportTitle = 'Vendas de Resíduos';

    pdf.setFillColor(...colors.grayBg);
    pdf.rect(margin, y, pw - 2 * margin, headerH, 'F');
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, pw - 2 * margin, headerH, 'S');

    if (logoInfo) {
      try {
        const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
        pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
      } catch {
        if (companyName) { pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark); pdf.text(sanitizePdfText(companyName), leftX, y + 10); }
      }
    } else if (companyName) {
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
      pdf.text(sanitizePdfText(companyName), leftX, y + 10);
    }
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textMid);
    pdf.text(dateStr, leftX, y + 22);

    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
    const titleW = pdf.getTextWidth(reportTitle);
    pdf.text(reportTitle, (pw - titleW) / 2, y + 14);

    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textMid);
    const pLabelW = pdf.getTextWidth(periodLabel);
    pdf.text(periodLabel, rightX - pLabelW, y + 22);

    y += headerH + 10;

    const rows = filteredSales.map(s => [
      s.date.split('-').reverse().join('/'),
      s.material_name || '-',
      s.client_name,
      `${formatNumber(s.quantity, 2)} ${s.unit === 'kg' ? 'kg' : 'un'}`,
      formatCurrency(s.unit_price),
      formatCurrency(s.total),
      s.romaneio || '-',
    ]);

    autoTable(pdf, {
      startY: y,
      head: [['Data', 'Material', 'Cliente', 'Qtd', 'Preço Unit.', 'Total', 'Romaneio']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: margin, right: margin },
    });

    const finalY = (pdf as any).lastAutoTable?.finalY || y;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...colors.textDark);
    pdf.text(`Total: ${formatCurrency(kpis.totalValue)} | Registros: ${kpis.count}`, margin, finalY + 8);

    pdf.save(`vendas-residuos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF exportado' });
  };

  // Check if any client has materials configured
  const hasClientsWithMaterials = residueClients.some(c => getClientPrices(c.id).length > 0);

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Recycle className="h-6 w-6 text-primary" />
            Vendas de Resíduos
          </h1>
          <p className="text-sm text-muted-foreground">Controle de vendas de papelão, plástico, óleo e outros materiais</p>
        </div>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Registros de Venda</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="materials">Materiais</TabsTrigger>
        </TabsList>

        {/* ======= CLIENTES TAB ======= */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Clientes de Resíduos
              </CardTitle>
              <Button size="sm" onClick={openNewClient}>
                <Plus className="h-4 w-4 mr-1" /> Novo Cliente
              </Button>
            </CardHeader>
            <CardContent>
              {loadingClients ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : residueClients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {residueClients.map(c => {
                    const prices = getClientPrices(c.id);
                    const isExpanded = expandedClientId === c.id;
                    return (
                      <Card key={c.id} className="border">
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedClientId(isExpanded ? null : c.id)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            <span className="font-medium">{c.name}</span>
                            <Badge variant="outline" className="text-xs">{prices.length} {prices.length === 1 ? 'material' : 'materiais'}</Badge>
                          </div>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditClient(c)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteClientConfirmId(c.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t">
                            <div className="mt-3 mb-2 flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">Materiais e Preços</span>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddPrice(c.id)} disabled={availableMaterialsForClient(c.id).length === 0}>
                                <Plus className="h-3 w-3 mr-1" /> Material
                              </Button>
                            </div>
                            {prices.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">Nenhum material configurado. Adicione materiais e seus preços.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Material</TableHead>
                                    <TableHead className="text-xs">Unidade</TableHead>
                                    <TableHead className="text-xs">Preço</TableHead>
                                    <TableHead className="text-xs w-[80px]">Ações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {prices.map(p => {
                                    const mat = materials.find(m => m.id === p.material_id);
                                    return (
                                      <TableRow key={p.id}>
                                        <TableCell className="text-sm">{mat?.name || '?'}</TableCell>
                                        <TableCell className="text-sm">
                                          <Badge variant="outline" className="text-xs">{mat?.unit === 'kg' ? 'kg' : 'un'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm">{formatCurrency(p.unit_price)}/{mat?.unit === 'kg' ? 'kg' : 'un'}</TableCell>
                                        <TableCell>
                                          <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditPrice(p)}>
                                              <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeletePriceConfirmId(p.id)}>
                                              <Trash2 className="h-3 w-3 text-destructive" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======= MATERIAIS TAB ======= */}
        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Catálogo de Materiais
              </CardTitle>
              <Button size="sm" onClick={openNewMat}>
                <Plus className="h-4 w-4 mr-1" /> Novo Material
              </Button>
            </CardHeader>
            <CardContent>
              {loadingMaterials ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : materials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum material cadastrado</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materials.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.unit === 'kg' ? 'Quilograma (kg)' : 'Unidade (un)'}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditMat(m)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteMatConfirmId(m.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
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

        {/* ======= REGISTROS DE VENDA TAB ======= */}
        <TabsContent value="sales" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Vendido</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatCurrency(kpis.totalValue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Scale className="h-4 w-4" />
                  <span className="text-xs font-medium">Peso (kg)</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatNumber(kpis.totalQtyKg, 1)} kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Package className="h-4 w-4" />
                  <span className="text-xs font-medium">Unidades</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatNumber(kpis.totalQtyUn, 0)} un</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Hash className="h-4 w-4" />
                  <span className="text-xs font-medium">Registros</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{kpis.count}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <Select value={filterMonth} onValueChange={v => { setFilterMonth(v); setDateFrom(undefined); setDateTo(undefined); }}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {availableMonths.map(ym => {
                    const [y, m] = ym.split('-');
                    const d = new Date(parseInt(y), parseInt(m) - 1);
                    return <SelectItem key={ym} value={ym}>{format(d, 'MMMM yyyy', { locale: ptBR })}</SelectItem>;
                  })}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", dateFrom && "text-primary border-primary")}>
                    <CalendarIcon className="h-3 w-3" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); setFilterMonth('all'); }} /></PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", dateTo && "text-primary border-primary")}>
                    <CalendarIcon className="h-3 w-3" />
                    {dateTo ? format(dateTo, 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d); setFilterMonth('all'); }} /></PopoverContent>
              </Popover>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="pl-7 h-8 text-xs w-[150px]"
                />
              </div>

              {(filterMonth !== 'all' || dateFrom || dateTo || searchText) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>Limpar</Button>
              )}

              <div className="flex-1" />

              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportPDF} disabled={filteredSales.length === 0}>
                <Download className="h-3 w-3" /> PDF
              </Button>

              <Button size="sm" className="h-8 text-xs" onClick={openNewSale} disabled={!hasClientsWithMaterials}>
                <Plus className="h-4 w-4 mr-1" /> Nova Venda
              </Button>
            </CardContent>
          </Card>

          {/* Sales Table */}
          <Card>
            <CardContent className="p-0">
              {loadingSales ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filteredSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {!hasClientsWithMaterials
                    ? 'Cadastre clientes e seus materiais/preços na aba "Clientes" primeiro'
                    : 'Nenhum registro encontrado'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Romaneio</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {s.date.split('-').reverse().join('/')}
                            <br />
                            <span className="text-muted-foreground">
                              {s.created_at ? format(new Date(s.created_at), 'HH:mm') : ''}
                            </span>
                            {s.created_by_name && (
                              <>
                                <br />
                                <span className="text-muted-foreground">
                                  {s.created_by_name}{s.created_by_code ? ` #${s.created_by_code}` : ''}
                                </span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{s.material_name || '-'}</TableCell>
                          <TableCell>{s.client_name}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(s.quantity, 2)} {s.unit === 'kg' ? 'kg' : 'un'}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(s.unit_price)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(s.total)}</TableCell>
                          <TableCell>{s.romaneio || '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditSale(s)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteSaleConfirmId(s.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
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
      </Tabs>

      {/* ===== Material Dialog ===== */}
      <Dialog open={matDialogOpen} onOpenChange={setMatDialogOpen}>
        <DialogContent className="max-w-sm" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingMat ? 'Editar Material' : 'Novo Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={matName} onChange={e => setMatName(e.target.value)} placeholder="Ex: Papelão" />
            </div>
            <div>
              <Label>Unidade de Medida *</Label>
              <Select value={matUnit} onValueChange={setMatUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Quilograma (kg)</SelectItem>
                  <SelectItem value="unidade">Unidade (un)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveMat.mutate()} disabled={saveMat.isPending}>
              {saveMat.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Client Dialog ===== */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-sm" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ex: Reciclagem ABC" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveClient.mutate()} disabled={saveClient.isPending}>
              {saveClient.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Price Dialog ===== */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-sm" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingPrice ? 'Editar Preço' : 'Adicionar Material ao Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Material *</Label>
              <Select value={priceMaterialId} onValueChange={setPriceMaterialId} disabled={!!editingPrice}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {availableMaterialsForClient(priceClientId).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preço (R$/{(() => { const mat = materials.find(m => m.id === priceMaterialId); return mat?.unit === 'unidade' ? 'un' : 'kg'; })()}) *</Label>
              <Input value={priceValue} onChange={e => setPriceValue(formatPriceInput(e.target.value))} placeholder="0,00" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => savePrice.mutate()} disabled={savePrice.isPending}>
              {savePrice.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Sale Dialog ===== */}
      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-[80vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Registrar Venda de Resíduo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={saleDate} min={minDate} max={maxDate}
                onChange={e => setSaleDate(e.target.value)} />
            </div>
            <div>
              <Label>Cliente *</Label>
              <SearchableSelect
                value={saleClientId}
                onValueChange={setSaleClientId}
                placeholder="Selecione o cliente..."
                options={residueClients.map(c => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <Label>Material *</Label>
              {saleClientId ? (
                <SearchableSelect
                  value={saleMaterialId}
                  onValueChange={setSaleMaterialId}
                  placeholder="Selecione o material..."
                  options={saleClientMaterials.map(m => ({ value: m.id, label: `${m.name} (${m.unit})` }))}
                />
              ) : (
                <Input disabled placeholder="Selecione um cliente primeiro" className="text-muted-foreground" />
              )}
            </div>
            <div>
              <Label>{selectedSaleMaterial?.unit === 'unidade' ? 'Quantidade (un) *' : 'Peso (kg) *'}</Label>
              <Input value={saleQty} onChange={e => setSaleQty(formatQtyInput(e.target.value))}
                placeholder={selectedSaleMaterial?.unit === 'unidade' ? '0' : '0,00'} />
            </div>
            <div>
              <Label>Preço (R$/{selectedSaleMaterial?.unit === 'unidade' ? 'un' : 'kg'}) *</Label>
              <Input value={salePrice} onChange={e => setSalePrice(formatPriceInput(e.target.value))} placeholder="0,00" />
            </div>
            <div>
              <Label>Nº Romaneio</Label>
              <Input value={saleRomaneio} onChange={e => setSaleRomaneio(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={saleObs} onChange={e => setSaleObs(e.target.value)} placeholder="Opcional" rows={2} />
            </div>
          </div>

          {saleMaterialId && parseBR(saleQty) > 0 && parseBR(salePrice) > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total:</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(saleTotal)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
            <Button onClick={() => saveSale.mutate()} disabled={saveSale.isPending}>
              {saveSale.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteMatConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteMatConfirmId(null); }}
        title="Remover material"
        description="Tem certeza que deseja remover este material? Isso removerá também os preços vinculados a clientes."
        onConfirm={() => { if (deleteMatConfirmId) deleteMat.mutate(deleteMatConfirmId); setDeleteMatConfirmId(null); }}
      />
      <DeleteConfirmDialog
        open={!!deleteSaleConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteSaleConfirmId(null); }}
        title="Remover registro de venda"
        description="Tem certeza que deseja remover este registro de venda? Esta ação não pode ser desfeita."
        onConfirm={() => { if (deleteSaleConfirmId) deleteSale.mutate(deleteSaleConfirmId); setDeleteSaleConfirmId(null); }}
      />
      <DeleteConfirmDialog
        open={!!deleteClientConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteClientConfirmId(null); }}
        title="Remover cliente"
        description="Tem certeza que deseja remover este cliente? Os preços vinculados serão removidos também."
        onConfirm={() => { if (deleteClientConfirmId) deleteClient.mutate(deleteClientConfirmId); setDeleteClientConfirmId(null); }}
      />
      <DeleteConfirmDialog
        open={!!deletePriceConfirmId}
        onOpenChange={(v) => { if (!v) setDeletePriceConfirmId(null); }}
        title="Remover material do cliente"
        description="Tem certeza que deseja remover este material e seu preço deste cliente?"
        onConfirm={() => { if (deletePriceConfirmId) deletePrice.mutate(deletePriceConfirmId); setDeletePriceConfirmId(null); }}
      />
    </div>
  );
}
