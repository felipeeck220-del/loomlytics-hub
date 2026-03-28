import { supabase } from '@/integrations/supabase/client';

interface AuditLogParams {
  action: string;
  details?: Record<string, any>;
  companyId: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  userCode?: string;
}

export async function logAudit({ action, details, companyId, userId, userName, userRole, userCode }: AuditLogParams) {
  try {
    await (supabase.from as any)('audit_logs').insert({
      company_id: companyId,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      user_code: userCode,
      action,
      details: details || {},
    });
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
}
