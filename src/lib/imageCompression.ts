// Utilitário de compressão de imagens no navegador (canvas → JPEG).
// Usado antes de upload em Mecânica OC e Ordens de Frete (OFR)
// para reduzir drasticamente o tempo de envio em conexões móveis.
//
// Estratégia:
//  - Se o arquivo já é pequeno (< SKIP_BYTES) ou não é imagem, retorna original.
//  - Redimensiona proporcionalmente para caber em MAX_DIM x MAX_DIM.
//  - Reencoda como JPEG com qualidade QUALITY.
//  - Se o resultado ficar maior que o original (raro), devolve o original.
//
// Tempo típico em celular médio (Android intermediário):
//   - Foto 3-5 MB, 4000x3000 → ~250-500 ms para comprimir.
//   - Foto 8-12 MP moderna    → ~400-800 ms.
// Redução típica: 70% a 90% do tamanho original
// (ex.: 3.5 MB → ~350 KB; 8 MB → ~600 KB).

const MAX_DIM = 1600;
const QUALITY = 0.72;
const SKIP_BYTES = 300 * 1024; // <300KB não vale a pena comprimir

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  durationMs: number;
  skipped: boolean;
}

/** Comprime uma imagem (best-effort). Nunca lança — em caso de erro devolve o original. */
export async function compressImage(input: File): Promise<CompressResult> {
  const started = performance.now();
  const originalBytes = input.size;
  const done = (file: File, skipped: boolean): CompressResult => ({
    file,
    originalBytes,
    compressedBytes: file.size,
    durationMs: Math.round(performance.now() - started),
    skipped,
  });

  try {
    if (!input.type.startsWith('image/')) return done(input, true);
    if (input.type === 'image/gif' || input.type === 'image/svg+xml') return done(input, true);
    if (originalBytes < SKIP_BYTES) return done(input, true);

    const bitmap = await loadBitmap(input);
    const { width: w0, height: h0 } = bitmap;
    const scale = Math.min(1, MAX_DIM / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = (canvas as any).getContext('2d');
    if (!ctx) return done(input, true);
    ctx.drawImage(bitmap as any, 0, 0, w, h);
    if ((bitmap as any).close) (bitmap as any).close();

    const blob: Blob | null = await canvasToBlob(canvas as any, 'image/jpeg', QUALITY);
    if (!blob || blob.size >= originalBytes) return done(input, true);

    const baseName = (input.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    const outFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    return done(outFile, false);
  } catch (e) {
    console.warn('[compressImage] falhou, usando original', e);
    return done(input, true);
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation garante que fotos verticais de celular não fiquem giradas.
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    } catch {
      // fallback abaixo
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type, quality });
  }
  return new Promise(resolve => (canvas as HTMLCanvasElement).toBlob(b => resolve(b), type, quality));
}