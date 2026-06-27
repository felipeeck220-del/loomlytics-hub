import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Keyboard, X, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
}

export function QrScannerModal({ open, onClose, onResult }: Props) {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  const containerId = 'yarn-qr-scanner-region';

  // Reset processing state when modal is closed/opened
  useEffect(() => {
    if (!open) setProcessing(null);
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'camera') return;
    let cancelled = false;
    setError(null);
    const start = async () => {
      try {
        const html5Qrcode = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = html5Qrcode;
        await html5Qrcode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (cancelled) return;
            cancelled = true;
            const code = decoded.trim();
            setProcessing(code);
            html5Qrcode.stop().then(() => html5Qrcode.clear()).catch(() => {});
            // Small delay so user sees the "lido" feedback and to avoid UI lock
            setTimeout(() => onResultRef.current(code), 700);
          },
          () => {},
        );
      } catch (e: any) {
        setError('Não foi possível acessar a câmera. Use o código manual.');
        setMode('manual');
      }
    };
    start();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        try {
          if ((s as any).getState && (s as any).getState() === 2) {
            s.stop().then(() => s.clear()).catch(() => {});
          } else {
            try { s.clear(); } catch {}
          }
        } catch {}
        scannerRef.current = null;
      }
    };
  }, [open, mode]);

  const handleManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setProcessing(code);
    setManualCode('');
    setTimeout(() => onResult(code), 400);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Ler QR Code do Palete
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera para o QR do palete ou digite o código manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button size="sm" variant={mode === 'camera' ? 'default' : 'outline'} onClick={() => setMode('camera')}>
            <Camera className="h-4 w-4 mr-1" /> Câmera
          </Button>
          <Button size="sm" variant={mode === 'manual' ? 'default' : 'outline'} onClick={() => setMode('manual')}>
            <Keyboard className="h-4 w-4 mr-1" /> Manual
          </Button>
        </div>

        {mode === 'camera' ? (
          <div className="space-y-2">
            <div className="relative">
              <div id={containerId} className="w-full rounded-md overflow-hidden bg-black aspect-square" />
              {processing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-md gap-2 text-white">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                  <p className="text-sm font-semibold">QR lido</p>
                  <p className="text-xs font-mono opacity-80">{processing}</p>
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Processando...
                  </div>
                </div>
              )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Código do palete (ex.: FIO-...)"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManual()}
              autoFocus
              disabled={!!processing}
            />
            <Button className="w-full" onClick={handleManual} disabled={!!processing}>
              {processing ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>) : 'Buscar palete'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}