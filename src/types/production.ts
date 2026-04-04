import type { ShiftType } from './shift';

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
