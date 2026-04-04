import { useState, useMemo, useCallback } from 'react';
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatNumber, formatCurrency, formatWeight } from '@/lib/formatters';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { toast } from 'sonner';

const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtMonth = (m: string) => { const [y, mo] = m.split('-'); return `${monthNames[parseInt(mo)-1]}/${y}`; };

type InvoiceRow = { id: string; type: string; status: string; issue_date: string; client_id: string|null; client_name: string|null; };
type InvoiceItemRow = { invoice_id: string; weight_kg: number; quantity_rolls: number|null; value_per_kg: number|null; subtotal: number|null; yarn_type_id: string|null; yarn_type_name: string|null; article_id: string|null; article_name: string|null; };
type ProductionRow = { date: string; weight_kg: number; rolls_produced: number; revenue: number; article_id: string|null; article_name: string|null; };
type ArticleRow = { id: string; name: string; client_id: string|null; client_name: string|null; yarn_type_id: string|null; value_per_kg: number; };
type OutsourceProdRow = { date: string; outsource_company_id: string; outsource_company_name: string|null; article_id: string; article_name: string|null; client_name: string|null; weight_kg: number; rolls: number; total_revenue: number; total_cost: number; total_profit: number; };
type YarnStockRow = { outsource_company_id: string; yarn_type_id: string; quantity_kg: number; reference_month: string; };
type ResidueSaleRow = { date: string; material_name: string|null; quantity: number; unit: string; total: number; };
type YarnTypeRow = { id: string; name: string; };
type OutsourceCompanyRow = { id: string; name: string; };

const sb = (table: string) => (supabase.from as any)(table);

