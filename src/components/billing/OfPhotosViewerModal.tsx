import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ImageIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { OfPhoto } from './OfCollectPhotosModal';

interface Props {
  order: any | null;
  onOpenChange: (open: boolean) => void;
}

/** Visualizador das fotos anexadas na coleta da OF (bucket privado → signed URLs). */
export const OfPhotosViewerModal: React.FC<Props> = ({ order, onOpenChange }) => {
  const photos: OfPhoto[] = Array.isArray(order?.collect_photos) ? order.collect_photos : [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!order || photos.length === 0) { setUrls({}); return; }
    setLoading(true);
    (async () => {
      const next: Record<string, string> = {};
      for (const p of photos) {
        const { data } = await supabase.storage.from('of-photos').createSignedUrl(p.path, 3600);
        if (data?.signedUrl) next[p.id] = data.signedUrl;
      }
      if (active) { setUrls(next); setLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            <ImageIcon className="h-5 w-5" /> Fotos da coleta — OF #{order?.of_number}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fotos…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {photos.map((p) => (
              <div key={p.id} className="rounded-md border overflow-hidden">
                {urls[p.id] ? (
                  <a href={urls[p.id]} target="_blank" rel="noreferrer">
                    <img src={urls[p.id]} alt={p.description || 'Foto da coleta da OF'} className="w-full h-56 object-cover" />
                  </a>
                ) : (
                  <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">Indisponível</div>
                )}
                <div className="p-2 text-xs space-y-0.5">
                  {p.description && <div className="font-medium break-words">{p.description}</div>}
                  <div className="text-muted-foreground break-words">
                    {p.author} {p.ts ? `· ${format(new Date(p.ts), 'dd/MM/yyyy HH:mm')}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {photos.length === 0 && (
              <div className="text-sm text-muted-foreground py-6">Nenhuma foto anexada.</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OfPhotosViewerModal;