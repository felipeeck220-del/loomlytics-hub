 # 🔄 Ponto de Reversão — Lógica de Produção e Eficiência
 
 > **Data do Backup:** 10/05/2026 (Horário de Brasília)
 > **Arquivos de Origem:** `src/pages/Production.tsx`, `src/pages/Reports.tsx`, `src/lib/downtimeUtils.ts`
 
 ## 1. Cálculo de Eficiência (Registro de Produção)
 **Arquivo:** `src/pages/Production.tsx`
 
 ```typescript
 const preview = useMemo(() => {
   if (!form.shift || !form.rpm || !selectedArticle) return null;
   const shiftMinutes = effectiveShiftMinutes;
   const rpm = Number(form.rpm);
   const maxTurns = rpm * shiftMinutes;
 
   // In voltas mode, use actual voltas for efficiency
   if (machineMode === 'voltas') {
     const inicio = Number(form.voltas_inicio);
     const fim = Number(form.voltas_fim);
     if (!inicio || !fim || fim <= inicio) return null;
     const totalVoltas = fim - inicio;
     const turnsPerRoll = getTurnsForMachine(selectedArticle.id, form.machine_id);
     const rolls = turnsPerRoll > 0 ? totalVoltas / turnsPerRoll : 0;
     const weightKg = rolls * selectedArticle.weight_per_roll;
     const revenue = weightKg * selectedArticle.value_per_kg;
     const efficiency = maxTurns > 0 ? (totalVoltas / maxTurns) * 100 : 0;
     return { efficiency: Math.min(efficiency, 100), weightKg, revenue, rolls, extra previews: [], totalVoltas };
   }
 
   if (!form.rolls) return null;
 
   // Main article
   const mainRolls = Number(form.rolls);
   const mainTurnsPerRoll = getTurnsForMachine(selectedArticle.id, form.machine_id);
   const mainProducedTurns = mainRolls * mainTurnsPerRoll;
   const mainWeightKg = mainRolls * selectedArticle.weight_per_roll;
   const mainRevenue = mainWeightKg * selectedArticle.value_per_kg;
 
   // Extra articles
   let totalProducedTurns = mainProducedTurns;
   let totalWeightKg = mainWeightKg;
   let totalRevenue = mainRevenue;
   let totalRolls = mainRolls;
 
   const extraPreviews = extraArticles.map(ea => {
     const art = articles.find(a => a.id === ea.article_id);
     const rolls = Number(ea.rolls) || 0;
     if (!art || !rolls) return null;
     const turnsPerRoll = getTurnsForMachine(art.id, form.machine_id);
     const producedTurns = rolls * turnsPerRoll;
     const weightKg = rolls * art.weight_per_roll;
     const revenue = weightKg * art.value_per_kg;
     totalProducedTurns += producedTurns;
     totalWeightKg += weightKg;
     totalRevenue += revenue;
     totalRolls += rolls;
     return { rolls, weightKg, revenue, producedTurns };
   });
 
   const efficiency = maxTurns > 0 ? (totalProducedTurns / maxTurns) * 100 : 0;
   return { efficiency: Math.min(efficiency, 100), weightKg: totalWeightKg, revenue: totalRevenue, rolls: totalRolls, extraPreviews };
 }, [form.shift, form.rpm, form.rolls, form.voltas_inicio, form.voltas_fim, machineMode, selectedArticle, form.machine_id, articleMachineTurns, extraArticles, articles, effectiveShiftMinutes]);
 ```
 
 ## 2. Cálculo de Minutos Efetivos (Downtime)
 **Arquivo:** `src/lib/downtimeUtils.ts`
 
 ```typescript
 export function calculateShiftDowntime(
   machineLogs: MachineLog[],
   machineId: string,
   dateStr: string,
   shift: ShiftType,
   shiftSettings: CompanyShiftSettings,
   totalShiftMinutes: number,
 ): ShiftDowntimeInfo {
   const { start: shiftStart, end: shiftEnd } = getShiftDateRange(dateStr, shift, shiftSettings);
   
   const relevantLogs = machineLogs.filter(log =>
     log.machine_id === machineId &&
     DOWNTIME_STATUSES.includes(log.status),
   );
 
   const events: DowntimeEvent[] = [];
   for (const log of relevantLogs) {
     const logStart = new Date(log.started_at);
     const logEnd = log.ended_at ? new Date(log.ended_at) : new Date();
     const overlapStart = logStart < shiftStart ? shiftStart : logStart;
     const overlapEnd = logEnd > shiftEnd ? shiftEnd : logEnd;
     if (overlapStart >= overlapEnd) continue;
     const minutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
     if (minutes < 1) continue;
     events.push({
       status: log.status,
       label: MACHINE_STATUS_LABELS[log.status] || log.status,
       minutes: Math.round(minutes),
       startedAt: overlapStart,
       endedAt: overlapEnd,
     });
   }
   const totalDowntimeMinutes = events.reduce((sum, e) => sum + e.minutes, 0);
   const effectiveShiftMinutes = Math.max(0, totalShiftMinutes - totalDowntimeMinutes);
   return { events, totalDowntimeMinutes, effectiveShiftMinutes };
 }
 ```
 
 ## 3. Agregações e KPIs de Relatórios
 **Arquivo:** `src/pages/Reports.tsx`
 
 ```typescript
 const totalRolls = filtered.reduce((acc, p) => acc + p.rolls_produced, 0);
 const totalWeight = filtered.reduce((acc, p) => acc + p.weight_kg, 0);
 const totalRevenue = filtered.reduce((acc, p) => acc + p.revenue, 0);
 const prodWithEff = filtered.filter(p => p.efficiency > 0);
 const avgEfficiency = prodWithEff.length > 0
   ? prodWithEff.reduce((acc, p) => acc + (p.efficiency * p.weight_kg), 0) / prodWithEff.reduce((acc, p) => acc + p.weight_kg, 0)
   : 0;
 ```
 
 ## 4. Helpers de Turno
 **Arquivo:** `src/types/shift.ts` (Referenciado em `src/types/index.ts`)
 
 ```typescript
 export const getCompanyShiftMinutes = (settings: CompanyShiftSettings | null) => {
   const s = settings || DEFAULT_SHIFT_SETTINGS;
   return {
     manha: getShiftMinutes(s.shift_manha_start, s.shift_manha_end),
     tarde: getShiftMinutes(s.shift_tarde_start, s.shift_tarde_end),
     noite: getShiftMinutes(s.shift_noite_start, s.shift_noite_end),
   };
 };
 ```
*** Update File: docs/mestre.md
@@
 *Última atualização: 09/05/2026 21:40*
+*Última atualização: 10/05/2026 15:30*
@@
 - 09/05/2026 21:40 - Reversão do arquivo docs/rpcreports.md para a versão de planejamento funcional e detalhamento de filtros/exportação, atendendo à solicitação do usuário.
+- 10/05/2026 15:30 - Criação de rpcproduction.md e reversion_point_production_logic.md. Documentação de diretrizes para RPC (apenas filtros) e salvaguarda crítica dos códigos de cálculo de eficiência e produção.