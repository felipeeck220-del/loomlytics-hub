import type { ShiftType } from './shift';

export interface Weaver {
  id: string;
  company_id: string;
  code: string;
  name: string;
  phone?: string;
  shift_type: 'fixo' | 'especifico';
  fixed_shift?: ShiftType;
  start_time?: string;
  end_time?: string;
  created_at: string;
}
