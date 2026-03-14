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
    const { email, password, setup_key } = await req.json();

    // Simple one-time setup protection
    const SETUP_KEY = Deno.env.get('ADMIN_PASSWORD');
    if (setup_key !== SETUP_KEY) {
      return new Response(JSON.stringify({ error: 'Invalid setup key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if admin already exists
    const { data: existing } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ message: 'Admin already exists' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create auth user
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (userError) throw userError;

    // Add to platform_admins
    const { error: adminError } = await supabase
      .from('platform_admins')
      .insert({ user_id: userData.user.id, email });

    if (adminError) throw adminError;

    return new Response(JSON.stringify({ success: true, user_id: userData.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
