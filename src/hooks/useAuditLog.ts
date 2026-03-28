import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useAuditLog() {
  const { user } = useAuth();

  const logAction = useCallback(async (action: string, details?: Record<string, any>) => {
    if (!user?.company_id) return;
    try {
      // Get user code from profiles
      const { data: profile } = await (supabase.from as any)('profiles')
        .select('code')
        .eq('user_id', user.id)
        .maybeSingle();

      await (supabase.from as any)('audit_logs').insert({
        company_id: user.company_id,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        user_code: profile?.code || null,
        action,
        details: details || {},
      });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  }, [user]);

  return { logAction };
}
