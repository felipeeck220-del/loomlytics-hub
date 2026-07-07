import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type Source = 'OM' | 'OC' | 'OT' | 'OFR';

/**
 * Ao montar (ou quando `source`/`refId` mudarem), marca como lidas todas as
 * notificações do usuário logado para a source informada. Se `refId` for
 * fornecido, marca apenas as daquele item.
 */
export function useMarkSourceAsRead(source: Source, refId?: string) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        let q = (supabase.from as any)('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('source', source)
          .is('read_at', null);
        if (refId) q = q.eq('ref_id', refId);
        await q;
        if (cancelled) return;
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, source, refId]);
}