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
