import { useState, useMemo } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useBillingOrders, type BillingOrderStatus } from '@/hooks/useBillingOrders';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus, Play, CheckCircle2, Truck, Loader2, AlertTriangle, MessageSquare, Printer, Pencil, Ban, History } from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/SearchableSelect';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import { sanitizePdfText } from '@/lib/pdfUtils';

const BillingOrders = () => {
  const { user, profile } = useAuth();
  const { role } = usePermissions();
  const { toast } = useToast();
  const { getClients, getArticles, getMachines } = useSharedCompanyData();
  const { orders, isLoading, createOrder, updateStatus, editOrder } = useBillingOrders();

  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState<BillingOrderStatus | 'all' | 'priority_tab'>('open');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState<any>(null);
  const [showPriorityModal, setShowPriorityModal] = useState<any>(null);
  const [showCollectConfirm, setShowCollectConfirm] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editForm, setEditForm] = useState<any>({
    of_number: '', client_id: '', article_id: '', machine_id: '',
    pieces_expected: '', weight_expected: '', dyehouse: '',
    order_type: 'pieces', edit_note: ''
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

  const [form, setForm] = useState({
    of_number: '',
    client_id: '',
    article_id: '',
    machine_id: '',
    pieces_expected: '',
    dyehouse: '',
    weight_expected: '',
    order_type: 'pieces' as 'pieces' | 'weight',
  });

  const [launchForm, setLaunchForm] = useState({
    pieces_real: '',
    weight_real: ''
  });

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.client?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.dyehouse.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.of_number.includes(searchTerm);
      
      if (activeTab === 'all') return matchesSearch;
      
      if (activeTab === 'priority_tab') {
        return order.priority && order.status === 'open' && matchesSearch;
      }

      // Se for a aba Aberto, garantir que mostre apenas o que não é prioridade e tem status open
      if (activeTab === 'open') {
        return order.status === 'open' && !order.priority && matchesSearch;
      }

      if (order.status !== activeTab) return false;
      if (!matchesSearch) return false;

      // Filtros específicos para "Coletadas"
      if (activeTab === 'collected') {
        const orderDate = new Date(order.created_at);
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

  const stats = useMemo(() => {
    return {
      open: orders.filter(o => o.status === 'open' && !o.priority).length,
      separating: orders.filter(o => o.status === 'separating').length,
      ready: orders.filter(o => o.status === 'ready').length,
      collected: orders.filter(o => o.status === 'collected').length,
      priority: orders.filter(o => o.priority && o.status === 'open').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    };
  }, [orders]);

  const hasPendingPriority = stats.priority > 0;

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

    await createOrder.mutateAsync({
      of_number: form.of_number,
      client_id: form.client_id,
      article_id: form.article_id,
      machine_id: form.machine_id && form.machine_id !== 'none' ? form.machine_id : undefined,
      pieces_expected: form.pieces_expected ? parseInt(form.pieces_expected) : undefined,
      weight_expected: form.weight_expected ? parseFloat(form.weight_expected) : undefined,
      dyehouse: form.dyehouse,
      order_type: form.order_type,
    });
    setShowCreateModal(false);
    setForm({ of_number: '', client_id: '', article_id: '', machine_id: '', pieces_expected: '', dyehouse: '', weight_expected: '', order_type: 'pieces' });
  };

  const openEditModal = (order: any) => {
    setEditForm({
      of_number: order.of_number || '',
      client_id: order.client_id || '',
      article_id: order.article_id || '',
      machine_id: order.machine_id || 'none',
      pieces_expected: order.pieces_expected != null ? String(order.pieces_expected) : '',
      weight_expected: order.weight_expected != null ? String(order.weight_expected) : '',
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
    const changes: any = {
      of_number: editForm.of_number,
      client_id: editForm.client_id,
      article_id: editForm.article_id,
      machine_id: editForm.machine_id && editForm.machine_id !== 'none' ? editForm.machine_id : null,
      pieces_expected: editForm.pieces_expected ? parseInt(editForm.pieces_expected) : null,
      weight_expected: editForm.weight_expected ? parseFloat(editForm.weight_expected) : null,
      dyehouse: editForm.dyehouse,
      order_type: editForm.order_type,
    };
    const note = editForm.edit_note.trim() || `Editado por admin em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
    await editOrder.mutateAsync({ id: showEditModal.id, changes, note, revertToOpen: wasActive });
    setShowEditModal(null);
  };

  const handleCancel = async () => {
    if (!showCancelModal) return;
    if (!cancelReason.trim()) {
      toast({ title: 'Informe o motivo do cancelamento', variant: 'destructive' });
      return;
    }
    await updateStatus.mutateAsync({
      id: showCancelModal.id,
      status: 'cancelled',
      data: { cancellation_reason: cancelReason.trim() },
    });
    setShowCancelModal(null);
    setCancelReason('');
  };

  const handleLaunch = async () => {
    if (!launchForm.pieces_real || !launchForm.weight_real) {
      toast({ title: "Preencha os dados reais", variant: "destructive" });
      return;
    }

    const pieces = parseInt(launchForm.pieces_real);
    const weight = parseFloat(launchForm.weight_real);
    const avg = pieces > 0 ? weight / pieces : 0;

    await updateStatus.mutateAsync({
      id: showLaunchModal.id,
      status: 'ready',
      data: {
        pieces_real: pieces,
        weight_real: weight,
        weight_avg: avg
      }
    });
    setShowLaunchModal(null);
    setLaunchForm({ pieces_real: '', weight_real: '' });
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
            <div class="client">${order.client?.name}</div>
            <div class="dyehouse">(${order.dyehouse})</div>
            <div class="pieces">${order.pieces_real || order.pieces_expected} PEÇAS</div>
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

  const handleAdminPrintPdf = async (order: any) => {
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
        ready: { label: 'PRONTO', color: [5, 150, 105] },
        collected: { label: 'COLETADA', color: [71, 85, 105] },
      };
      const st = statusMap[order.status] || { label: order.status.toUpperCase(), color: [100, 100, 100] as [number, number, number] };
      pdf.setFillColor(...st.color);
      pdf.roundedRect(margin, y, 50, 9, 1.5, 1.5, 'F');
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
      pdf.text(sanitizePdfText(st.label), margin + 25 - pdf.getTextWidth(st.label) / 2, y + 6.2);

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

      drawSection('QUANTIDADES', [
        ['Peças Previstas', String(order.pieces_expected ?? '—')],
        ['Peças Reais', order.pieces_real != null ? String(order.pieces_real) : '—'],
        ['Peso Previsto', order.weight_expected ? `${order.weight_expected} kg` : '—'],
        ['Peso Real', order.weight_real ? `${order.weight_real} kg` : '—'],
        ['Média', order.weight_avg ? `${order.weight_avg.toFixed(2)} kg/peça` : '—'],
      ]);

      if (order.priority_reason) {
        drawSection('PRIORIDADE', [
          ['Motivo', order.priority_reason],
          ['Marcado por', order.prioritizer ? `${order.prioritizer.name} #${order.prioritizer.code}` : '—'],
          ['Marcado em', order.priority_at ? format(new Date(order.priority_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'],
        ]);
      }

      drawSection('AUDITORIA', [
        ['Criado por', order.creator ? `${order.creator.name} #${order.creator.code}` : '—'],
        ['Criado em', format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
        ['Separado por', order.separator ? `${order.separator.name} #${order.separator.code}` : '—'],
        ['Coletado por', order.collector ? `${order.collector.name} #${order.collector.code}` : '—'],
        ['Última atualização', format(new Date(order.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
      ]);

      // Rodapé
      const ph = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...colors.textMid);
      pdf.text(`Documento gerado em ${dateStr} • ${sanitizePdfText(companyName)}`, pw / 2 - 50, ph - 8);

      pdf.save(`OF_${order.of_number}_${order.client?.name?.replace(/\s+/g, '_') || 'cliente'}.pdf`);
    } catch (e: any) {
      toast({ title: 'Erro ao gerar PDF', description: e?.message, variant: 'destructive' });
    }
  };

  // Padronização visual: faixa lateral colorida + fundo neutro do card para máxima legibilidade
  const getStatusStyle = (status: string, isPriority?: boolean) => {
    if (isPriority && status !== 'collected') {
      return { stripe: 'bg-red-600', label: 'PRIORIDADE', badgeClass: 'bg-red-600 text-white border-red-700' };
    }
    switch (status) {
      case 'open':
        return { stripe: 'bg-sky-600', label: 'ABERTO', badgeClass: 'bg-sky-600 text-white border-sky-700' };
      case 'separating':
        return { stripe: 'bg-amber-500', label: 'SEPARANDO', badgeClass: 'bg-amber-500 text-white border-amber-600' };
      case 'ready':
        return { stripe: 'bg-emerald-600', label: 'PRONTO', badgeClass: 'bg-emerald-600 text-white border-emerald-700' };
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
        {isAdmin && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova OF
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 bg-card p-3 rounded-lg border shadow-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Pesquisar por cliente, tinturaria ou OF..." 
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
          <TabsTrigger value="ready" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Pronto <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.ready}</Badge>
          </TabsTrigger>
          <TabsTrigger value="collected" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Coletadas
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Canceladas <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">{stats.cancelled}</Badge>
          </TabsTrigger>
        </TabsList>

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
          {filteredOrders.map((order) => {
            const style = getStatusStyle(order.status, order.priority);
            return (
              <Card
                key={order.id}
                className="relative overflow-hidden border bg-card hover:shadow-md transition-shadow"
              >
                {/* Faixa lateral de status */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.stripe}`} />
                <CardContent className="p-4 pl-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
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
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Artigo</div>
                          <div className="text-foreground font-medium truncate">{order.article?.name || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                            {order.order_type === 'weight' ? 'Peças (info)' : 'Peças'}
                          </div>
                          <div className="text-foreground font-medium">
                            {(order.pieces_real ?? order.pieces_expected) ?? '—'}
                            {order.pieces_real != null && order.pieces_expected != null && order.pieces_real !== order.pieces_expected && (
                              <span className="text-muted-foreground"> / {order.pieces_expected}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Peso Total</div>
                          <div className="text-foreground font-medium">
                            {order.weight_real ? `${order.weight_real} kg` : (order.weight_expected ? `${order.weight_expected} kg` : '—')}
                            {order.weight_real != null && order.weight_expected != null && Number(order.weight_real) !== Number(order.weight_expected) && (
                              <span className="text-muted-foreground"> / {order.weight_expected} kg</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Máquina</div>
                          <div className="text-foreground font-medium truncate">{order.machine?.name || '—'}</div>
                        </div>
                      </div>

                      {order.status === 'ready' && order.weight_avg && (
                        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
                          Média: {order.weight_avg.toFixed(2)} kg/peça
                        </div>
                      )}
                    </div>

                    {/* Coluna ações + auditoria padronizada */}
                    <div className="flex flex-col items-stretch md:items-end gap-2 md:min-w-[200px]">
                      <div className="text-[10px] text-muted-foreground leading-tight md:text-right">
                        <div><span className="font-semibold">Criado:</span> {order.creator?.name} #{order.creator?.code}</div>
                        <div>{format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                        {order.separated_by && (
                          <div className="mt-0.5"><span className="font-semibold">Separado:</span> {order.separator?.name} #{order.separator?.code}</div>
                        )}
                        {order.collected_by && (
                          <div className="mt-0.5"><span className="font-semibold">Coletado:</span> {order.collector?.name} #{order.collector?.code}</div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {/* Imprimir disponível em todas as abas/status */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => isAdmin ? handleAdminPrintPdf(order) : handlePrint(order)}
                        >
                          <Printer className="h-4 w-4" /> Imprimir
                        </Button>

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

                        {order.status === 'open' && role === 'expedicao' && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                            onClick={() => updateStatus.mutate({ id: order.id, status: 'separating' })}
                          >
                            <Play className="h-4 w-4" /> Iniciar Separação
                          </Button>
                        )}
                        {order.status === 'separating' && (role === 'expedicao' || isAdmin) && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => setShowLaunchModal(order)}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Lançar Dados
                          </Button>
                        )}
                        {order.status === 'ready' && (role === 'expedicao' || isAdmin) && (
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
              <Input className="col-span-3" value={form.of_number} onChange={e => setForm({...form, of_number: e.target.value})} placeholder="Ex: 600" />
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
              <Label className="text-right">Peças</Label>
              <Input type="number" className="col-span-3" value={form.pieces_expected} onChange={e => setForm({...form, pieces_expected: e.target.value})} placeholder="Quantidade de peças" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Peso Peça</Label>
              <Input type="number" step="0.01" className="col-span-3" value={form.weight_expected} onChange={e => setForm({...form, weight_expected: e.target.value})} placeholder="Peso estimado (opcional)" />
            </div>
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Peças</Label>
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
              onClick={() => {
                updateStatus.mutate({ id: showCollectConfirm.id, status: 'collected' });
                setShowCollectConfirm(null);
              }}
              disabled={updateStatus.isPending}
            >
              Confirmar Coleta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingOrders;