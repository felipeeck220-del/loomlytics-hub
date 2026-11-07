import { describe, expect, it } from 'vitest';
import { isCompanyMaintenanceBlocked, parseCompanyMaintenanceState } from './companyMaintenance';

describe('company maintenance access', () => {
  it('blocks users while company maintenance is enabled', () => {
    expect(isCompanyMaintenanceBlocked({ company_id: 'trama', enabled: true, can_manage: false })).toBe(true);
  });
  it('restores user access when maintenance is disabled', () => {
    expect(isCompanyMaintenanceBlocked({ company_id: 'trama', enabled: false, can_manage: false })).toBe(false);
  });
  it('preserves access for the server-authorized maintenance manager', () => {
    expect(isCompanyMaintenanceBlocked({ company_id: 'trama', enabled: true, can_manage: true })).toBe(false);
  });
  it('never applies another company maintenance state', () => {
    expect(() => parseCompanyMaintenanceState({ company_id: 'other', enabled: false, can_manage: true }, 'trama')).toThrow();
  });
  it('rejects unverified or malformed access flags', () => {
    expect(() => parseCompanyMaintenanceState({ company_id: 'trama', enabled: true, can_manage: 'true' }, 'trama')).toThrow();
    expect(() => parseCompanyMaintenanceState(null, 'trama')).toThrow();
  });
});