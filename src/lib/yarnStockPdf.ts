import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';

export interface PalletPdfData {
  code: string;
  yarn_type_name?: string | null;
  client_name?: string | null;
  supplier_name?: string | null;
  total_boxes: number;
  created_at?: string;
}

async function loadCompanyHeader(companyId: string) {
  const { data } = await (supabase.from as any)('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle();
  return { name: data?.name || '', logoUrl: data?.logo_url || null };
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

/** Generate vertical A4 PDF with the pallet QR + info. */
export async function generatePalletQrPdf(pallet: PalletPdfData, companyId: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();

  const { name: companyName, logoUrl } = await loadCompanyHeader(companyId);

  // Header background
  doc.setFillColor(245, 247, 250);
  doc.rect(0, 0, pageW, 35, 'F');

  if (logoUrl) {
    const dataUrl = await loadImage(logoUrl);
    if (dataUrl) {
      try { doc.addImage(dataUrl, 'PNG', 10, 6, 24, 24); } catch {}
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 30, 50);
  doc.text(companyName || 'Estoque Fio', 40, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 110);
  doc.text(`Cliente: ${pallet.client_name || '—'}`, 40, 23);
  doc.text(`Fio: ${pallet.yarn_type_name || '—'}`, 40, 29);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 30, 50);
  doc.text('PALETE DE FIO', pageW / 2, 55, { align: 'center' });

  // QR
  const qrDataUrl = await QRCode.toDataURL(pallet.code, { width: 600, margin: 1 });
  const qrSize = 120;
  doc.addImage(qrDataUrl, 'PNG', (pageW - qrSize) / 2, 65, qrSize, qrSize);

  // Code under QR
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(pallet.code, pageW / 2, 65 + qrSize + 12, { align: 'center' });

  // Info block
  const infoY = 65 + qrSize + 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(40, 50, 70);
  const lines: [string, string][] = [
    ['Cliente', pallet.client_name || '—'],
    ['Tipo de Fio', pallet.yarn_type_name || '—'],
    ['Fornecedor', pallet.supplier_name || '—'],
    ['Total de Caixas', String(pallet.total_boxes)],
  ];
  let y = infoY;
  for (const [k, v] of lines) {
    doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, 25, y);
    doc.setFont('helvetica', 'normal'); doc.text(v, 75, y);
    y += 9;
  }

  // Footer date
  doc.setFontSize(9);
  doc.setTextColor(120, 130, 145);
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  doc.text(`Emitido em ${dd}/${mm}/${yyyy}`, pageW / 2, 285, { align: 'center' });

  doc.save(`palete-${pallet.code}.pdf`);
}