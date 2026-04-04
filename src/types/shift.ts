export type ShiftType = 'manha' | 'tarde' | 'noite';

export const SHIFT_LABELS: Record<ShiftType, string> = {
  manha: 'Manhã (5h - 13:30)',
  tarde: 'Tarde (13:30 - 22h)',
  noite: 'Noite (22h - 5h)',
};

export const SHIFT_MINUTES: Record<ShiftType, number> = {
  manha: 510,
  tarde: 510,
  noite: 420,
};

export interface CompanyShiftSettings {
  shift_manha_start: string;
  shift_manha_end: string;
  shift_tarde_start: string;
  shift_tarde_end: string;
  shift_noite_start: string;
  shift_noite_end: string;
}

export const DEFAULT_SHIFT_SETTINGS: CompanyShiftSettings = {
  shift_manha_start: '05:00',
  shift_manha_end: '13:30',
  shift_tarde_start: '13:30',
  shift_tarde_end: '22:00',
  shift_noite_start: '22:00',
  shift_noite_end: '05:00',
};

/** Calculate shift duration in minutes from time strings (HH:MM) */
export function getShiftMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return endMin - startMin;
}

/** Get shift minutes map from company settings */
export function getCompanyShiftMinutes(settings?: CompanyShiftSettings): Record<ShiftType, number> {
  const s = settings || DEFAULT_SHIFT_SETTINGS;
  return {
    manha: getShiftMinutes(s.shift_manha_start, s.shift_manha_end),
    tarde: getShiftMinutes(s.shift_tarde_start, s.shift_tarde_end),
    noite: getShiftMinutes(s.shift_noite_start, s.shift_noite_end),
  };
}

/** Get shift labels from company settings */
export function getCompanyShiftLabels(settings?: CompanyShiftSettings): Record<ShiftType, string> {
  const s = settings || DEFAULT_SHIFT_SETTINGS;
  return {
    manha: `Manhã (${s.shift_manha_start} - ${s.shift_manha_end})`,
    tarde: `Tarde (${s.shift_tarde_start} - ${s.shift_tarde_end})`,
    noite: `Noite (${s.shift_noite_start} - ${s.shift_noite_end})`,
  };
}
