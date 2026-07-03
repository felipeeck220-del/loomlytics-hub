import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '@/lib/vapid';

/**
 * Registra o dispositivo para receber Web Push quando o usuário logado é
 * mecânico ou líder de mecânica. Silencioso — não pede permissão se o
 * navegador não suportar ou se já estiver negado.
 */
export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    const targetRoles = ['mecanico', 'lider_mecanica'];
    if (!targetRoles.includes(user.role as any)) return;

    let cancelled = false;

    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        // Só pede permissão se estiver default (não incomoda quem já negou/aceitou)
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return;
        } else if (Notification.permission !== 'granted') {
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
        }
        if (cancelled) return;
        const json: any = sub.toJSON();
        const endpoint = json.endpoint || sub.endpoint;
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;
        if (!endpoint || !p256dh || !auth) return;
        await (supabase.from as any)('push_subscriptions').upsert(
          {
            user_id: user.id,
            company_id: user.company_id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' }
        );
      } catch (err) {
        // silencioso — sem quebrar o app se o navegador negar
        console.debug('[push] subscribe failed', err);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.company_id, user?.role]);
}