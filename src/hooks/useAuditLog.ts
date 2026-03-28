import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useAuditLog() {
  const { user } = useAuth();
  const [profileCode, setProfileCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (supabase.from as any)('profiles')
      .select('code')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        setProfileCode(data?.code || null);
      });
  }, [user?.id]);

  const userCode = profileCode || (user?.role === 'admin' ? '1' : null);

  const logAction = useCallback(async (action: string, details?: Record<string, any>) => {
    if (!user?.company_id) return;
    try {
      await (supabase.from as any)('audit_logs').insert({
        company_id: user.company_id,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        user_code: userCode,
        action,
        details: details || {},
      });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  }, [user, userCode]);

  const userTrackingInfo = {
    created_by_name: user?.name || null,
    created_by_code: userCode,
  };

  return { logAction, userCode, userName: user?.name || null, userTrackingInfo };
}
