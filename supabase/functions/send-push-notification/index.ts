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

type Source = 'OM' | 'OC' | 'OT' | 'OFR';

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
    const {
      company_id,
      title,
      message,
      url,
      roles,
      source,          // 'OM' | 'OC' | 'OT' | 'OFR'
      ref_id,          // uuid da ordem
      ref_number,      // 'OM #012', 'OFR #45'…
      include_admins,  // boolean — adiciona todos os admins da empresa aos destinatários
      target_user_ids, // string[] — usuários específicos (ex.: freteiro)
    } = body || {};
    if (!company_id || !title) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Confirma que o usuário pertence à company
    const { data: caller } = await admin.from('profiles').select('company_id').eq('user_id', uid).maybeSingle();
    if (!caller || caller.company_id !== company_id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---------- Resolução de destinatários ----------
    const userIdsSet = new Set<string>();

    // (1) por roles
    const roleList: string[] = Array.isArray(roles) && roles.length ? roles : [];
    // include_admins → força role 'admin'
    if (include_admins && !roleList.includes('admin')) roleList.push('admin');
    if (roleList.length) {
      const { data: targets } = await admin.from('profiles').select('user_id').eq('company_id', company_id).in('role', roleList);
      for (const r of (targets || []) as any[]) userIdsSet.add(r.user_id);
    }

    // (2) usuários explícitos
    if (Array.isArray(target_user_ids)) {
      for (const id of target_user_ids) if (typeof id === 'string' && id) userIdsSet.add(id);
    }

    // Fallback (compat): se ninguém foi informado, mantém comportamento antigo
    if (userIdsSet.size === 0) {
      const { data: targets } = await admin.from('profiles').select('user_id').eq('company_id', company_id).in('role', ['mecanico', 'lider_mecanica']);
      for (const r of (targets || []) as any[]) userIdsSet.add(r.user_id);
    }

    // Não notifica o próprio autor da ação
    userIdsSet.delete(uid);

    const userIds = Array.from(userIdsSet);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_targets' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---------- Persistir na tabela `notifications` ----------
    const validSource: Source | null =
      source === 'OM' || source === 'OC' || source === 'OT' || source === 'OFR' ? source : null;

    if (validSource) {
      // Idempotência: se o mesmo evento (source+ref_id+title) já foi entregue a este
      // usuário nos últimos 60s, NÃO cria nova linha — evita duplicatas quando o
      // callsite dispara duas vezes (retry, double-click residual, StrictMode).
      const dedupeWindowMs = 60_000;
      const sinceIso = new Date(Date.now() - dedupeWindowMs).toISOString();
      const rowsToInsert: any[] = [];
      for (const user_id of userIds) {
        let dupQ = admin
          .from('notifications')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', user_id)
          .eq('source', validSource)
          .eq('title', title)
          .gte('created_at', sinceIso);
        if (ref_id) dupQ = dupQ.eq('ref_id', ref_id);
        const { count: dupCount } = await dupQ;
        if ((dupCount || 0) > 0) continue;
        rowsToInsert.push({
          company_id,
          user_id,
          source: validSource,
          ref_id: ref_id || null,
          ref_number: ref_number || null,
          title,
          body: message || null,
          url: url || '/',
        });
      }
      if (rowsToInsert.length) {
        const { error: insErr } = await admin.from('notifications').insert(rowsToInsert);
        if (insErr) console.error('notifications insert failed', insErr);
      }
    }

    // ---------- Contagem de não-lidas por usuário (após insert) ----------
    const unreadByUser: Record<string, number> = {};
    for (const user_id of userIds) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .is('read_at', null);
      unreadByUser[user_id] = count || 0;
    }

    // ---------- Envio Web Push ----------
    const { data: subsRaw } = await admin.from('push_subscriptions').select('*').in('user_id', userIds);

    // Dedup por endpoint — se o mesmo endpoint aparecer duas vezes (linhas
    // legadas, mesmo device já reinstalado com outro user_id), envia UMA vez só.
    // Prioriza a linha cujo user_id ainda está entre os destinatários atuais.
    const seen = new Set<string>();
    const subs: any[] = [];
    for (const s of (subsRaw || []) as any[]) {
      if (!s?.endpoint || seen.has(s.endpoint)) continue;
      seen.add(s.endpoint);
      subs.push(s);
    }

    let sent = 0, removed = 0;
    for (const s of subs) {
      const badge = unreadByUser[s.user_id] || 0;
      const payload = JSON.stringify({
        title,
        body: message || '',
        url: url || '/',
        source: validSource,
        ref_id: ref_id || null,
        ref_number: ref_number || null,
        badge,
        tag: validSource && ref_id ? `${validSource}-${ref_id}` : undefined,
      });
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

    return new Response(JSON.stringify({ sent, removed, targets: subs?.length || 0, recipients: userIds.length }), {
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