import { describe, expect, it } from 'vitest';
import { isCompanyMaintenanceBlocked, parseCompanyMaintenanceState } from './companyMaintenance';

describe('company maintenance access', () => {
  it('blocks users while company maintenance is enabled', () => {
    expect(isCompanyMaintenanceBlocked({ company_id: 'trama', enabled: true, can_manage: false, new_app_url: null })).toBe(true);
  });
  it('restores user access when maintenance is disabled', () => {
    expect(isCompanyMaintenanceBlocked({ company_id: 'trama', enabled: false, can_manage: false, new_app_url: null })).toBe(false);
  });
  it('preserves access for the server-authorized maintenance manager', () => {
    expect(isCompanyMaintenanceBlocked({ company_id: 'trama', enabled: true, can_manage: true, new_app_url: null })).toBe(false);
  });
  it('never applies another company maintenance state', () => {
    expect(() => parseCompanyMaintenanceState({ company_id: 'other', enabled: false, can_manage: true }, 'trama')).toThrow();
  });
  it('rejects unverified or malformed access flags', () => {
    expect(() => parseCompanyMaintenanceState({ company_id: 'trama', enabled: true, can_manage: 'true' }, 'trama')).toThrow();
    expect(() => parseCompanyMaintenanceState(null, 'trama')).toThrow();
  });
});

describe('new app version notice', () => {
  it('keeps the new app link when the notice is enabled', () => {
    const state = parseCompanyMaintenanceState({ company_id: 'trama', enabled: false, can_manage: true, new_app_url: 'https://apptramacerta.web.app/' }, 'trama');
    expect(state.new_app_url).toBe('https://apptramacerta.web.app/');
  });
  it('treats empty or missing link as notice disabled', () => {
    expect(parseCompanyMaintenanceState({ company_id: 'trama', enabled: false, can_manage: true, new_app_url: '  ' }, 'trama').new_app_url).toBeNull();
    expect(parseCompanyMaintenanceState({ company_id: 'trama', enabled: false, can_manage: true, new_app_url: null }, 'trama').new_app_url).toBeNull();
    expect(parseCompanyMaintenanceState({ company_id: 'trama', enabled: false, can_manage: true }, 'trama').new_app_url).toBeNull();
  });
  it('rejects a malformed new app link value', () => {
    expect(() => parseCompanyMaintenanceState({ company_id: 'trama', enabled: false, can_manage: true, new_app_url: 42 }, 'trama')).toThrow();
  });
});