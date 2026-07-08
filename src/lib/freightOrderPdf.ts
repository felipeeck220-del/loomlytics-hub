import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { sanitizePdfText } from './pdfUtils';
import type { FreightOrder } from '@/hooks/useFreightOrders';

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtNumberBR(n: number, dec = 2): string {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function duration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso || !toIso) return '—';
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateFreightOrderPdf(order: FreightOrder, companyName: string, companyLogoUrl?: string | null) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  // ===== Standard system header (matches Reports.tsx pattern) =====
  const headerH = 25;
  const leftX = margin + 5;
  const rightX = pageW - margin - 5;
  const grayBg: [number, number, number] = [249, 250, 251];
  const border: [number, number, number] = [229, 231, 235];
  const textDark: [number, number, number] = [17, 24, 39];
  const textMid: [number, number, number] = [107, 114, 128];

  pdf.setFillColor(...grayBg);
  pdf.rect(margin, y, pageW - 2 * margin, headerH, 'F');
  pdf.setDrawColor(...border);
  pdf.setLineWidth(0.5);
  pdf.rect(margin, y, pageW - 2 * margin, headerH, 'S');

  const dateStr = `Emitido em ${fmtDateTime(new Date().toISOString())}`;
  let logoDrawn = false;
  if (companyLogoUrl) {
    const logo = await fetchImageDataUrl(companyLogoUrl);
    if (logo) {
      const fmt = logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      try {
        pdf.addImage(logo, fmt as any, leftX, y + 2.5, 24, 14);
        logoDrawn = true;
      } catch { /* ignore */ }
    }
  }
  if (!logoDrawn && companyName) {
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...textDark);
    pdf.text(sanitizePdfText(companyName), leftX, y + 10);
  }
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...textMid);
  pdf.text(dateStr, leftX, y + 22);

  // Center: title
  pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...textDark);
  const title = sanitizePdfText(`RELATÓRIO DE ORDEM DE FRETE`);
  pdf.text(title, pageW / 2, y + 11, { align: 'center' });
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(`OFR #${order.ofr_number}`), pageW / 2, y + 18, { align: 'center' });

  // Right: status
  const statusLabel =
    order.status === 'open' ? 'ABERTO' :
    order.status === 'pickup_in_progress' || order.status === 'delivery_in_progress' ? 'EM CURSO' :
    order.status === 'completed' ? 'FINALIZADO' :
    order.status === 'cancelled' ? 'CANCELADO' : String(order.status).toUpperCase();
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...textDark);
  pdf.text(sanitizePdfText(`Status: ${statusLabel}`), rightX, y + 10, { align: 'right' });
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...textMid);
  pdf.text(sanitizePdfText(`Criada em ${fmtDateTime(order.created_at)}`), rightX, y + 22, { align: 'right' });

  pdf.setTextColor(0, 0, 0);
  y += headerH + 6;

  // Dados gerais
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
  const rows: [string, string][] = [
    ['Freteiro', sanitizePdfText(order.freighter?.name || '—')],
    ['Veículo', sanitizePdfText(order.freighter?.vehicle || '—')],
    ['Telefone', sanitizePdfText(order.freighter?.phone || '—')],
    ['Local de coleta', sanitizePdfText(order.pickup_location)],
    ['Local de entrega', sanitizePdfText(order.delivery_location)],
    ['NF / Romaneio', order.delivery_doc_number
      ? `${order.delivery_doc_type === 'rom' ? 'Romaneio' : 'NF'} ${sanitizePdfText(order.delivery_doc_number)}`
      : '—'],
    ['Valor por kg', order.freight_price_per_kg != null ? `R$ ${fmtNumberBR(Number(order.freight_price_per_kg), 4)}` : '—'],
    ['Total do frete', order.freight_total != null ? `R$ ${fmtNumberBR(Number(order.freight_total))}` : '—'],
    ['Observações', sanitizePdfText(order.observations || '—')],
  ];
  autoTable(pdf, {
    startY: y,
    theme: 'plain',
    body: rows,
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
    margin: { left: 12, right: 12 },
  });
  y = (pdf as any).lastAutoTable.finalY + 4;

  // Itens
  const totalPieces = (order.items || []).reduce((s, i) => s + Number(i.pieces || 0), 0);
  const totalBoxes = (order.items || []).reduce((s, i) => s + Number(i.boxes || 0), 0);
  const totalKg = (order.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
  autoTable(pdf, {
    startY: y,
    head: [['Tipo', 'Descrição', 'Peças', 'Caixas', 'Peso (kg)']],
    body: (order.items || []).map(i => [
      i.item_type === 'fio' ? 'Fio' : 'Malha',
      sanitizePdfText(i.item_type === 'fio' ? (i.yarn_type_name || '—') : (i.article?.name || i.article_name || '—')),
      i.item_type === 'fio' ? '—' : String(i.pieces || 0),
      i.item_type === 'fio' ? String(i.boxes || 0) : '—',
      fmtNumberBR(Number(i.weight_kg || 0)),
    ]),
    foot: [['', 'TOTAL', String(totalPieces), String(totalBoxes), fmtNumberBR(totalKg)]],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    margin: { left: 12, right: 12 },
  });
  y = (pdf as any).lastAutoTable.finalY + 4;

  // Linha do tempo
  autoTable(pdf, {
    startY: y,
    head: [['Etapa', 'Início', 'Fim', 'Duração']],
    body: [
      ['Aberto (criação)', fmtDateTime(order.created_at), fmtDateTime(order.pickup_started_at), duration(order.created_at, order.pickup_started_at)],
      ['Frete em curso', fmtDateTime(order.pickup_started_at), fmtDateTime(order.completed_at), duration(order.pickup_started_at, order.completed_at)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110] },
    styles: { fontSize: 9 },
    margin: { left: 12, right: 12 },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Fotos
  if ((order.photos || []).length > 0) {
    if (y > pageH - 90) { pdf.addPage(); y = 15; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
    pdf.text('Fotos da entrega', 12, y); y += 4;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const photoW = 80, photoH = 60, gap = 8, descH = 8;
    let col = 0;
    for (const p of order.photos || []) {
      const { data } = await supabase.storage.from('freight-photos').createSignedUrl(p.storage_path, 300);
      if (!data?.signedUrl) continue;
      const dataUrl = await fetchImageDataUrl(data.signedUrl);
      if (!dataUrl) continue;
      const x = 12 + col * (photoW + gap);
      const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      try { pdf.addImage(dataUrl, fmt as any, x, y, photoW, photoH); } catch { /* ignore */ }
      if (p.description) pdf.text(sanitizePdfText(p.description).slice(0, 60), x, y + photoH + 4);
      col += 1;
      if (col >= 2) { col = 0; y += photoH + descH + 4; }
    }
    if (col > 0) y += photoH + descH + 4;
  }

  // Rodapé auditoria
  if (y > pageH - 22) { pdf.addPage(); y = 15; }
  pdf.setDrawColor(220); pdf.line(12, y, pageW - 12, y); y += 5;
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(90);
  const created = order.creator ? `${sanitizePdfText(order.creator.name)} #${order.creator.code}` : '—';
  const completedBy = order.completer ? `${sanitizePdfText(order.completer.name)} #${order.completer.code}` : '—';
  pdf.text(`Criada por: ${created} em ${fmtDateTime(order.created_at)}`, 12, y); y += 4;
  pdf.text(`Finalizada por: ${completedBy} em ${fmtDateTime(order.completed_at)}`, 12, y);

  pdf.save(`OFR-${order.ofr_number}.pdf`);
}