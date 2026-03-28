import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify JWT and check platform admin status
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;

    // Check if user is a platform admin using service role
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminCheck } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Você não é um administrador da plataforma.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, ...params } = body;
    console.log('Action received:', action, typeof action);

    if (action === 'list_companies') {
      const { data: companies, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: settings } = await supabase
        .from('company_settings')
        .select('*');

      const { data: profiles } = await supabase
        .from('profiles')
        .select('company_id, user_id');

      const settingsMap = new Map((settings || []).map((s: any) => [s.company_id, s]));
      const profileCounts = new Map<string, number>();
      (profiles || []).forEach((p: any) => {
        profileCounts.set(p.company_id, (profileCounts.get(p.company_id) || 0) + 1);
      });

      const result = companies.map((c: any) => ({
        ...c,
        settings: settingsMap.get(c.id) || null,
        user_count: profileCounts.get(c.id) || 0,
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_users') {
      // Fetch all profiles with company info
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*, companies:company_id(name, slug)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch company settings for nav items info
      const { data: settings } = await supabase
        .from('company_settings')
        .select('company_id, enabled_nav_items, platform_active');

      const settingsMap = new Map((settings || []).map((s: any) => [s.company_id, s]));

      const result = (profiles || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        email: p.email,
        role: p.role,
        status: p.status,
        company_id: p.company_id,
        company_name: p.companies?.name || '',
        company_slug: p.companies?.slug || '',
        created_at: p.created_at,
        settings: settingsMap.get(p.company_id) || null,
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_user_nav_items') {
      const { company_id, enabled_nav_items } = params;

      const { error } = await supabase
        .from('company_settings')
        .upsert({
          company_id,
          enabled_nav_items,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_settings') {
      const { company_id, monthly_plan_value, platform_active, enabled_nav_items } = params;

      const { error } = await supabase
        .from('company_settings')
        .upsert({
          company_id,
          monthly_plan_value,
          platform_active,
          enabled_nav_items,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_platform_settings') {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*');

      if (error) throw error;

      const result: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        result[row.key] = row.value;
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_platform_settings') {
      const { settings } = params;

      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from('platform_settings')
          .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
