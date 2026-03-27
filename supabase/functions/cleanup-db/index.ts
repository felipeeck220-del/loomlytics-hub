import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete all data in order (respecting dependencies)
    const tables = [
      'productions', 'outsource_productions', 'machine_logs', 
      'article_machine_turns', 'user_active_company', 'profiles',
      'platform_admins', 'company_settings', 'outsource_companies',
      'machines', 'articles', 'clients', 'weavers', 'companies'
    ];

    for (const table of tables) {
      await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    // user_active_company has no 'id' column
    await supabase.from('user_active_company').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');

    // Delete all auth users
    const { data: users } = await supabase.auth.admin.listUsers();
    if (users?.users) {
      for (const user of users.users) {
        await supabase.auth.admin.deleteUser(user.id);
      }
    }

    return new Response(JSON.stringify({ success: true, deleted_users: users?.users?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
