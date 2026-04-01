import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import type { MachineStatus } from '@/types';
import { MACHINE_STATUS_LABELS } from '@/types';

interface ShiftSettings {
  shift_manha_start: string;
  shift_manha_end: string;
  shift_tarde_start: string;
  shift_tarde_end: string;
  shift_noite_start: string;
  shift_noite_end: string;
}

interface Machine {
  id: string;
  number: number;
  name: string;
  status: MachineStatus;
  article_id: string | null;
  production_mode: string;
  rpm: number;
}

interface Article {
  id: string;
  name: string;
  target_efficiency: number;
  turns_per_roll: number;
  weight_per_roll: number;
}

interface Production {
  machine_id: string;
  machine_name: string;
  weaver_name: string;
  efficiency: number;
  rolls_produced: number;
  weight_kg: number;
  shift: string;
}

interface Props {
  companyId: string;
  enabledMachines: string[];
  shiftSettings: ShiftSettings;
}

export default function TvMachineGrid({ companyId, enabledMachines, shiftSettings }: Props) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const code = localStorage.getItem('tv_panel_code');
      if (!code) return;

      const { data, error } = await supabase.functions.invoke('tv-panel-data', {
        body: { code },
      });

      if (error || data?.error) {
        console.error('Error fetching TV data:', data?.error || error);
        return;
      }

      setMachines(data.machines || []);
      setArticles(data.articles || []);
      setProductions(data.productions || []);
      setLastDate(data.last_production_date || null);
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // Poll every 60 seconds
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [companyId]);

  const filteredMachines = useMemo(() => {
    if (!enabledMachines || enabledMachines.length === 0) return machines;
    return machines.filter(m => enabledMachines.includes(m.id));
  }, [machines, enabledMachines]);

  const articleMap = useMemo(() => {
    const map = new Map<string, Article>();
    articles.forEach(a => map.set(a.id, a));
    return map;
  }, [articles]);

  const productionByMachine = useMemo(() => {
    const map = new Map<string, { efficiency: number; rolls: number; weightKg: number; weaverName: string }>();
    const byMachine = new Map<string, Production[]>();
    productions.forEach(p => {
      if (!byMachine.has(p.machine_id)) byMachine.set(p.machine_id, []);
      byMachine.get(p.machine_id)!.push(p);
    });
    byMachine.forEach((prods, machineId) => {
      const totalRolls = prods.reduce((s, p) => s + p.rolls_produced, 0);
      const totalWeight = prods.reduce((s, p) => s + (p.weight_kg || 0), 0);
      const avgEff = prods.reduce((s, p) => s + p.efficiency, 0) / prods.length;
      const lastWeaver = prods[prods.length - 1]?.weaver_name || '—';
      map.set(machineId, { efficiency: avgEff, rolls: totalRolls, weightKg: totalWeight, weaverName: lastWeaver });
    });
    return map;
  }, [productions]);

  // Determine grid columns based on machine count
  const gridCols = useMemo(() => {
    const count = filteredMachines.length;
    if (count <= 4) return 'grid-cols-2';
    if (count <= 8) return 'grid-cols-4';
    if (count <= 12) return 'grid-cols-4';
    if (count <= 16) return 'grid-cols-4';
    if (count <= 25) return 'grid-cols-5';
    return 'grid-cols-6';
  }, [filteredMachines.length]);

  // Calculate grid rows based on machine count and columns
  const gridRows = useMemo(() => {
    const count = filteredMachines.length;
    const cols = count <= 4 ? 2 : count <= 25 ? (count <= 8 ? 4 : count <= 16 ? 4 : 5) : 6;
    return Math.ceil(count / cols);
  }, [filteredMachines.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (filteredMachines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-2xl text-zinc-500">Nenhuma máquina configurada para este painel</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Date reference */}
      {lastDate && (
        <div className="text-center shrink-0">
          <span className="text-base text-zinc-400">
            Produção referente a: <span className="text-white font-semibold">
              {new Date(lastDate + 'T12:00:00').toLocaleDateString('pt-BR')}
            </span>
          </span>
        </div>
      )}

      {/* Machine grid - fills remaining space */}
      <div
        className={`grid ${gridCols} gap-2 flex-1 min-h-0`}
        style={{ gridTemplateRows: `repeat(${gridRows}, 1fr)` }}
      >
        {filteredMachines.map(machine => {
          const prod = productionByMachine.get(machine.id);
          const article = machine.article_id ? articleMap.get(machine.article_id) : null;
          const targetEff = article?.target_efficiency || 85;
          const efficiency = prod?.efficiency || 0;
          const isIot = machine.production_mode === 'iot';
          
          // Color logic
          let barColor = 'bg-destructive';
          let barBg = 'bg-destructive/20';
          if (efficiency >= targetEff) {
            barColor = 'bg-emerald-500';
            barBg = 'bg-emerald-500/20';
          } else if (efficiency >= targetEff - 10) {
            barColor = 'bg-amber-500';
            barBg = 'bg-amber-500/20';
          }

          // IoT status colors
          let cardBorder = 'border-zinc-800';
          let statusLabel = '';
          let statusColor = '';
          if (isIot) {
            if (machine.status === 'ativa') {
              cardBorder = 'border-emerald-500/40';
              statusLabel = 'Produzindo';
              statusColor = 'text-emerald-400';
            } else if (machine.status === 'inativa') {
              cardBorder = 'border-zinc-600';
              statusLabel = 'Parada';
              statusColor = 'text-zinc-400';
            } else {
              cardBorder = 'border-amber-500/40';
              statusLabel = MACHINE_STATUS_LABELS[machine.status] || machine.status;
              statusColor = 'text-amber-400';
            }
          }

          return (
            <div
              key={machine.id}
              className={`rounded-lg border-2 ${cardBorder} bg-zinc-900/60 p-2 flex flex-col justify-between transition-all overflow-hidden min-h-0`}
            >
              {/* Machine number */}
              <div className="text-center">
                <p className="text-lg font-black text-white leading-tight">{machine.name}</p>
                {isIot && statusLabel && (
                  <p className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</p>
                )}
              </div>

              {/* Efficiency */}
              <div className="text-center">
                <p className="text-2xl font-bold text-white leading-tight">
                  {efficiency > 0 ? `${efficiency.toFixed(1)}%` : '—'}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {isIot ? `Meta: ${targetEff}%` : `Eficiência: ${efficiency > 0 ? efficiency.toFixed(1) : '0'}/100%`}
                </p>
              </div>

              {/* Progress bar */}
              <div className={`w-full shrink-0 h-2 rounded ${barBg}`}>
                <div
                  className={`h-full rounded ${barColor} transition-all duration-700`}
                  style={{ width: `${Math.min(efficiency, 100)}%` }}
                />
              </div>

              {/* Pieces + Kg + Weaver */}
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-300 leading-tight">
                  {prod ? `${prod.rolls} ${machine.production_mode === 'voltas' ? 'voltas' : 'pçs'}` : '—'}
                </p>
                {prod && prod.weightKg > 0 && (
                  <p className="text-xs text-zinc-400 leading-tight">
                    {prod.weightKg.toLocaleString('pt-BR')} kg
                  </p>
                )}
                <p className="text-xs text-zinc-500 truncate leading-tight">
                  {prod?.weaverName || '—'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
