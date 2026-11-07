export interface CompanyMaintenanceState {
  company_id: string;
  enabled: boolean;
  can_manage: boolean;
  new_app_url: string | null;
}

export function parseCompanyMaintenanceState(value: unknown, companyId: string): CompanyMaintenanceState {
  if (!value || typeof value !== 'object' || !('company_id' in value) || value.company_id !== companyId ||
    !('enabled' in value) || typeof value.enabled !== 'boolean' ||
    !('can_manage' in value) || typeof value.can_manage !== 'boolean') {
    throw new Error('Não foi possível verificar o acesso à empresa.');
  }
  const rawUrl = 'new_app_url' in value ? value.new_app_url : null;
  if (rawUrl !== null && rawUrl !== undefined && typeof rawUrl !== 'string') {
    throw new Error('Não foi possível verificar o acesso à empresa.');
  }
  const newAppUrl = typeof rawUrl === 'string' && rawUrl.trim() !== '' ? rawUrl : null;
  return { company_id: companyId, enabled: value.enabled, can_manage: value.can_manage, new_app_url: newAppUrl };
}

export function isCompanyMaintenanceBlocked(state: CompanyMaintenanceState): boolean {
  return (state.enabled || state.new_app_url !== null) && !state.can_manage;
}
