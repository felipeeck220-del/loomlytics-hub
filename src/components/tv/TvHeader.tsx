import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';

interface ShiftSettings {
  shift_manha_start: string;
  shift_manha_end: string;
  shift_tarde_start: string;
  shift_tarde_end: string;
  shift_noite_start: string;
  shift_noite_end: string;
}

function getCurrentShift(settings: ShiftSettings): string {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();

  const parse = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const ranges = [
    { name: 'Manhã', start: parse(settings.shift_manha_start), end: parse(settings.shift_manha_end) },
    { name: 'Tarde', start: parse(settings.shift_tarde_start), end: parse(settings.shift_tarde_end) },
    { name: 'Noite', start: parse(settings.shift_noite_start), end: parse(settings.shift_noite_end) },
  ];

  for (const r of ranges) {
    if (r.end > r.start) {
      if (mins >= r.start && mins < r.end) return r.name;
    } else {
      // crosses midnight
      if (mins >= r.start || mins < r.end) return r.name;
    }
  }
  return 'Noite';
}

interface Props {
  companyName: string;
  panelName: string;
  logoUrl: string | null;
  shiftSettings: ShiftSettings;
}

export default function TvHeader({ companyName, panelName, logoUrl, shiftSettings }: Props) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const shift = getCurrentShift(shiftSettings);
  const timeStr = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('pt-BR');

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-zinc-900/80 border-b border-zinc-800">
      {/* Left: Logo + Company */}
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-10 w-10 object-contain rounded-lg" />
        ) : (
          <Monitor className="h-8 w-8 text-primary" />
        )}
        <span className="text-xl font-bold text-white tracking-tight">{companyName}</span>
      </div>

      {/* Center: Panel name */}
      <div className="flex items-center gap-2">
        <span className="text-lg text-zinc-400 font-medium">{panelName}</span>
      </div>

      {/* Right: Time + Shift + Date */}
      <div className="flex items-center gap-6 text-zinc-300">
        <span className="text-2xl font-mono font-bold tabular-nums">{timeStr}</span>
        <span className="text-lg">Turno: <span className="text-primary font-semibold">{shift}</span></span>
        <span className="text-lg text-zinc-500">{dateStr}</span>
      </div>
    </div>
  );
}
