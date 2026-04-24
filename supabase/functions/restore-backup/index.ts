import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Order matters: delete children first, restore parents first
const DELETE_ORDER = [
  'needle_transactions',
  'needle_inventory',
  'iot_downtime_events',
  'iot_machine_assignments',
  'iot_shift_state',
  'machine_readings',
  'iot_devices',
  'invoice_items',
  'invoices',
  'residue_sales',
  'residue_materials',
  'outsource_yarn_stock',
  'outsource_productions',
  'defect_records',
  'productions',
  'machine_maintenance_observations',
  'machine_logs',
  'article_machine_turns',
  'articles',
  'outsource_companies',
  'weavers',
  'clients',
  'machines',
  'accounts_payable',
  'audit_logs',
  'payment_history',
  'tv_panels',
  'email_history',
  'yarn_types',
  'company_settings',
  'profiles',
];

const INSERT_ORDER = [
  'profiles',
  'company_settings',
  'needle_inventory',
  'needle_transactions',
  'clients',
  'machines',
  'weavers',
  'outsource_companies',
  'yarn_types',
  'articles',
  'article_machine_turns',
  'machine_logs',
  'machine_maintenance_observations',
  'productions',
  'defect_records',
  'outsource_productions',
  'outsource_yarn_stock',
  'invoices',
  'invoice_items',
  'residue_materials',
  'residue_sales',
  'accounts_payable',
  'audit_logs',
  'payment_history',
  'tv_panels',
  'email_history',
  'iot_devices',
  'iot_machine_assignments',
  'iot_shift_state',
  'iot_downtime_events',
  'machine_readings',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify platform admin
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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminCheck } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { backup_id } = await req.json();
    if (!backup_id) {
      return new Response(JSON.stringify({ error: 'backup_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch backup
    const { data: backup, error: backupErr } = await supabase
      .from('company_backups')
      .select('*')
      .eq('id', backup_id)
      .single();

    if (backupErr || !backup) {
      return new Response(JSON.stringify({ error: 'Backup não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companyId = backup.company_id;
    const data = backup.data as Record<string, any[]>;

    // Step 1: Delete current data for this company (in order)
    for (const table of DELETE_ORDER) {
      if (table === 'machine_logs') {
        // Delete via machine_id
        const { data: machines } = await supabase
          .from('machines')
          .select('id')
          .eq('company_id', companyId);
        const machineIds = (machines || []).map((m: any) => m.id);
        if (machineIds.length > 0) {
          await supabase.from(table).delete().in('machine_id', machineIds);
        }
      } else {
        await supabase.from(table).delete().eq('company_id', companyId);
      }
    }

    // Step 2: Update company record if present
    if (data['companies'] && data['companies'].length > 0) {
      const compRecord = data['companies'][0];
      const { id, created_at, ...updateFields } = compRecord;
      await supabase.from('companies').update(updateFields).eq('id', companyId);
    }

    // Step 3: Insert backup data (in order)
    const results: Record<string, { inserted: number; errors: string[] }> = {};
    for (const table of INSERT_ORDER) {
      const rows = data[table] || [];
      results[table] = { inserted: 0, errors: [] };
      if (rows.length === 0) continue;

      // Insert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error: insertErr } = await supabase.from(table).insert(batch);
        if (insertErr) {
          results[table].errors.push(insertErr.message);
        } else {
          results[table].inserted += batch.length;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      company_id: companyId,
      backup_date: backup.backup_date,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
