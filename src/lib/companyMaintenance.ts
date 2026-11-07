export interface CompanyMaintenanceState {
  company_id: string;
  enabled: boolean;
  can_manage: boolean;
}

export function parseCompanyMaintenanceState(value: unknown, companyId: string): CompanyMaintenanceState {
  if (!value || typeof value !== 'object' || !('company_id' in value) || value.company_id !== companyId ||
    !('enabled' in value) || typeof value.enabled !== 'boolean' ||
    !('can_manage' in value) || typeof value.can_manage !== 'boolean') {
    throw new Error('Não foi possível verificar o acesso à empresa.');
  }
  return { company_id: companyId, enabled: value.enabled, can_manage: value.can_manage };
}

export function isCompanyMaintenanceBlocked(state: CompanyMaintenanceState): boolean {
  return state.enabled && !state.can_manage;
}