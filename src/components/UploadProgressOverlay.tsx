import { useEffect, useState } from 'react';
import { uploadProgress, type UploadProgressState } from '@/lib/uploadProgress';
import { Loader2, CheckCircle2, AlertTriangle, ImageIcon, UploadCloud } from 'lucide-react';

/**
 * Overlay global de progresso para operações de compressão + upload de fotos
 * (Mecânica OC/OE e Ordens de Frete). Renderizado uma única vez em App.tsx.
 */
export default function UploadProgressOverlay() {
  const [s, setS] = useState<UploadProgressState>(uploadProgress.getState());
  useEffect(() => uploadProgress.subscribe(setS), []);
  if (!s.open) return null;

  const isError = s.phase === 'error';
  const isDone = s.phase === 'done';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      aria-live="polite"
      aria-busy={!isDone && !isError}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          {isError ? (
            <AlertTriangle className="h-6 w-6 text-destructive" />
          ) : isDone ? (
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          )}
          <div className="min-w-0">
            <div className="font-semibold truncate">{s.title || 'Enviando fotos'}</div>
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isError ? 'bg-destructive' : isDone ? 'bg-green-600' : 'bg-primary'}`}
              style={{ width: `${Math.max(2, s.percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{s.total > 1 ? `Foto ${s.current} de ${s.total}` : 'Processando'}</span>
            <span className="tabular-nums">{s.percent}%</span>
          </div>
        </div>

        {/* Passos com ícones */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <StepBadge
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="Comprimindo"
            active={s.phase === 'compressing'}
            done={['uploading', 'finalizing', 'done'].includes(s.phase)}
          />
          <StepBadge
            icon={<UploadCloud className="h-3.5 w-3.5" />}
            label="Enviando"
            active={s.phase === 'uploading'}
            done={['finalizing', 'done'].includes(s.phase)}
          />
        </div>

        {isError && s.error && (
          <div className="text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-2">
            {s.error}
          </div>
        )}
      </div>
    </div>
  );
}

function StepBadge({ icon, label, active, done }: { icon: React.ReactNode; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
      active ? 'border-primary bg-primary/10 text-primary' :
      done   ? 'border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-500' :
               'border-border bg-muted/40 text-muted-foreground'
    }`}>
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}
