import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Mantém o badge do ícone do PWA sincronizado com a contagem de notificações
 * não-lidas do usuário logado. Também expõe o contador para o sino do header.
 *
 * - Faz uma query inicial ao entrar na sessão.
 * - Assina realtime em `notifications` para o próprio user_id.
 * - Chama `navigator.setAppBadge(count)` (ou `clearAppBadge()` quando 0).
 * - No-op em navegadores sem suporte (iOS Safari padrão, Firefox).
 */
export function useNotificationsBadge() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications-unread-count', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count } = await (supabase.from as any)('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .is('read_at', null);
      return count || 0;
    },
    staleTime: 30_000,
  });

  // Realtime → invalida a query quando algo do próprio user_id muda
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['notifications-unread-count', user.id] });
          qc.invalidateQueries({ queryKey: ['notifications-list', user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  // Sincroniza badge do ícone do PWA
  useEffect(() => {
    const count = query.data ?? 0;
    try {
      const nav = navigator as any;
      if (typeof nav.setAppBadge === 'function') {
        if (count > 0) nav.setAppBadge(count);
        else if (typeof nav.clearAppBadge === 'function') nav.clearAppBadge();
      }
    } catch { /* silencioso */ }
  }, [query.data]);

  return { unreadCount: query.data ?? 0, isLoading: query.isLoading };
}