import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, ImagePlus, Loader2, Trash2, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OfPhoto {
  id: string;
  path: string;
  description: string;
  author: string;
  ts: string;
}

type Draft = { id: string; file: File; preview: string; description: string };

const MAX_PHOTOS = 3;

const uid = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random()}`;

interface Props {
  open: boolean;
  order: any | null;
  companyId?: string | null;
  authorLabel: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Executa a coleta (RPC). Deve lançar erro em caso de conflito. */
  onConfirm: (photos: OfPhoto[]) => Promise<void>;
}

/**
 * Modal de confirmação de coleta da OF com anexo de até 3 fotos
 * (notas fiscais e outros). Reutiliza o padrão do sistema:
 * compressImage + overlay uploadProgress + bucket privado `of-photos`.
 */
export const OfCollectPhotosModal: React.FC<Props> = ({
  open, order, companyId, authorLabel, pending, onOpenChange, onConfirm,
}) => {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  const clearDrafts = () => {
    setDrafts(prev => {
      prev.forEach(d => { try { URL.revokeObjectURL(d.preview); } catch { /* */ } });
      return [];
    });
  };

  const addFile = (f: File | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 8 * 1024 * 1024) {
      toast({ title: 'Imagem acima de 8 MB', variant: 'destructive' });
      return;
    }
    setDrafts(prev => prev.length >= MAX_PHOTOS
      ? prev
      : [...prev, { id: uid(), file: f, preview: URL.createObjectURL(f), description: '' }]);
  };

  const handleConfirm = async () => {
    if (!order || saving) return;
    setSaving(true);
    const uploadedPaths: string[] = [];
    try {
      const uploaded: OfPhoto[] = [];
      if (drafts.length > 0 && companyId) {
        const { compressImage } = await import('@/lib/imageCompression');
        const { uploadProgress } = await import('@/lib/uploadProgress');
        uploadProgress.start('Enviando fotos da coleta', drafts.length);
        try {
          for (let i = 0; i < drafts.length; i++) {
            const d = drafts[i];
            uploadProgress.step({ index: i + 1, phase: 'compressing' });
            const c = await compressImage(d.file);
            const uf = c.file;
            const ext = (uf.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const pid = uid();
            const path = `${companyId}/${order.id}/${pid}.${ext}`;
            uploadProgress.step({ index: i + 1, phase: 'uploading' });
            const { error: upErr } = await supabase.storage.from('of-photos').upload(path, uf, {
              contentType: uf.type || 'image/jpeg',
              upsert: false,
            });
            if (upErr) throw upErr;
            uploadedPaths.push(path);
            uploaded.push({
              id: pid,
              path,
              description: d.description.trim(),
              author: authorLabel,
              ts: new Date().toISOString(),
            });
          }
          uploadProgress.step({ index: drafts.length, phase: 'finalizing' });
          uploadProgress.done();
        } catch (err) {
          uploadProgress.fail('Falha ao enviar fotos');
          throw err;
        }
      }

      await onConfirm(uploaded);
      clearDrafts();
    } catch (err: any) {
      // Rollback das imagens já enviadas quando a coleta não se concretizou
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('of-photos').remove(uploadedPaths).catch(() => { /* */ });
      }
      if (err?.code !== 'CONFLICT') {
        toast({ title: 'Erro ao confirmar coleta', description: err?.message || 'Tente novamente', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || !!pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) clearDrafts();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[95vw] sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-600">
            <Truck className="h-5 w-5" /> Confirmar Coleta — OF #{order?.of_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Antes de finalizar, tire até <strong>{MAX_PHOTOS} fotos</strong> das notas fiscais e demais
            documentos/volumes. As imagens são comprimidas automaticamente antes do envio.
          </p>

          <div className="space-y-3">
            {drafts.map((d, idx) => (
              <div key={d.id} className="flex gap-3 items-start rounded-md border p-2">
                <img src={d.preview} alt={`Foto ${idx + 1} da coleta`} className="h-20 w-20 object-cover rounded shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Input
                    value={d.description}
                    placeholder="Descrição (opcional) — ex.: NF 12345"
                    onChange={(e) => {
                      const v = e.target.value;
                      setDrafts(prev => prev.map(p => p.id === d.id ? { ...p, description: v } : p));
                    }}
                  />
                  <div className="text-[11px] text-muted-foreground truncate">{d.file.name}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-600 shrink-0"
                  disabled={busy}
                  onClick={() => {
                    setDrafts(prev => prev.filter(p => p.id !== d.id));
                    try { URL.revokeObjectURL(d.preview); } catch { /* */ }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {drafts.length < MAX_PHOTOS && !busy && (
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="flex-1">
                  <div className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed cursor-pointer text-sm hover:bg-muted">
                    <Camera className="h-4 w-4" /> Tirar foto
                  </div>
                  <input
                    type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0] || null; e.currentTarget.value = ''; addFile(f); }}
                  />
                </label>
                <label className="flex-1">
                  <div className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed cursor-pointer text-sm hover:bg-muted">
                    <ImagePlus className="h-4 w-4" /> Galeria
                  </div>
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0] || null; e.currentTarget.value = ''; addFile(f); }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => { clearDrafts(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5" disabled={busy} onClick={handleConfirm}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar Coleta{drafts.length > 0 ? ` (${drafts.length} foto${drafts.length > 1 ? 's' : ''})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OfCollectPhotosModal;