export type ProductionMode = 'rolos' | 'voltas' | 'iot';

export const PRODUCTION_MODE_LABELS: Record<ProductionMode, string> = {
  rolos: 'Rolos',
  voltas: 'Voltas',
  iot: 'IoT (Automático)',
};

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

export interface Machine {
  id: string;
  company_id: string;
  number: number;
  name: string;
  rpm: number;
  status: MachineStatus;
  article_id?: string;
  observations?: string;
  production_mode: ProductionMode;
  created_at: string;
  model?: string;
  diameter?: string;
  fineness?: string;
  needle_quantity?: number;
  feeder_quantity?: number;
  serial_number?: string;
  last_needle_change_at?: string;
  last_sinker_change_at?: string;
  cylinder_id?: string;
  machine_type?: 'mono' | 'dupla';
  current_needle_id?: string;
  current_sinker_id?: string;
}

export type NeedleRefPosition = 'mono' | 'cilindro' | 'disco';

export interface MachineNeedleRef {
  id: string;
  company_id: string;
  machine_id: string;
  needle_id: string;
  position: NeedleRefPosition;
  created_at: string;
}

export interface MachineSinkerRef {
  id: string;
  company_id: string;
  machine_id: string;
  sinker_id: string;
  created_at: string;
}

export interface Cylinder {
  id: string;
  company_id: string;
  brand: string;
  model?: string;
  diameter?: string;
  fineness?: string;
  needle_quantity?: number;
  feeder_quantity?: number;
  sinker_quantity?: number;
  observations?: string;
  machine_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SinkerInventory {
  id: string;
  company_id: string;
  provider: string;
  brand: string;
  reference_code: string;
  current_quantity: number;
  created_at: string;
  updated_at: string;
}

export type SinkerTransactionType = 'entry' | 'exit';
export type SinkerExitMode = 'troca_platinas' | 'reposicao';

export interface SinkerTransaction {
  id: string;
  company_id: string;
  sinker_id: string;
  type: SinkerTransactionType;
  exit_mode?: SinkerExitMode;
  quantity: number;
  date: string;
  machine_id?: string;
  created_at: string;
  created_by_id?: string;
  created_by_name?: string;
}
 
 export interface NeedleInventory {
   id: string;
   company_id: string;
   provider: string;
   brand: string;
   reference_code: string;
   current_quantity: number;
   created_at: string;
   updated_at: string;
 }
 
 export type NeedleTransactionType = 'entry' | 'exit';
 export type NeedleExitMode = 'troca_agulheiro' | 'reposicao';
 
 export interface NeedleTransaction {
   id: string;
   company_id: string;
   needle_id: string;
   type: NeedleTransactionType;
   exit_mode?: NeedleExitMode;
   quantity: number;
   date: string;
   machine_id?: string;
   created_at: string;
   created_by_id?: string;
   created_by_name?: string;
 }

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
