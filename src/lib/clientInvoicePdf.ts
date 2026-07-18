import { sanitizePdfText } from './pdfUtils';
import { format } from 'date-fns';

type LogoInfo = { data: string; width: number; height: number } | null;

export async function loadLogoForPdf(url: string | null | undefined): Promise<LogoInfo> {
  if (!url) return null;
  return new Promise((resolve) => {
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
}

const colors = {
  grayBg: [249, 250, 251] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  textDark: [17, 24, 39] as [number, number, number],
  textMid: [75, 85, 99] as [number, number, number],
  headerFill: [60, 60, 60] as [number, number, number],
};

function fitWithinBox(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (!width || !height) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

function fmt(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function dateBR(iso?: string | null) {
  if (!iso) return '-';
  try {
    return format(new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso), 'dd/MM/yyyy');
  } catch { return '-'; }
}

interface BaseOpts {
  companyName: string;
  logoInfo: LogoInfo;
  reportTitle: string;
  periodLabel: string;
}

export function drawHeader(pdf: any, opts: BaseOpts, pageWidth: number, margin: number, y: number) {
  const headerH = 25;
  const leftX = margin + 5;
  const rightX = pageWidth - margin - 5;
  const titleMaxWidth = pageWidth - 2 * margin - 90;

  pdf.setFillColor(...colors.grayBg);
  pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'F');
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.5);
  pdf.rect(margin, y, pageWidth - 2 * margin, headerH, 'S');

  const dateStr = new Date().toLocaleString('pt-BR');

  if (opts.logoInfo) {
    try {
      const ls = fitWithinBox(opts.logoInfo.width, opts.logoInfo.height, 24, 14);
      pdf.addImage(opts.logoInfo.data, 'PNG', leftX, y + 2.5, ls.width, ls.height);
    } catch { /* ignore */ }
  } else if (opts.companyName) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textDark);
    pdf.text(sanitizePdfText(opts.companyName), leftX, y + 10);
  }
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textMid);
  pdf.text(dateStr, leftX, y + 22);

  // Title centered
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  const lines = pdf.splitTextToSize(sanitizePdfText(opts.reportTitle), titleMaxWidth) as string[];
  let titleY = y + 10;
  lines.forEach((line) => {
    const w = pdf.getTextWidth(line);
    pdf.text(line, (pageWidth - w) / 2, titleY);
    titleY += 6;
  });

  // Period right
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textMid);
  const periodText = sanitizePdfText(opts.periodLabel);
  const pW = pdf.getTextWidth(periodText);
  pdf.text(periodText, rightX - pW, y + 22);

  return y + headerH + 8;
}

