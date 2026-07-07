import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { sanitizePdfText } from './pdfUtils';
import { loadLogoForPdf, drawHeader } from './clientInvoicePdf';

interface Invoice {
  id: string;
  invoice_number: string;
  buyer_name: string | null;
  client_name: string | null;
  destination_name: string | null;
  issue_date: string;
  status: string;
  total_weight_kg: number;
  total_value: number;
}
interface InvoiceItem {
  invoice_id: string;
  yarn_type_id: string | null;
  yarn_type_name: string | null;
  brand: string | null;
  weight_kg: number;
  quantity_boxes: number;
  value_per_kg: number;
  subtotal: number;
}

export interface YarnSalesReportInput {
  invoices: Invoice[];      // já filtrados (mês/status/busca) apenas venda_fio
  items: InvoiceItem[];     // todos os invoice_items da empresa
  companyName: string;
  companyLogoUrl?: string | null;
  filters: {
    month: string;   // 'all' ou 'YYYY-MM'
    status: string;  // 'all' | pendente | conferida | cancelada
    search: string;
  };
  canSeeFinancial: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', conferida: 'Conferida', cancelada: 'Cancelada', all: 'Todos',
};

const fmtNum = (n: number, dec = 3) =>
  Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function generateYarnSalesReportPdf(input: YarnSalesReportInput) {
  const { invoices, items, companyName, companyLogoUrl, filters, canSeeFinancial } = input;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;

  // Cabeçalho padrão do sistema (logo da empresa + título + período)
  const monthLabel = filters.month === 'all'
    ? 'Todos os meses'
    : format(parse(filters.month, 'yyyy-MM', new Date()), "MMMM 'de' yyyy", { locale: ptBR });
  const logoInfo = await loadLogoForPdf(companyLogoUrl || null);
  let y = drawHeader(pdf, {
    companyName,
    logoInfo,
    reportTitle: 'RELATÓRIO DE VENDA DE FIO POR TIPO',
    periodLabel: monthLabel,
  }, pageW, margin, margin);

  // Filtros aplicados
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text(
    sanitizePdfText(`Filtros: ${monthLabel} · Status: ${STATUS_LABELS[filters.status] || 'Todos'}${filters.search ? ` · Busca: "${filters.search}"` : ''}`),
    pageW / 2, y, { align: 'center' }
  );
  pdf.setTextColor(0);
  y += 6;

  // Consolidar itens por tipo de fio (independente do cliente)
  type Bucket = {
    yarnKey: string;
    yarnName: string;
    totalKg: number;
    totalBoxes: number;
    totalValue: number;
    invoiceIds: Set<string>;
    brands: Map<string, { kg: number; boxes: number; value: number }>;
  };
  const invById = new Map(invoices.map(i => [i.id, i]));
  const buckets = new Map<string, Bucket>();

  for (const it of items) {
    const inv = invById.get(it.invoice_id);
    if (!inv) continue; // só considera itens das NFs já filtradas
    const key = (it.yarn_type_id || it.yarn_type_name || 'sem_tipo') as string;
    const name = it.yarn_type_name || 'Sem tipo';
    let b = buckets.get(key);
    if (!b) {
      b = { yarnKey: key, yarnName: name, totalKg: 0, totalBoxes: 0, totalValue: 0, invoiceIds: new Set(), brands: new Map() };
      buckets.set(key, b);
    }
    const kg = Number(it.weight_kg) || 0;
    const boxes = Number(it.quantity_boxes) || 0;
    const val = Number(it.subtotal) || (Number(it.value_per_kg) || 0) * kg;
    b.totalKg += kg; b.totalBoxes += boxes; b.totalValue += val;
    b.invoiceIds.add(it.invoice_id);
    const brand = (it.brand && it.brand.trim()) ? it.brand.trim() : '—';
    const cur = b.brands.get(brand) || { kg: 0, boxes: 0, value: 0 };
    cur.kg += kg; cur.boxes += boxes; cur.value += val;
    b.brands.set(brand, cur);
  }

  const rowsSummary = Array.from(buckets.values())
    .sort((a, b) => b.totalKg - a.totalKg);

  const grandKg = rowsSummary.reduce((s, r) => s + r.totalKg, 0);
  const grandBoxes = rowsSummary.reduce((s, r) => s + r.totalBoxes, 0);
  const grandValue = rowsSummary.reduce((s, r) => s + r.totalValue, 0);
  const grandNfs = new Set<string>();
  rowsSummary.forEach(r => r.invoiceIds.forEach(id => grandNfs.add(id)));

  // KPIs
  autoTable(pdf, {
    startY: y,
    theme: 'plain',
    body: [[
      `Tipos de fio: ${rowsSummary.length}`,
      `Peso total: ${fmtNum(grandKg)} kg`,
    ]],
    styles: { fontSize: 9, halign: 'center', fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });
  y = (pdf as any).lastAutoTable.finalY + 4;

  if (rowsSummary.length === 0) {
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(10); pdf.setTextColor(120);
    pdf.text('Nenhuma venda encontrada para os filtros aplicados.', pageW / 2, y + 10, { align: 'center' });
    pdf.setTextColor(0);
    pdf.save(`relatorio-venda-fio-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
    return;
  }

  // Tabela resumo por tipo de fio (apenas Tipo de Fio e Peso)
  const summaryHead = [['Tipo de Fio', 'Peso (kg)']];
  const summaryBody = rowsSummary.map(r => [sanitizePdfText(r.yarnName), fmtNum(r.totalKg)]);
  const summaryFoot = [['TOTAL', fmtNum(grandKg)]];

  autoTable(pdf, {
    startY: y,
    head: summaryHead,
    body: summaryBody,
    foot: summaryFoot,
    theme: 'striped',
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' } },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right';
      }
      if (data.section === 'foot') {
        data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right';
      }
    },
    margin: { left: margin, right: margin },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Rodapé numérico de páginas
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`Página ${i} de ${total}`, pageW - margin, pageH - 6, { align: 'right' });
    pdf.setTextColor(0);
  }

  pdf.save(`relatorio-venda-fio-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
}
