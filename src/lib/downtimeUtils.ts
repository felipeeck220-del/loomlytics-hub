import type { MachineLog, MachineStatus, CompanyShiftSettings, ShiftType } from '@/types';
import { DEFAULT_SHIFT_SETTINGS, MACHINE_STATUS_LABELS } from '@/types';

/** Non-productive statuses */
const DOWNTIME_STATUSES: MachineStatus[] = [
  'manutencao_preventiva',
  'manutencao_corretiva',
  'troca_artigo',
  'troca_agulhas',
  'inativa',
];

export interface DowntimeEvent {
  status: MachineStatus;
  label: string;
  minutes: number;
  startedAt: Date;
  endedAt: Date;
}

export interface ShiftDowntimeInfo {
  events: DowntimeEvent[];
  totalDowntimeMinutes: number;
  effectiveShiftMinutes: number;
}

/**
 * Build the absolute Date range for a given shift on a given date.
 * E.g. date="2025-01-15", shift="manha", settings.shift_manha_start="05:00", end="13:30"
 *   → [2025-01-15T05:00, 2025-01-15T13:30]
 * For noite that crosses midnight (22:00→05:00):
 *   → [2025-01-15T22:00, 2025-01-16T05:00]
 */
function getShiftDateRange(
  dateStr: string,
  shift: ShiftType,
  settings: CompanyShiftSettings,
): { start: Date; end: Date } {
  const s = settings || DEFAULT_SHIFT_SETTINGS;
  const startTime = shift === 'manha' ? s.shift_manha_start : shift === 'tarde' ? s.shift_tarde_start : s.shift_noite_start;
  const endTime = shift === 'manha' ? s.shift_manha_end : shift === 'tarde' ? s.shift_tarde_end : s.shift_noite_end;

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  const start = new Date(dateStr + 'T00:00:00');
  start.setHours(sh, sm, 0, 0);

  const end = new Date(dateStr + 'T00:00:00');
  end.setHours(eh, em, 0, 0);

  // If end <= start, the shift crosses midnight
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

/**
 * Calculate downtime events for a machine during a specific shift on a specific date.
 * Clips log durations to the shift boundaries.
 */
export function calculateShiftDowntime(
  machineLogs: MachineLog[],
  machineId: string,
  dateStr: string,
  shift: ShiftType,
  shiftSettings: CompanyShiftSettings,
  totalShiftMinutes: number,
): ShiftDowntimeInfo {
  const { start: shiftStart, end: shiftEnd } = getShiftDateRange(dateStr, shift, shiftSettings);

  // Filter logs for this machine that have a downtime status
  const relevantLogs = machineLogs.filter(log =>
    log.machine_id === machineId &&
    DOWNTIME_STATUSES.includes(log.status),
  );

  const events: DowntimeEvent[] = [];

  for (const log of relevantLogs) {
    const logStart = new Date(log.started_at);
    const logEnd = log.ended_at ? new Date(log.ended_at) : new Date(); // still ongoing

    // Check if this log overlaps with the shift
    const overlapStart = logStart < shiftStart ? shiftStart : logStart;
    const overlapEnd = logEnd > shiftEnd ? shiftEnd : logEnd;

    if (overlapStart >= overlapEnd) continue; // no overlap

    const minutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
    if (minutes < 1) continue; // ignore less than 1 minute

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

/** Format minutes as "Xh Ymin" */
export function formatDowntimeMinutes(minutes: number): string {
  if (minutes < 1) return '0min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
