import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@malhagest.site';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json();
    const { company_id, title, message, url, roles } = body || {};
    if (!company_id || !title) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Confirma que o usuário pertence à company
    const { data: caller } = await admin.from('profiles').select('company_id').eq('id', uid).maybeSingle();
    if (!caller || caller.company_id !== company_id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Descobre usuários da empresa com os roles alvo
    const targetRoles: string[] = Array.isArray(roles) && roles.length ? roles : ['mecanico', 'lider_mecanica'];
    const { data: targets } = await admin.from('profiles').select('id').eq('company_id', company_id).in('role', targetRoles);
    const userIds = (targets || []).map((r: any) => r.id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_targets' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds);
    const payload = JSON.stringify({ title, body: message || '', url: url || '/' });

    let sent = 0, removed = 0;
    for (const s of (subs || []) as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 6 }
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id);
          removed++;
        } else {
          console.error('push send failed', status, err?.body || err?.message);
        }
      }
    }

    return new Response(JSON.stringify({ sent, removed, targets: subs?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('send-push-notification error', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});