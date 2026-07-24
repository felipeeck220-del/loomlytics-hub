// Store global (sem lib externa) que controla um overlay de progresso
// para operações de compressão + upload de fotos (OC/OE e OFR).
// Uso:
//   uploadProgress.start('Enviando fotos da OC', total);
//   uploadProgress.step({ index, phase: 'compressing' });
//   uploadProgress.step({ index, phase: 'uploading', bytes, totalBytes });
//   uploadProgress.done();  // ou uploadProgress.fail('mensagem')

export type UploadPhase = 'idle' | 'preparing' | 'compressing' | 'uploading' | 'finalizing' | 'done' | 'error';

export interface UploadProgressState {
  open: boolean;
  title: string;
  total: number;      // total de fotos
  current: number;    // índice 1-based da foto sendo tratada
  phase: UploadPhase;
  label: string;      // mensagem contextual (ex.: "Comprimindo foto 1 de 2…")
  percent: number;    // 0..100 estimado
  error?: string | null;
}

type Listener = (s: UploadProgressState) => void;

const state: UploadProgressState = {
  open: false,
  title: '',
  total: 0,
  current: 0,
  phase: 'idle',
  label: '',
  percent: 0,
  error: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l({ ...state });
}

function computePercent() {
  if (state.total <= 0) return 0;
  // Cada foto vale 100/total; compress = 40%, upload = 90%, finalizing = 100%
  const perPhoto = 100 / state.total;
  const base = (state.current - 1) * perPhoto;
  let frac = 0;
  switch (state.phase) {
    case 'preparing': frac = 0.05; break;
    case 'compressing': frac = 0.4; break;
    case 'uploading': frac = 0.9; break;
    case 'finalizing': frac = 1; break;
    case 'done': return 100;
    case 'error': return state.percent;
    default: frac = 0;
  }
  return Math.min(100, Math.round(base + perPhoto * frac));
}

export const uploadProgress = {
  subscribe(l: Listener) {
    listeners.add(l);
    l({ ...state });
    return () => { listeners.delete(l); };
  },
  getState(): UploadProgressState { return { ...state }; },
  start(title: string, total: number) {
    // Se não há nada para enviar, não abre o overlay (evita "Foto 1 de 1"
    // espúrio quando o chamador dispara start(..., 0) sem checar).
    if (!total || total <= 0) {
      state.open = false;
      state.phase = 'idle';
      state.total = 0;
      state.current = 0;
      state.percent = 0;
      state.error = null;
      emit();
      return;
    }
    state.open = true;
    state.title = title;
    state.total = total;
    state.current = 1;
    state.phase = 'preparing';
    state.label = total > 1 ? `Preparando ${total} fotos…` : 'Preparando foto…';
    state.percent = 2;
    state.error = null;
    emit();
  },
  step(opts: { index?: number; phase: UploadPhase; label?: string }) {
    // Se o overlay não foi aberto (ex.: start com total=0), ignora os steps
    // para não abrir uma UI vazia no meio de uma operação sem fotos.
    if (!state.open) return;
    if (opts.index != null) state.current = opts.index;
    state.phase = opts.phase;
    if (opts.label) state.label = opts.label;
    else {
      const suffix = state.total > 1 ? ` (${state.current}/${state.total})` : '';
      if (opts.phase === 'compressing') state.label = `Comprimindo foto${suffix}…`;
      else if (opts.phase === 'uploading') state.label = `Enviando foto${suffix}…`;
      else if (opts.phase === 'finalizing') state.label = 'Finalizando…';
    }
    state.percent = computePercent();
    emit();
  },
  done() {
    if (!state.open) return;
    state.phase = 'done';
    state.percent = 100;
    state.label = 'Concluído';
    emit();
    // fecha automaticamente após pequeno delay para o usuário ver 100%
    setTimeout(() => {
      if (state.phase === 'done') {
        state.open = false;
        state.phase = 'idle';
        emit();
      }
    }, 500);
  },
  fail(message: string) {
    state.phase = 'error';
    state.error = message;
    state.label = message;
    emit();
    setTimeout(() => {
      if (state.phase === 'error') {
        state.open = false;
        state.phase = 'idle';
        state.error = null;
        emit();
      }
    }, 2200);
  },
  close() {
    state.open = false;
    state.phase = 'idle';
    state.error = null;
    emit();
  },
};