async function fetchAll(table: string, companyId: string, orderCol: string = 'created_at') {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await sb(table).select('*').eq('company_id', companyId).order(orderCol, { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const isInMonth = (date: string, month: string) => date.startsWith(month);
const isUpToMonth = (date: string, month: string) => date <= `${month}-31`;

export default function Fechamento() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Raw data
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);
  const [productions, setProductions] = useState<ProductionRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [yarnTypes, setYarnTypes] = useState<YarnTypeRow[]>([]);
  const [outsourceProductions, setOutsourceProductions] = useState<OutsourceProdRow[]>([]);
  const [outsourceCompanies, setOutsourceCompanies] = useState<OutsourceCompanyRow[]>([]);
  const [yarnStock, setYarnStock] = useState<YarnStockRow[]>([]);
  const [residueSales, setResidueSales] = useState<ResidueSaleRow[]>([]);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [inv, items, prods, arts, yt, op, oc, ys, rs] = await Promise.all([
        fetchAll('invoices', companyId, 'issue_date'),
        fetchAll('invoice_items', companyId, 'created_at'),
        fetchAll('productions', companyId, 'date'),
        fetchAll('articles', companyId, 'name'),
        fetchAll('yarn_types', companyId, 'name'),
        fetchAll('outsource_productions', companyId, 'date'),
        fetchAll('outsource_companies', companyId, 'name'),
        sb('outsource_yarn_stock').select('*').eq('company_id', companyId).eq('reference_month', selectedMonth).then((r: any) => r.data || []),
        fetchAll('residue_sales', companyId, 'date'),
      ]);
      setInvoices((inv || []).filter((i: any) => i.status !== 'cancelada'));
      setInvoiceItems(items || []);
      setProductions(prods || []);
      setArticles(arts || []);
      setYarnTypes(yt || []);
      setOutsourceProductions(op || []);
      setOutsourceCompanies(oc || []);
      setYarnStock(ys || []);
      setResidueSales(rs || []);
      setLoaded(true);
    } catch (e) {
      toast.error('Erro ao carregar dados');
    }
    setLoading(false);
  }, [companyId, selectedMonth]);

  // Build invoice lookup
  const invoiceMap = useMemo(() => {
    const m = new Map<string, InvoiceRow>();
    invoices.forEach(i => m.set(i.id, i));
    return m;
  }, [invoices]);

  const getItemInvoice = (item: InvoiceItemRow) => invoiceMap.get(item.invoice_id);

  // Article map
  const articleMap = useMemo(() => {
    const m = new Map<string, ArticleRow>();
    articles.forEach(a => m.set(a.id, a));
    return m;
  }, [articles]);

  // Yarn type map
  const yarnTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    yarnTypes.forEach(y => m.set(y.id, y.name));
    return m;
  }, [yarnTypes]);

  const outsourceCompanyMap = useMemo(() => {
    const m = new Map<string, string>();
    outsourceCompanies.forEach(c => m.set(c.id, c.name));
    return m;
  }, [outsourceCompanies]);

  // Previous month
  const prevMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return format(d, 'yyyy-MM');
  }, [selectedMonth]);

  // Helper: sum invoice_items weight for a given type up to a month
  const sumItemsWeight = useCallback((type: string, upToMonth: string) => {
    let total = 0;
    invoiceItems.forEach(item => {
      const inv = getItemInvoice(item);
      if (!inv || inv.type !== type) return;
      if (!isUpToMonth(inv.issue_date, upToMonth)) return;
      total += Number(item.weight_kg) || 0;
    });
    return total;
  }, [invoiceItems, invoiceMap]);

  const sumItemsWeightMonth = useCallback((type: string, month: string) => {
    let total = 0;
    invoiceItems.forEach(item => {
      const inv = getItemInvoice(item);
      if (!inv || inv.type !== type) return;
      if (!isInMonth(inv.issue_date, month)) return;
      total += Number(item.weight_kg) || 0;
    });
    return total;
  }, [invoiceItems, invoiceMap]);

  // Consumption: productions weight where article has yarn_type_id
  const sumConsumption = useCallback((upToMonth: string) => {
    let total = 0;
    productions.forEach(p => {
      if (!isUpToMonth(p.date, upToMonth)) return;
      if (!p.article_id) return;
      const art = articleMap.get(p.article_id);
      if (!art?.yarn_type_id) return;
      total += Number(p.weight_kg) || 0;
    });
    return total;
  }, [productions, articleMap]);

  // ===== SECTION 1: FECHAMENTO KG =====
  const section1 = useMemo(() => {
    if (!loaded) return null;
    const compraTotal = sumItemsWeight('entrada', selectedMonth);
    const consumoTotal = sumConsumption(selectedMonth);
    const vendasFioTotal = sumItemsWeight('venda_fio', selectedMonth);
    const estoqueAtual = compraTotal - consumoTotal - vendasFioTotal;

    const compraPrev = sumItemsWeight('entrada', prevMonth);
    const consumoPrev = sumConsumption(prevMonth);
    const vendasFioPrev = sumItemsWeight('venda_fio', prevMonth);
    const estoqueInicial = compraPrev - consumoPrev - vendasFioPrev;

    const compraMes = sumItemsWeightMonth('entrada', selectedMonth);
    const vendasFioMes = sumItemsWeightMonth('venda_fio', selectedMonth);

    let producaoMes = 0, rolosMes = 0;
    productions.forEach(p => {
      if (!isInMonth(p.date, selectedMonth)) return;
      producaoMes += Number(p.weight_kg) || 0;
      rolosMes += Number(p.rolls_produced) || 0;
    });

    return { estoqueInicial, compraMes, estoqueAtual, producaoMes, rolosMes, vendasFioMes };
  }, [loaded, selectedMonth, prevMonth, sumItemsWeight, sumItemsWeightMonth, sumConsumption, productions]);

  // ===== SECTION 2: SALDO DE FIOS POR TIPO =====
  const section2 = useMemo(() => {
    if (!loaded) return [];
    const rows: { name: string; compraMes: number; estoque: number; vendasMes: number }[] = [];
    yarnTypes.forEach(yt => {
      let compraMes = 0, compraTotal = 0, vendasMes = 0, vendasTotal = 0, consumoTotal = 0;
      invoiceItems.forEach(item => {
        const inv = getItemInvoice(item);
        if (!inv) return;
        if (item.yarn_type_id !== yt.id) return;
        if (inv.type === 'entrada') {
          if (isInMonth(inv.issue_date, selectedMonth)) compraMes += Number(item.weight_kg) || 0;
          if (isUpToMonth(inv.issue_date, selectedMonth)) compraTotal += Number(item.weight_kg) || 0;
        }
        if (inv.type === 'venda_fio') {
          if (isInMonth(inv.issue_date, selectedMonth)) vendasMes += Number(item.weight_kg) || 0;
          if (isUpToMonth(inv.issue_date, selectedMonth)) vendasTotal += Number(item.weight_kg) || 0;
        }
      });
      productions.forEach(p => {
        if (!isUpToMonth(p.date, selectedMonth)) return;
        if (!p.article_id) return;
        const art = articleMap.get(p.article_id);
        if (art?.yarn_type_id !== yt.id) return;
        consumoTotal += Number(p.weight_kg) || 0;
      });
      const estoque = compraTotal - consumoTotal - vendasTotal;
      if (compraMes || estoque || vendasMes) {
        rows.push({ name: yt.name, compraMes, estoque, vendasMes });
      }
    });
    return rows;
  }, [loaded, selectedMonth, yarnTypes, invoiceItems, invoiceMap, productions, articleMap]);

  // ===== SECTION 3: ESTOQUE DE MALHA =====
  const section3 = useMemo(() => {
    if (!loaded) return [];
    // Group by client → articles: produced - delivered
    const prodMap = new Map<string, { kg: number; rolls: number }>();
    productions.forEach(p => {
      if (!isUpToMonth(p.date, selectedMonth)) return;
      if (!p.article_id) return;
      const key = p.article_id;
      const cur = prodMap.get(key) || { kg: 0, rolls: 0 };
      cur.kg += Number(p.weight_kg) || 0;
      cur.rolls += Number(p.rolls_produced) || 0;
      prodMap.set(key, cur);
    });
    const delivMap = new Map<string, { kg: number; rolls: number }>();
    invoiceItems.forEach(item => {
      const inv = getItemInvoice(item);
      if (!inv || inv.type !== 'saida') return;
      if (!isUpToMonth(inv.issue_date, selectedMonth)) return;
      if (!item.article_id) return;
      const key = item.article_id;
      const cur = delivMap.get(key) || { kg: 0, rolls: 0 };
      cur.kg += Number(item.weight_kg) || 0;
      cur.rolls += Number(item.quantity_rolls) || 0;
      delivMap.set(key, cur);
    });
    const clientGroups = new Map<string, { clientName: string; items: { artName: string; prodKg: number; delivKg: number; stockKg: number; prodRolls: number; delivRolls: number; stockRolls: number }[] }>();
    const allArticleIds = new Set([...Array.from(prodMap.keys()), ...Array.from(delivMap.keys())]);
    allArticleIds.forEach(artId => {
      const art = articleMap.get(artId);
      const clientName = art?.client_name || 'Sem cliente';
      const clientId = art?.client_id || 'none';
      if (!clientGroups.has(clientId)) clientGroups.set(clientId, { clientName, items: [] });
      const prod = prodMap.get(artId) || { kg: 0, rolls: 0 };
      const deliv = delivMap.get(artId) || { kg: 0, rolls: 0 };
      clientGroups.get(clientId)!.items.push({
        artName: art?.name || artId,
        prodKg: prod.kg, delivKg: deliv.kg, stockKg: prod.kg - deliv.kg,
        prodRolls: prod.rolls, delivRolls: deliv.rolls, stockRolls: prod.rolls - deliv.rolls,
      });
    });
    return Array.from(clientGroups.values()).filter(g => g.items.some(i => i.stockKg !== 0));
  }, [loaded, selectedMonth, productions, invoiceItems, invoiceMap, articleMap]);

  // ===== SECTION 4: RECEITAS PRÓPRIAS =====
  const section4 = useMemo(() => {
    if (!loaded) return [];
    const groups = new Map<string, { clientName: string; kg: number; rolls: number; revenue: number }>();
    productions.forEach(p => {
      if (!isInMonth(p.date, selectedMonth)) return;
      const art = p.article_id ? articleMap.get(p.article_id) : null;
      const clientName = art?.client_name || p.article_name || 'Sem cliente';
      const key = art?.client_id || clientName;
      const cur = groups.get(key) || { clientName, kg: 0, rolls: 0, revenue: 0 };
      cur.kg += Number(p.weight_kg) || 0;
      cur.rolls += Number(p.rolls_produced) || 0;
      cur.revenue += Number(p.revenue) || 0;
      groups.set(key, cur);
    });
    return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue);
  }, [loaded, selectedMonth, productions, articleMap]);

  // ===== SECTION 5 & 6: TERCEIROS (lucro/prejuízo) =====
  const { section5, section6 } = useMemo(() => {
    if (!loaded) return { section5: [], section6: [] };
    const monthProds = outsourceProductions.filter(p => isInMonth(p.date, selectedMonth));
    const groups = new Map<string, { name: string; kg: number; rolls: number; revenue: number; cost: number; profit: number }>();
    monthProds.forEach(p => {
      const name = p.outsource_company_name || outsourceCompanyMap.get(p.outsource_company_id) || 'Desconhecido';
      const cur = groups.get(p.outsource_company_id) || { name, kg: 0, rolls: 0, revenue: 0, cost: 0, profit: 0 };
      cur.kg += Number(p.weight_kg) || 0;
      cur.rolls += Number(p.rolls) || 0;
      cur.revenue += Number(p.total_revenue) || 0;
      cur.cost += Number(p.total_cost) || 0;
      cur.profit += Number(p.total_profit) || 0;
      groups.set(p.outsource_company_id, cur);
    });
    const all = Array.from(groups.values());
    return {
      section5: all.filter(g => g.profit >= 0),
      section6: all.filter(g => g.profit < 0),
    };
  }, [loaded, selectedMonth, outsourceProductions, outsourceCompanyMap]);

  // ===== SECTION 7: RESÍDUOS =====
  const section7 = useMemo(() => {
    if (!loaded) return [];
    const groups = new Map<string, { name: string; qty: number; unit: string; total: number }>();
    residueSales.forEach(r => {
      if (!isInMonth(r.date, selectedMonth)) return;
      const name = r.material_name || 'Outros';
      const cur = groups.get(name) || { name, qty: 0, unit: r.unit, total: 0 };
      cur.qty += Number(r.quantity) || 0;
      cur.total += Number(r.total) || 0;
      groups.set(name, cur);
    });
    return Array.from(groups.values());
  }, [loaded, selectedMonth, residueSales]);

  // ===== SECTION 8: VENDA DE FIO =====
  const section8 = useMemo(() => {
    if (!loaded) return [];
    const rows: { clientName: string; yarnName: string; kg: number; valuePKg: number; total: number }[] = [];
    invoiceItems.forEach(item => {
      const inv = getItemInvoice(item);
      if (!inv || inv.type !== 'venda_fio') return;
      if (!isInMonth(inv.issue_date, selectedMonth)) return;
      rows.push({
        clientName: inv.client_name || 'Sem cliente',
        yarnName: item.yarn_type_name || 'Sem tipo',
        kg: Number(item.weight_kg) || 0,
        valuePKg: Number(item.value_per_kg) || 0,
        total: Number(item.subtotal) || 0,
      });
    });
    return rows;
  }, [loaded, selectedMonth, invoiceItems, invoiceMap]);

  // ===== SECTION 9: ESTOQUE FIO TERCEIROS =====
  const section9 = useMemo(() => {
    if (!loaded) return [];
    const groups = new Map<string, { companyName: string; items: { yarnName: string; kg: number }[] }>();
    yarnStock.forEach(s => {
      const companyName = outsourceCompanyMap.get(s.outsource_company_id) || 'Desconhecido';
      if (!groups.has(s.outsource_company_id)) groups.set(s.outsource_company_id, { companyName, items: [] });
      groups.get(s.outsource_company_id)!.items.push({
        yarnName: yarnTypeMap.get(s.yarn_type_id) || 'Desconhecido',
        kg: Number(s.quantity_kg) || 0,
      });
    });
    return Array.from(groups.values());
  }, [loaded, yarnStock, outsourceCompanyMap, yarnTypeMap]);

  // ===== SECTION 10: FATURAMENTO TOTAL =====
  const section10 = useMemo(() => {
    if (!loaded) return null;
    const receitaPropria = section4.reduce((s, r) => s + r.revenue, 0);
    const receitaTerceiros = section5.reduce((s, r) => s + r.profit, 0);
    const prejuizoTerceiros = section6.reduce((s, r) => s + r.profit, 0);
    const receitaResiduos = section7.reduce((s, r) => s + r.total, 0);
    const vendaFio = section8.reduce((s, r) => s + r.total, 0);
    const total = receitaPropria + receitaTerceiros + prejuizoTerceiros + receitaResiduos + vendaFio;
    return { receitaPropria, receitaTerceiros, prejuizoTerceiros, receitaResiduos, vendaFio, total };
  }, [loaded, section4, section5, section6, section7, section8]);

  const monthLabel = fmtMonth(selectedMonth);

  // ===== PDF EXPORT =====
  const handleExportPDF = async () => {
    if (!loaded || !section1 || !section10) return;
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 15;

      const colors = {
        grayBg: [249, 250, 251] as [number, number, number],
        border: [229, 231, 235] as [number, number, number],
        textDark: [17, 24, 39] as [number, number, number],
        textMid: [75, 85, 99] as [number, number, number],
      };

      // Load logo
      let logoInfo: { data: string; w: number; h: number } | null = null;
      const { data: companyData } = await sb('companies').select('logo_url, name').eq('id', companyId).single();
      const companyName = companyData?.name || '';
      if (companyData?.logo_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = companyData.logo_url;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          logoInfo = { data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
        } catch { /* no logo */ }
      }

      const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const periodText = monthLabel;

      const fitWithinBox = (w: number, h: number, mw: number, mh: number) => {
        const scale = Math.min(mw / w, mh / h);
        return { width: w * scale, height: h * scale };
      };

      const addHeader = (title: string, y: number) => {
        const headerH = 25;
        const leftX = margin + 5;
        const rightX = pw - margin - 5;

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
        } else {
          pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
          if (companyName) pdf.text(companyName, leftX, y + 10);
        }
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textMid);
        pdf.text(dateStr, leftX, y + 22);

        pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...colors.textDark);
        const tw = pdf.getTextWidth(title);
        pdf.text(title, (pw - tw) / 2, y + 14);

        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...colors.textMid);
        const pW2 = pdf.getTextWidth(periodText);
        pdf.text(periodText, rightX - pW2, y + 22);

        return y + headerH + 10;
      };

      const tableOpts = {
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
        margin: { left: margin, right: margin },
      };

      // Page 1: FECHAMENTO KG
      let y = addHeader(`FECHAMENTO KG — ${monthLabel.toUpperCase()}`, margin);
      const s1 = section1!;
      const kgLines = [
        [`Estoque Inicial (01/${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]})`, formatWeight(s1.estoqueInicial)],
        [`Compra de Fio ${monthLabel}`, formatWeight(s1.compraMes)],
        ['(-) Estoque Final', formatWeight(s1.estoqueAtual)],
        ['', ''],
        ['Produção Total', formatWeight(s1.producaoMes)],
        ['Rolos Produzidos', formatNumber(s1.rolosMes)],
        [`Vendas de Fio`, formatWeight(s1.vendasFioMes)],
      ];
      autoTable(pdf, {
        startY: y,
        head: [['Descrição', 'Valor']],
        body: kgLines,
        ...tableOpts,
        columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
        didParseCell: (data: any) => {
          if (data.row.index === 4 || data.row.index === 5) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      // Page 2: SALDO FIOS
      pdf.addPage();
      y = addHeader(`SALDO DE FIOS — ${monthLabel.toUpperCase()}`, margin);
      const s2Body = section2.map(r => [r.name, formatWeight(r.compraMes), formatWeight(r.estoque), formatWeight(r.vendasMes)]);
      const s2Totals = section2.reduce((a, r) => ({ c: a.c + r.compraMes, e: a.e + r.estoque, v: a.v + r.vendasMes }), { c: 0, e: 0, v: 0 });
      s2Body.push(['TOTAL', formatWeight(s2Totals.c), formatWeight(s2Totals.e), formatWeight(s2Totals.v)]);
      autoTable(pdf, {
        startY: y,
        head: [['Tipo de Fio', 'Compra (mês)', 'Estoque', 'Vendas (mês)']],
        body: s2Body,
        ...tableOpts,
        didParseCell: (data: any) => {
          if (data.row.index === s2Body.length - 1) data.cell.styles.fontStyle = 'bold';
        },
      });

      // Page 3: ESTOQUE MALHA
      pdf.addPage();
      y = addHeader(`ESTOQUE DE MALHA — ${monthLabel.toUpperCase()}`, margin);
      const s3Body: string[][] = [];
      section3.forEach(g => {
        g.items.forEach(i => {
          s3Body.push([g.clientName, i.artName, formatWeight(i.prodKg), formatWeight(i.delivKg), formatWeight(i.stockKg), formatNumber(i.stockRolls)]);
        });
      });
      autoTable(pdf, {
        startY: y,
        head: [['Cliente', 'Artigo', 'Produzido', 'Entregue', 'Estoque', 'Rolos']],
        body: s3Body,
        ...tableOpts,
      });

      // Page 4: RECEITAS PRÓPRIAS
      pdf.addPage();
      y = addHeader(`RECEITAS PRÓPRIAS — ${monthLabel.toUpperCase()}`, margin);
      const s4Body = section4.map(r => [r.clientName, formatWeight(r.kg), formatNumber(r.rolls), formatCurrency(r.revenue)]);
      const s4Tot = section4.reduce((a, r) => ({ k: a.k + r.kg, ro: a.ro + r.rolls, re: a.re + r.revenue }), { k: 0, ro: 0, re: 0 });
      s4Body.push(['TOTAL', formatWeight(s4Tot.k), formatNumber(s4Tot.ro), formatCurrency(s4Tot.re)]);
      autoTable(pdf, {
        startY: y,
        head: [['Cliente', 'Kg', 'Rolos', 'Receita (R$)']],
        body: s4Body,
        ...tableOpts,
        didParseCell: (data: any) => {
          if (data.row.index === s4Body.length - 1) data.cell.styles.fontStyle = 'bold';
        },
      });

      // Page 5: RECEITAS TERCEIROS
      pdf.addPage();
      y = addHeader(`RECEITAS DE TERCEIROS — ${monthLabel.toUpperCase()}`, margin);
      if (section5.length === 0) {
        pdf.setFontSize(10); pdf.setTextColor(...colors.textMid);
        pdf.text('Nenhuma receita de terceiros neste mês', margin, y + 5);
      } else {
        const s5Body = section5.map(r => [r.name, formatWeight(r.kg), formatNumber(r.rolls), formatCurrency(r.revenue), formatCurrency(r.cost), formatCurrency(r.profit)]);
        const s5Tot = section5.reduce((a, r) => ({ k: a.k + r.kg, ro: a.ro + r.rolls, re: a.re + r.revenue, co: a.co + r.cost, pr: a.pr + r.profit }), { k: 0, ro: 0, re: 0, co: 0, pr: 0 });
        s5Body.push(['TOTAL', formatWeight(s5Tot.k), formatNumber(s5Tot.ro), formatCurrency(s5Tot.re), formatCurrency(s5Tot.co), formatCurrency(s5Tot.pr)]);
        autoTable(pdf, {
          startY: y,
          head: [['Malharia', 'Kg', 'Rolos', 'Receita', 'Custo', 'Lucro']],
          body: s5Body,
          ...tableOpts,
          didParseCell: (data: any) => {
            if (data.row.index === s5Body.length - 1) data.cell.styles.fontStyle = 'bold';
          },
        });
      }

      // Page 6: PREJUÍZOS TERCEIROS
      pdf.addPage();
      y = addHeader(`PREJUÍZOS DE TERCEIROS — ${monthLabel.toUpperCase()}`, margin);
      if (section6.length === 0) {
        pdf.setFontSize(10); pdf.setTextColor(...colors.textMid);
        pdf.text('Nenhum prejuízo neste mês', margin, y + 5);
      } else {
        const s6Body = section6.map(r => [r.name, formatWeight(r.kg), formatNumber(r.rolls), formatCurrency(r.revenue), formatCurrency(r.cost), formatCurrency(r.profit)]);
        const s6Tot = section6.reduce((a, r) => ({ k: a.k + r.kg, ro: a.ro + r.rolls, re: a.re + r.revenue, co: a.co + r.cost, pr: a.pr + r.profit }), { k: 0, ro: 0, re: 0, co: 0, pr: 0 });
        s6Body.push(['TOTAL', formatWeight(s6Tot.k), formatNumber(s6Tot.ro), formatCurrency(s6Tot.re), formatCurrency(s6Tot.co), formatCurrency(s6Tot.pr)]);
        autoTable(pdf, {
          startY: y,
          head: [['Malharia', 'Kg', 'Rolos', 'Receita', 'Custo', 'Prejuízo']],
          body: s6Body,
          ...tableOpts,
          didParseCell: (data: any) => {
            if (data.row.index === s6Body.length - 1) data.cell.styles.fontStyle = 'bold';
          },
        });
      }

      // Page 7: RESÍDUOS
      pdf.addPage();
      y = addHeader(`RECEITAS DIVERSAS (RESÍDUOS) — ${monthLabel.toUpperCase()}`, margin);
      if (section7.length === 0) {
        pdf.setFontSize(10); pdf.setTextColor(...colors.textMid);
        pdf.text('Nenhum registro de resíduos neste mês', margin, y + 5);
      } else {
        const s7Body = section7.map(r => [r.name, formatNumber(r.qty, 2), r.unit, formatCurrency(r.total)]);
        const s7Tot = section7.reduce((a, r) => a + r.total, 0);
        s7Body.push(['TOTAL', '', '', formatCurrency(s7Tot)]);
        autoTable(pdf, {
          startY: y,
          head: [['Material', 'Qtd', 'Und.', 'Total (R$)']],
          body: s7Body,
          ...tableOpts,
          didParseCell: (data: any) => {
            if (data.row.index === s7Body.length - 1) data.cell.styles.fontStyle = 'bold';
          },
        });
      }

      // Page 8: VENDA DE FIO
      pdf.addPage();
      y = addHeader(`VENDA DE FIO — ${monthLabel.toUpperCase()}`, margin);
      if (section8.length === 0) {
        pdf.setFontSize(10); pdf.setTextColor(...colors.textMid);
        pdf.text('Nenhuma venda de fio neste mês', margin, y + 5);
      } else {
        const s8Body = section8.map(r => [r.clientName, r.yarnName, formatWeight(r.kg), formatCurrency(r.valuePKg), formatCurrency(r.total)]);
        const s8Tot = section8.reduce((a, r) => ({ k: a.k + r.kg, t: a.t + r.total }), { k: 0, t: 0 });
        s8Body.push(['TOTAL', '', formatWeight(s8Tot.k), '', formatCurrency(s8Tot.t)]);
        autoTable(pdf, {
          startY: y,
          head: [['Cliente', 'Tipo de Fio', 'Kg', 'R$/kg', 'Total (R$)']],
          body: s8Body,
          ...tableOpts,
          didParseCell: (data: any) => {
            if (data.row.index === s8Body.length - 1) data.cell.styles.fontStyle = 'bold';
          },
        });
      }

      // Page 9: ESTOQUE FIO TERCEIROS
      pdf.addPage();
      y = addHeader(`ESTOQUE FIO EM TERCEIROS — ${monthLabel.toUpperCase()}`, margin);
      if (section9.length === 0) {
        pdf.setFontSize(10); pdf.setTextColor(...colors.textMid);
        pdf.text('Nenhum estoque em terceiros para este mês', margin, y + 5);
      } else {
        const s9Body: string[][] = [];
        let totalGeral = 0;
        section9.forEach(g => {
          g.items.forEach(i => {
            s9Body.push([g.companyName, i.yarnName, formatWeight(i.kg)]);
            totalGeral += i.kg;
          });
        });
        s9Body.push(['TOTAL GERAL', '', formatWeight(totalGeral)]);
        autoTable(pdf, {
          startY: y,
          head: [['Facção', 'Tipo de Fio', 'Quantidade (kg)']],
          body: s9Body,
          ...tableOpts,
          didParseCell: (data: any) => {
            if (data.row.index === s9Body.length - 1) data.cell.styles.fontStyle = 'bold';
          },
        });
      }

      // Page 10: FATURAMENTO TOTAL
      pdf.addPage();
      y = addHeader(`FATURAMENTO TOTAL — ${monthLabel.toUpperCase()}`, margin);
      const s10 = section10!;
      const fatLines = [
        ['Receitas Próprias (Produção)', formatCurrency(s10.receitaPropria)],
        ['Receitas de Terceiros', formatCurrency(s10.receitaTerceiros)],
        ['(-) Prejuízos de Terceiros', formatCurrency(s10.prejuizoTerceiros)],
        ['Receitas Diversas (Resíduos)', formatCurrency(s10.receitaResiduos)],
        ['Venda de Fio', formatCurrency(s10.vendaFio)],
        ['', ''],
        ['FATURAMENTO TOTAL', formatCurrency(s10.total)],
      ];
      autoTable(pdf, {
        startY: y,
        head: [['Descrição', 'Valor (R$)']],
        body: fatLines,
        ...tableOpts,
        columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
        didParseCell: (data: any) => {
          if (data.row.index === 6) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 10;
          }
          if (data.row.index === 2 && data.column.index === 1) {
            data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      const fileName = `Fechamento_${selectedMonth}_${companyName.replace(/\s+/g, '_')}.pdf`;
      pdf.save(fileName);
      toast.success('PDF exportado com sucesso!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF');
    }
    setExporting(false);
  };

  // ===== UI =====
  const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card className="shadow-material">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          Fechamento Mensal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Relatório consolidado de operações e faturamento</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={selectedMonth}
          onChange={e => { setSelectedMonth(e.target.value); setLoaded(false); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {loading ? 'Carregando...' : loaded ? 'Atualizar' : 'Carregar Dados'}
        </Button>
        {loaded && (
          <Button variant="outline" onClick={handleExportPDF} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Exportar PDF
          </Button>
        )}
      </div>

      {!loaded && !loading && (
        <Card className="shadow-material">
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione o mês e clique em "Carregar Dados" para visualizar o fechamento.
          </CardContent>
        </Card>
      )}

      {loaded && (
        <div className="space-y-6">
          {/* Section 1: FECHAMENTO KG */}
          {section1 && (
            <SectionCard title={`FECHAMENTO KG — ${monthLabel}`}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Estoque Inicial</span><span className="font-mono">{formatWeight(section1.estoqueInicial)}</span></div>
                <div className="flex justify-between"><span>Compra de Fio {monthLabel}</span><span className="font-mono">{formatWeight(section1.compraMes)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>(-) Estoque Final</span><span className="font-mono">{formatWeight(section1.estoqueAtual)}</span></div>
                <div className="border-t pt-2 flex justify-between font-semibold"><span>Produção Total</span><span className="font-mono">{formatWeight(section1.producaoMes)}</span></div>
                <div className="flex justify-between font-semibold"><span>Rolos Produzidos</span><span className="font-mono">{formatNumber(section1.rolosMes)}</span></div>
                <div className="flex justify-between"><span>Vendas de Fio</span><span className="font-mono">{formatWeight(section1.vendasFioMes)}</span></div>
              </div>
            </SectionCard>
          )}

          {/* Section 2: SALDO FIOS */}
          <SectionCard title={`SALDO DE FIOS — ${monthLabel}`}>
            {section2.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum tipo de fio com movimentação</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tipo de Fio</TableHead><TableHead className="text-right">Compra (mês)</TableHead><TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Vendas (mês)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {section2.map((r, i) => (
                    <TableRow key={i}><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{formatWeight(r.compraMes)}</TableCell><TableCell className={`text-right font-mono ${r.estoque < 0 ? 'text-destructive' : ''}`}>{formatWeight(r.estoque)}</TableCell><TableCell className="text-right font-mono">{formatWeight(r.vendasMes)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2"><TableCell>TOTAL</TableCell><TableCell className="text-right font-mono">{formatWeight(section2.reduce((s, r) => s + r.compraMes, 0))}</TableCell><TableCell className="text-right font-mono">{formatWeight(section2.reduce((s, r) => s + r.estoque, 0))}</TableCell><TableCell className="text-right font-mono">{formatWeight(section2.reduce((s, r) => s + r.vendasMes, 0))}</TableCell></TableRow>
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* Section 3: ESTOQUE MALHA */}
          <SectionCard title={`ESTOQUE DE MALHA — ${monthLabel}`}>
            {section3.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum estoque de malha</p> : (
              <div className="space-y-3">
                {section3.map((g, gi) => (
                  <Collapsible key={gi}>
                    <CollapsibleTrigger className="font-semibold text-sm cursor-pointer hover:text-primary">▶ {g.clientName}</CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Artigo</TableHead><TableHead className="text-right">Produzido</TableHead><TableHead className="text-right">Entregue</TableHead><TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Rolos</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {g.items.map((i, ii) => (
                            <TableRow key={ii}><TableCell>{i.artName}</TableCell><TableCell className="text-right font-mono">{formatWeight(i.prodKg)}</TableCell><TableCell className="text-right font-mono">{formatWeight(i.delivKg)}</TableCell><TableCell className={`text-right font-mono ${i.stockKg < 0 ? 'text-destructive' : ''}`}>{formatWeight(i.stockKg)}</TableCell><TableCell className="text-right font-mono">{formatNumber(i.stockRolls)}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section 4: RECEITAS PRÓPRIAS */}
          <SectionCard title={`RECEITAS PRÓPRIAS — ${monthLabel}`}>
            {section4.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma produção neste mês</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cliente</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">Rolos</TableHead><TableHead className="text-right">Receita (R$)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {section4.map((r, i) => (
                    <TableRow key={i}><TableCell>{r.clientName}</TableCell><TableCell className="text-right font-mono">{formatWeight(r.kg)}</TableCell><TableCell className="text-right font-mono">{formatNumber(r.rolls)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.revenue)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL</TableCell><TableCell className="text-right font-mono">{formatWeight(section4.reduce((s, r) => s + r.kg, 0))}</TableCell><TableCell className="text-right font-mono">{formatNumber(section4.reduce((s, r) => s + r.rolls, 0))}</TableCell><TableCell className="text-right font-mono">{formatCurrency(section4.reduce((s, r) => s + r.revenue, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* Section 5: RECEITAS TERCEIROS */}
          <SectionCard title={`RECEITAS DE TERCEIROS — ${monthLabel}`}>
            {section5.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma receita de terceiros neste mês</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Malharia</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">Rolos</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Lucro</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {section5.map((r, i) => (
                    <TableRow key={i}><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{formatWeight(r.kg)}</TableCell><TableCell className="text-right font-mono">{formatNumber(r.rolls)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.revenue)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.cost)}</TableCell><TableCell className="text-right font-mono text-success">{formatCurrency(r.profit)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL</TableCell><TableCell className="text-right font-mono">{formatWeight(section5.reduce((s, r) => s + r.kg, 0))}</TableCell><TableCell className="text-right font-mono">{formatNumber(section5.reduce((s, r) => s + r.rolls, 0))}</TableCell><TableCell className="text-right font-mono">{formatCurrency(section5.reduce((s, r) => s + r.revenue, 0))}</TableCell><TableCell className="text-right font-mono">{formatCurrency(section5.reduce((s, r) => s + r.cost, 0))}</TableCell><TableCell className="text-right font-mono text-success">{formatCurrency(section5.reduce((s, r) => s + r.profit, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* Section 6: PREJUÍZOS TERCEIROS */}
          <SectionCard title={`PREJUÍZOS DE TERCEIROS — ${monthLabel}`}>
            {section6.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum prejuízo neste mês</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Malharia</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">Rolos</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Prejuízo</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {section6.map((r, i) => (
                    <TableRow key={i}><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{formatWeight(r.kg)}</TableCell><TableCell className="text-right font-mono">{formatNumber(r.rolls)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.revenue)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.cost)}</TableCell><TableCell className="text-right font-mono text-destructive">{formatCurrency(r.profit)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL</TableCell><TableCell className="text-right font-mono">{formatWeight(section6.reduce((s, r) => s + r.kg, 0))}</TableCell><TableCell className="text-right font-mono">{formatNumber(section6.reduce((s, r) => s + r.rolls, 0))}</TableCell><TableCell className="text-right font-mono">{formatCurrency(section6.reduce((s, r) => s + r.revenue, 0))}</TableCell><TableCell className="text-right font-mono">{formatCurrency(section6.reduce((s, r) => s + r.cost, 0))}</TableCell><TableCell className="text-right font-mono text-destructive">{formatCurrency(section6.reduce((s, r) => s + r.profit, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* Section 7: RESÍDUOS */}
          <SectionCard title={`RECEITAS DIVERSAS (RESÍDUOS) — ${monthLabel}`}>
            {section7.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro de resíduos neste mês</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Material</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Und.</TableHead><TableHead className="text-right">Total (R$)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {section7.map((r, i) => (
                    <TableRow key={i}><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{formatNumber(r.qty, 2)}</TableCell><TableCell>{r.unit}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.total)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL</TableCell><TableCell></TableCell><TableCell></TableCell><TableCell className="text-right font-mono">{formatCurrency(section7.reduce((s, r) => s + r.total, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* Section 8: VENDA DE FIO */}
          <SectionCard title={`VENDA DE FIO — ${monthLabel}`}>
            {section8.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma venda de fio neste mês</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cliente</TableHead><TableHead>Tipo de Fio</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">R$/kg</TableHead><TableHead className="text-right">Total (R$)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {section8.map((r, i) => (
                    <TableRow key={i}><TableCell>{r.clientName}</TableCell><TableCell>{r.yarnName}</TableCell><TableCell className="text-right font-mono">{formatWeight(r.kg)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.valuePKg)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(r.total)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL</TableCell><TableCell></TableCell><TableCell className="text-right font-mono">{formatWeight(section8.reduce((s, r) => s + r.kg, 0))}</TableCell><TableCell></TableCell><TableCell className="text-right font-mono">{formatCurrency(section8.reduce((s, r) => s + r.total, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* Section 9: ESTOQUE FIO TERCEIROS */}
          <SectionCard title={`ESTOQUE FIO EM TERCEIROS — ${monthLabel}`}>
            {section9.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum estoque em terceiros para este mês</p> : (
              <div className="space-y-3">
                {section9.map((g, gi) => (
                  <Collapsible key={gi} defaultOpen>
                    <CollapsibleTrigger className="font-semibold text-sm cursor-pointer hover:text-primary">▶ {g.companyName}</CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader><TableRow><TableHead>Tipo de Fio</TableHead><TableHead className="text-right">Quantidade (kg)</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {g.items.map((i, ii) => (
                            <TableRow key={ii}><TableCell>{i.yarnName}</TableCell><TableCell className="text-right font-mono">{formatWeight(i.kg)}</TableCell></TableRow>
                          ))}
                          <TableRow className="font-bold border-t">
                            <TableCell>Total {g.companyName}</TableCell><TableCell className="text-right font-mono">{formatWeight(g.items.reduce((s, i) => s + i.kg, 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
                <div className="font-bold text-sm pt-2 border-t">
                  Total Geral em Terceiros: {formatWeight(section9.reduce((s, g) => s + g.items.reduce((s2, i) => s2 + i.kg, 0), 0))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Section 10: FATURAMENTO TOTAL */}
          {section10 && (
            <SectionCard title={`FATURAMENTO TOTAL — ${monthLabel}`}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Receitas Próprias (Produção)</span><span className="font-mono">{formatCurrency(section10.receitaPropria)}</span></div>
                <div className="flex justify-between"><span>Receitas de Terceiros</span><span className="font-mono">{formatCurrency(section10.receitaTerceiros)}</span></div>
                <div className="flex justify-between text-destructive"><span>(-) Prejuízos de Terceiros</span><span className="font-mono">{formatCurrency(section10.prejuizoTerceiros)}</span></div>
                <div className="flex justify-between"><span>Receitas Diversas (Resíduos)</span><span className="font-mono">{formatCurrency(section10.receitaResiduos)}</span></div>
                <div className="flex justify-between"><span>Venda de Fio</span><span className="font-mono">{formatCurrency(section10.vendaFio)}</span></div>
                <div className="border-t-2 pt-3 flex justify-between text-lg font-bold text-primary">
                  <span>FATURAMENTO TOTAL</span>
                  <span className="font-mono">{formatCurrency(section10.total)}</span>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
