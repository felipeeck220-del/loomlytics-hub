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

function drawHeader(pdf: any, opts: BaseOpts, pageWidth: number, margin: number, y: number) {
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
  invoices: any[]; // already filtered
  exitLinksAll: any[];
  allClients: any[];
  allArticles: any[];
  yarnTypes: any[];
  exportType?: 'entrada' | 'saida' | 'ambos';
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

  // KPIs
  const filtered = params.invoices.filter(i => exportType === 'ambos' ? true : i.type === exportType);
  const totalEntrada = filtered.filter(i => i.type === 'entrada').reduce((s, i) => s + (i.items?.[0]?.weight_kg || 0), 0);
  const totalSaida = filtered.filter(i => i.type === 'saida').reduce((s, i) => s + (i.items?.[0]?.weight_kg || 0), 0);
  const totalNotas = filtered.length;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  pdf.text(`Total de Notas: ${totalNotas}    Entrada (kg): ${fmt(totalEntrada)}    Saída (kg): ${fmt(totalSaida)}    Saldo: ${fmt(totalEntrada - totalSaida)}`, margin, y);
  y += 4;

  const rows = filtered
    .slice()
    .sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || ''))
    .map(inv => {
      const cli = params.allClients.find(c => c.id === inv.client_id)?.name || '-';
      const item = inv.items?.[0];
      // Yarn name: para entrada usa yarn_type direto; para saida tenta inferir via vínculos
      let yarnName = '-';
      if (inv.type === 'entrada') {
        yarnName = params.yarnTypes.find(y => y.id === item?.yarn_type_id)?.name || '-';
      } else {
        const links = params.exitLinksAll.filter(l => l.exit_invoice_id === inv.id);
        const names = Array.from(new Set(links.map(l => params.yarnTypes.find(y => y.id === l.yarn_type_id)?.name).filter(Boolean))) as string[];
        if (names.length) yarnName = names.join(' + ');
        else {
          // legado: parent_invoice_id
          const parent = params.invoices.find(p => p.id === inv.parent_invoice_id);
          if (parent) yarnName = params.yarnTypes.find(y => y.id === parent.items?.[0]?.yarn_type_id)?.name || '-';
        }
      }
      const weight = Number(item?.weight_kg || 0);
      let pesoEntrada = '-';
      let pesoSaida = '-';
      let saldoStr = '-';
      if (inv.type === 'entrada') {
        pesoEntrada = fmt(weight);
        const links = params.exitLinksAll.filter(l => l.entry_invoice_id === inv.id);
        const weightFromLinks = links.reduce((s, l) => s + Number(l.deduct_kg || 0), 0);
        const linkedExitIds = new Set(links.map(l => l.exit_invoice_id));
        const legacy = params.invoices.filter(i => i.type === 'saida' && i.parent_invoice_id === inv.id && !linkedExitIds.has(i.id));
        const weightLegacy = legacy.reduce((s, i) => s + Number(i.items?.[0]?.weight_kg || 0), 0);
        const totalSaidaInv = weightFromLinks + weightLegacy;
        saldoStr = fmt(Math.max(0, weight - totalSaidaInv));
      } else {
        pesoSaida = fmt(weight);
      }
      return [
        dateBR(inv.issue_date),
        inv.invoice_number || '-',
        cli,
        yarnName,
        inv.supplier_name || '-',
        pesoEntrada,
        pesoSaida,
        saldoStr,
      ].map((c: any) => sanitizePdfText(String(c ?? '')));
    });

  autoTable(pdf, {
    startY: y + 2,
    head: [['Data', 'NF', 'Cliente', 'Fio', 'Fornecedor', 'Peso Entrada (kg)', 'Peso Saída (kg)', 'Saldo (kg)']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: colors.headerFill, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  pdf.save(`notas-clientes-geral-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
}

export async function exportClientInvoiceByNfPdf(params: {
  companyName: string;
  logoUrl: string | null;
  entry: any;
  exitLinks: any[]; // exit_links of this entry
  exits: any[]; // exit invoices linked or legacy
  client: any;
  yarnTypes: any[];
  allArticles: any[];
}) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  const logoInfo = await loadLogoForPdf(params.logoUrl);

  const entry = params.entry;
  const entryWeight = Number(entry.items?.[0]?.weight_kg || 0);
  const yarnName = params.yarnTypes.find(y => y.id === entry.items?.[0]?.yarn_type_id)?.name || '-';

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
  const totalSaida = params.exitLinks.reduce((s, l) => s + Number(l.deduct_kg || 0), 0)
    + params.exits.filter(e => e.parent_invoice_id === entry.id && !params.exitLinks.find(l => l.exit_invoice_id === e.id))
        .reduce((s, e) => s + Number(e.items?.[0]?.weight_kg || 0), 0);
  const saldo = Math.max(0, entryWeight - totalSaida);
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
  // From new links
  params.exitLinks.forEach(link => {
    const exit = params.exits.find(e => e.id === link.exit_invoice_id);
    if (!exit) return;
    const art = params.allArticles.find(a => a.id === exit.items?.[0]?.article_id)?.name || '-';
    exitRows.push([
      dateBR(exit.issue_date),
      exit.invoice_number || '-',
      art,
      fmt(exit.items?.[0]?.weight_kg || 0),
      fmt(link.deduct_kg || 0),
    ]);
  });
  // Legacy exits
  params.exits
    .filter(e => e.parent_invoice_id === entry.id && !params.exitLinks.find(l => l.exit_invoice_id === e.id))
    .forEach(exit => {
      const art = params.allArticles.find(a => a.id === exit.items?.[0]?.article_id)?.name || '-';
      exitRows.push([
        dateBR(exit.issue_date),
        exit.invoice_number || '-',
        art,
        fmt(exit.items?.[0]?.weight_kg || 0),
        fmt(exit.items?.[0]?.weight_kg || 0),
      ]);
    });

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