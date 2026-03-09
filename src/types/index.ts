export interface Company {
  id: string;
  name: string;
  admin_name: string;
  admin_email: string;
  whatsapp: string;
  created_at: string;
}

export interface Machine {
  id: string;
  company_id: string;
  number: number;
  name: string; // TEAR + number
  rpm: number;
  status: MachineStatus;
  article_id?: string;
  observations?: string;
  created_at: string;
}

export type MachineStatus = 'ativa' | 'manutencao_preventiva' | 'manutencao_corretiva' | 'troca_artigo' | 'inativa';

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  ativa: 'Ativa',
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  troca_artigo: 'Troca de Artigo',
  inativa: 'Inativa',
};

export const MACHINE_STATUS_COLORS: Record<MachineStatus, string> = {
  ativa: 'bg-success/10 text-success',
  manutencao_preventiva: 'bg-warning/10 text-warning',
  manutencao_corretiva: 'bg-destructive/10 text-destructive',
  troca_artigo: 'bg-info/10 text-info',
  inativa: 'bg-muted text-muted-foreground',
};

export interface MachineLog {
  id: string;
  machine_id: string;
  status: MachineStatus;
  started_at: string;
  ended_at?: string;
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
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  company_id: string;
  company_name: string;
  role: string;
}
