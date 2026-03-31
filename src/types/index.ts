export interface Company {
  id: string;
  name: string;
  admin_name: string;
  admin_email: string;
  whatsapp: string;
  created_at: string;
}

export type ProductionMode = 'rolos' | 'voltas';

export const PRODUCTION_MODE_LABELS: Record<ProductionMode, string> = {
  rolos: 'Rolos',
  voltas: 'Voltas',
};

export interface Machine {
  id: string;
  company_id: string;
  number: number;
  name: string; // TEAR + number
  rpm: number;
  status: MachineStatus;
  article_id?: string;
  observations?: string;
  production_mode: ProductionMode;
  created_at: string;
}

export type MachineStatus = 'ativa' | 'manutencao_preventiva' | 'manutencao_corretiva' | 'troca_artigo' | 'troca_agulhas' | 'inativa';

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  ativa: 'Ativa',
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  troca_artigo: 'Troca de Artigo',
  troca_agulhas: 'Troca de Agulheiro',
  inativa: 'Inativa',
};

export const MACHINE_STATUS_COLORS: Record<MachineStatus, string> = {
  ativa: 'bg-success/10 text-success',
  manutencao_preventiva: 'bg-warning/10 text-warning',
  manutencao_corretiva: 'bg-destructive/10 text-destructive',
  troca_artigo: 'bg-info/10 text-info',
  troca_agulhas: 'bg-purple-500/10 text-purple-600',
  inativa: 'bg-muted text-muted-foreground',
};

export interface MachineLog {
  id: string;
  machine_id: string;
  status: MachineStatus;
  started_at: string;
  ended_at?: string;
  started_by_name?: string;
  started_by_code?: string;
  ended_by_name?: string;
  ended_by_code?: string;
}

export interface Client {
  id: string;
  company_id: string;
  name: string;
  contact?: string;
  observations?: string;
  created_at: string;
}

export interface Article {
  id: string;
  company_id: string;
  name: string;
  client_id: string;
  client_name?: string;
  weight_per_roll: number; // kg
  value_per_kg: number; // R$
  turns_per_roll: number;
  target_efficiency: number; // % (e.g. 80, 90)
  observations?: string;
  created_at: string;
}

export interface ArticleMachineTurns {
  id: string;
  article_id: string;
  machine_id: string;
  company_id: string;
  turns_per_roll: number;
  observations?: string;
  created_at: string;
}

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
  if (endMin <= startMin) endMin += 24 * 60; // crosses midnight
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

export interface Weaver {
  id: string;
  company_id: string;
  code: string; // #100 - #999
  name: string;
  phone?: string;
  shift_type: 'fixo' | 'especifico';
  fixed_shift?: ShiftType;
  start_time?: string;
  end_time?: string;
  created_at: string;
}

export interface Production {
  id: string;
  company_id: string;
  date: string;
  shift: ShiftType;
  machine_id: string;
  machine_name?: string;
  weaver_id: string;
  weaver_name?: string;
  article_id: string;
  article_name?: string;
  rpm: number;
  rolls_produced: number;
  weight_kg: number;
  revenue: number;
  efficiency: number;
  created_by_name?: string;
  created_by_code?: string;
  created_at: string;
}

export type MeasureType = 'kg' | 'metro';

export const MEASURE_TYPE_LABELS: Record<MeasureType, string> = {
  kg: 'Quilogramas (kg)',
  metro: 'Metros (m)',
};

export interface DefectRecord {
  id: string;
  company_id: string;
  machine_id: string;
  article_id: string;
  weaver_id: string;
  date: string;
  shift: ShiftType;
  measure_type: MeasureType;
  measure_value: number;
  machine_name?: string;
  article_name?: string;
  weaver_name?: string;
  observations?: string;
  created_by_name?: string;
  created_by_code?: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  role: string;
}
