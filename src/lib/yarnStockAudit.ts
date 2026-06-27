import { supabase } from '@/integrations/supabase/client';

export interface YarnAuditCtx {
  companyId: string;
  userId?: string;
  userName?: string | null;
  userCode?: string | null;
  userRole?: string | null;
}

/** Log a yarn stock movement + a global audit_logs entry. */
export async function logYarnMovement(
  ctx: YarnAuditCtx,
  payload: {
    pallet_id: string;
    pallet_code?: string;
    type: 'entry' | 'exit' | 'assign_machine' | 'unassign_machine';
    boxes?: number;
    machine_id?: string | null;
    machine_name?: string | null;
    notes?: string;
    extra?: Record<string, any>;
  },
) {
  const { error: movErr } = await (supabase.from as any)('yarn_stock_movements').insert({
    company_id: ctx.companyId,
    pallet_id: payload.pallet_id,
    type: payload.type,
    boxes: payload.boxes ?? 0,
    machine_id: payload.machine_id ?? null,
    machine_name: payload.machine_name ?? null,
    notes: payload.notes ?? null,
    user_id: ctx.userId ?? null,
    user_name: ctx.userName ?? null,
    user_code: ctx.userCode ?? null,
    user_role: ctx.userRole ?? null,
  });
  if (movErr) console.error('yarn movement error', movErr);

  try {
    await (supabase.from as any)('audit_logs').insert({
      company_id: ctx.companyId,
      user_id: ctx.userId ?? null,
      user_name: ctx.userName ?? null,
      user_role: ctx.userRole ?? null,
      user_code: ctx.userCode ?? null,
      action: `yarn_stock_${payload.type}`,
      details: {
        pallet_id: payload.pallet_id,
        pallet_code: payload.pallet_code,
        boxes: payload.boxes,
        machine_id: payload.machine_id,
        machine_name: payload.machine_name,
        ...(payload.extra || {}),
      },
    });
  } catch (e) {
    console.error('audit_log error', e);
  }
}

/** Generate a 5-char alphanumeric uppercase code (A-Z + 0-9, ambiguous chars removed). */
export function generatePalletCode(_seed?: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

/** Generate a code that doesn't collide with existing codes (in-memory set). */
export function generateUniquePalletCode(existing: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const c = generatePalletCode();
    if (!existing.has(c)) return c;
  }
  return generatePalletCode() + Math.floor(Math.random() * 9);
}