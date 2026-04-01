import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Delete, Check, Monitor } from 'lucide-react';

export default function TvCodeEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [autoChecking, setAutoChecking] = useState(true);

  // Auto-reconnect from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tv_panel_code');
    if (saved) {
      validateCode(saved, true);
    } else {
      setAutoChecking(false);
    }
  }, []);

  const validateCode = async (codeToValidate: string, isAuto = false) => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-tv-code', {
        body: { code: codeToValidate },
      });
      if (fnError || data?.error) {
        if (isAuto) {
          localStorage.removeItem('tv_panel_code');
          setAutoChecking(false);
          setLoading(false);
          return;
        }
        setError(data?.error || 'Código inválido');
        setShake(true);
        setTimeout(() => setShake(false), 600);
      } else {
        localStorage.setItem('tv_panel_code', codeToValidate);
        localStorage.setItem('tv_panel_data', JSON.stringify(data));
        navigate('/tela/painel', { replace: true });
      }
    } catch {
      setError('Erro de conexão');
      if (isAuto) {
        localStorage.removeItem('tv_panel_code');
        setAutoChecking(false);
      }
    }
    setLoading(false);
  };

  const handleDigit = useCallback((digit: string) => {
    if (code.length >= 8) return;
    setError('');
    setCode(prev => prev + digit);
  }, [code]);

  const handleDelete = useCallback(() => {
    setError('');
    setCode(prev => prev.slice(0, -1));
  }, []);

  const handleConfirm = useCallback(() => {
    if (code.length === 8) {
      validateCode(code);
    }
  }, [code]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading) return;
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Enter') handleConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDigit, handleDelete, handleConfirm, loading]);

  if (autoChecking) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const digits = code.split('');

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-4 select-none cursor-default"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <Monitor className="h-10 w-10 text-primary" />
        <h1 className="text-4xl font-black text-white tracking-tight">MALHAGEST</h1>
      </div>

      <p className="text-xl text-zinc-400 mb-8">Digite o código da tela</p>

      {/* Code display */}
      <div className={`flex gap-3 mb-4 transition-transform ${shake ? 'animate-shake' : ''}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`w-16 h-20 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all
              ${i < digits.length
                ? 'border-primary bg-primary/10 text-white'
                : i === digits.length
                  ? 'border-primary/50 bg-zinc-900 text-zinc-500'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-600'
              }`}
          >
            {digits[i] || ''}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-destructive text-lg mb-4 animate-fade-in">{error}</p>
      )}

      {/* Virtual numpad */}
      <div className="grid grid-cols-3 gap-3 mt-6 max-w-xs w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button
            key={d}
            onClick={() => handleDigit(d)}
            disabled={loading || code.length >= 8}
            className="h-16 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-2xl font-bold transition-all disabled:opacity-30"
          >
            {d}
          </button>
        ))}
        <button
          onClick={handleDelete}
          disabled={loading || code.length === 0}
          className="h-16 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white flex items-center justify-center transition-all disabled:opacity-30"
        >
          <Delete className="h-6 w-6" />
        </button>
        <button
          onClick={() => handleDigit('0')}
          disabled={loading || code.length >= 8}
          className="h-16 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-2xl font-bold transition-all disabled:opacity-30"
        >
          0
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading || code.length !== 8}
          className="h-16 rounded-xl bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground flex items-center justify-center transition-all disabled:opacity-30"
        >
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-7 w-7" />}
        </button>
      </div>

      <p className="text-zinc-600 text-sm mt-10">
        Acesse <span className="text-zinc-400">Configurações &gt; Telas</span> para gerar um código
      </p>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