export async function exportClientInvoicesGeneralPdf(params: {
  companyName: string;
  logoUrl: string | null;
  periodLabel: string;
  exportType?: 'entrada' | 'saida' | 'ambos';
  clientName?: string;
  // Fase 3 rpcclientInvoices: payload já vem pronto do banco (get_client_invoices_export)
  rows: Array<{
    issue_date: string | null;
    invoice_number: string | null;
    type: 'entrada' | 'saida';
    yarn_name: string | null;
    supplier_name: string | null;
    weight_entrada: number;
    weight_saida: number;
    saldo: number;
  }>;
  totals: { totalEntrada: number; totalSaida: number; totalSaldo: number; totalNotas: number };
}) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 12;
  const logoInfo = await loadLogoForPdf(params.logoUrl);

  const exportType = params.exportType || 'ambos';
  const typeLabel = exportType === 'entrada' ? 'ENTRADAS' : exportType === 'saida' ? 'SAÍDAS' : 'ENTRADAS + SAÍDAS';

  let y = drawHeader(pdf, {
    companyName: params.companyName,
    logoInfo,
    reportTitle: `NOTAS FISCAIS DE CLIENTES — RELATÓRIO GERAL (${typeLabel})`,
    periodLabel: params.periodLabel,
  }, pageWidth, margin, margin);

  // KPIs vindos da RPC
  const { totalEntrada, totalSaida, totalNotas } = params.totals;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  pdf.text(
    `${params.clientName ? 'Cliente: ' + params.clientName + '    ' : ''}Total de Notas: ${totalNotas}    Entrada (kg): ${fmt(totalEntrada)}    Saída (kg): ${fmt(totalSaida)}    Saldo: ${fmt(totalEntrada - totalSaida)}`,
    margin, y,
  );
  y += 4;

  const rows = params.rows.map(r => {
    const isEntrada = r.type === 'entrada';
    return [
      dateBR(r.issue_date),
      r.invoice_number || '-',
      r.yarn_name || '-',
      r.supplier_name || '-',
      isEntrada ? fmt(r.weight_entrada) : '-',
      !isEntrada ? fmt(r.weight_saida) : '-',
      isEntrada ? fmt(r.saldo) : '-',
    ].map((c: any) => sanitizePdfText(String(c ?? '')));
  });

  autoTable(pdf, {
    startY: y + 2,
    head: [['Data', 'NF', 'Fio', 'Fornecedor', 'Peso Entrada (kg)', 'Peso Saída (kg)', 'Saldo (kg)']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: colors.headerFill, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  pdf.save(`notas-clientes-geral-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
}

export async function exportClientInvoiceByNfPdf(params: {
  companyName: string;
  logoUrl: string | null;
  // Fase 3 rpcclientInvoices: payload já vem pronto do banco (get_client_invoice_by_nf_export)
  entry: any;                       // já contém weight_entrada e yarn_type_name resolvidos
  client: { id?: string; name?: string } | null;
  linked: Array<{ invoice_number?: string; issue_date?: string; weight_kg?: number; deduct_kg?: number; article_name?: string | null }>;
  legacy: Array<{ invoice_number?: string; issue_date?: string; weight_kg?: number; deduct_kg?: number; article_name?: string | null }>;
  consumed_kg: number;
  saldo: number;
}) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  const logoInfo = await loadLogoForPdf(params.logoUrl);

  const entry = params.entry;
  const entryWeight = Number(entry?.weight_entrada ?? entry?.items?.[0]?.weight_kg ?? 0);
  const yarnName = entry?.yarn_type_name || '-';

  let y = drawHeader(pdf, {
    companyName: params.companyName,
    logoInfo,
    reportTitle: `NF DE ENTRADA ${entry.invoice_number || '-'}`,
    periodLabel: `Emissão: ${dateBR(entry.issue_date)}`,
  }, pageWidth, margin, margin);

  // Info box
  pdf.setFillColor(248, 250, 252);
  pdf.rect(margin, y, pageWidth - 2 * margin, 28, 'F');
  pdf.setDrawColor(...colors.border);
  pdf.rect(margin, y, pageWidth - 2 * margin, 28, 'S');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  const col1 = margin + 4;
  const col2 = margin + (pageWidth - 2 * margin) / 2 + 2;
  pdf.text('Cliente:', col1, y + 6); pdf.setFont('helvetica', 'normal'); pdf.text(sanitizePdfText(params.client?.name || '-'), col1 + 18, y + 6);
  pdf.setFont('helvetica', 'bold'); pdf.text('Fio:', col1, y + 12); pdf.setFont('helvetica', 'normal'); pdf.text(sanitizePdfText(yarnName), col1 + 18, y + 12);
  pdf.setFont('helvetica', 'bold'); pdf.text('Fornecedor:', col1, y + 18); pdf.setFont('helvetica', 'normal'); pdf.text(sanitizePdfText(entry.supplier_name || '-'), col1 + 24, y + 18);
  pdf.setFont('helvetica', 'bold'); pdf.text('Cadastro:', col1, y + 24); pdf.setFont('helvetica', 'normal');
  pdf.text(sanitizePdfText(`${entry.created_by_name || '-'} ${entry.created_by_code ? '#' + entry.created_by_code : ''} ${entry.created_at ? '· ' + format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm') : ''}`), col1 + 20, y + 24);

  pdf.setFont('helvetica', 'bold'); pdf.text('Peso Entrada:', col2, y + 6); pdf.setFont('helvetica', 'normal'); pdf.text(`${fmt(entryWeight)} kg`, col2 + 28, y + 6);
  const totalSaida = Number(params.consumed_kg || 0);
  const saldo = Number(params.saldo ?? Math.max(0, entryWeight - totalSaida));
  pdf.setFont('helvetica', 'bold'); pdf.text('Total Saída:', col2, y + 12); pdf.setFont('helvetica', 'normal'); pdf.text(`${fmt(totalSaida)} kg`, col2 + 28, y + 12);
  pdf.setFont('helvetica', 'bold'); pdf.text('Saldo:', col2, y + 18); pdf.setFont('helvetica', 'normal'); pdf.text(`${fmt(saldo)} kg`, col2 + 28, y + 18);
  pdf.setFont('helvetica', 'bold'); pdf.text('Status:', col2, y + 24); pdf.setFont('helvetica', 'normal');
  pdf.text(saldo <= 0.001 ? 'Encerrada' : 'Em aberto', col2 + 28, y + 24);

  y += 32;

  // Saídas vinculadas
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  pdf.text('Saídas de Malha Vinculadas', margin, y);
  y += 2;

  const exitRows: any[] = [];
  const pushRow = (r: any) => exitRows.push([
    dateBR(r.issue_date),
    r.invoice_number || '-',
    r.article_name || '-',
    fmt(Number(r.weight_kg || 0)),
    fmt(Number(r.deduct_kg || 0)),
  ]);
  (params.linked || []).forEach(pushRow);
  (params.legacy || []).forEach(pushRow);

  autoTable(pdf, {
    startY: y + 2,
    head: [['Data', 'NF Saída', 'Artigo de Malha', 'Peso Saída (kg)', 'Descontado (kg)']],
    body: exitRows.length ? exitRows.map(r => r.map((c: any) => sanitizePdfText(String(c ?? '')))) : [['-', '-', 'Nenhuma saída vinculada', '-', '-']],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: colors.headerFill, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: margin, right: margin },
    foot: exitRows.length ? [['', '', 'TOTAL', fmt(exitRows.reduce((s, r) => s + (parseFloat(String(r[3]).replace(/\./g, '').replace(',', '.')) || 0), 0)), fmt(totalSaida)]] : undefined,
    footStyles: { fillColor: [255, 251, 235], textColor: colors.textDark, fontStyle: 'bold' },
  });

  pdf.save(`nf-entrada-${entry.invoice_number || 'sem-numero'}-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
}