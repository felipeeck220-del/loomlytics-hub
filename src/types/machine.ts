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
  year?: number;
  last_needle_change_at?: string;
  last_sinker_change_at?: string;
  cylinder_id?: string;
  machine_type?: 'mono' | 'dupla';
  current_needle_id?: string;
  current_sinker_id?: string;
  current_needle_lot_id?: string;
  maintenance_interval_days?: number;
  maintenance_kg_target?: number;
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
  lot_id?: string;
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

// =============== Ordem de Manutenção (OM) ===============
export type MaintenanceOrderStatus = 'aberto' | 'em_curso' | 'finalizada' | 'cancelada';
export type MaintenanceOrderType = 'manutencao_preventiva' | 'manutencao_corretiva' | 'troca_artigo' | 'troca_agulhas';
export type MaintenanceOrderPriority = 'normal' | 'prioritaria';

export const MAINTENANCE_ORDER_STATUS_LABELS: Record<MaintenanceOrderStatus, string> = {
  aberto: 'Aberto',
  em_curso: 'Em Curso',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export interface MaintenanceOrder {
  id: string;
  company_id: string;
  om_number: number;
  oc_number?: number | null;
  machine_id: string;
  type: MaintenanceOrderType;
  priority: MaintenanceOrderPriority;
  status: MaintenanceOrderStatus;
  description?: string | null;
  created_by_id?: string | null;
  created_by_name?: string | null;
  created_at: string;
  started_at?: string | null;
  started_by_id?: string | null;
  started_by_name?: string | null;
  finished_at?: string | null;
  finished_by_id?: string | null;
  finished_by_name?: string | null;
  duration_seconds?: number | null;
  cancelled_at?: string | null;
  cancelled_by_id?: string | null;
  cancelled_by_name?: string | null;
  cancellation_reason?: string | null;
  machine_log_id?: string | null;
  progress_notes?: Array<{ id: string; ts: string; author: string | null; kind: 'observacao' | 'item'; text: string }> | null;
  finish_notes?: string | null;
  oc_photos?: Array<{ id: string; path: string; description: string; author: string | null; ts: string }> | null;
}

export type MaintenanceOrderItemType = 'agulha' | 'platina' | 'cilindro' | 'outro';

export interface MaintenanceOrderItem {
  id: string;
  company_id: string;
  order_id: string;
  item_type: MaintenanceOrderItemType;
  needle_id?: string | null;
  sinker_id?: string | null;
  cylinder_id?: string | null;
  description?: string | null;
  quantity: number;
  created_at: string;
}
