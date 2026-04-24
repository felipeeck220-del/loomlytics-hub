import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TABLES_TO_BACKUP = [
  'machines',
  'machine_logs',
  'machine_maintenance_observations',
  'articles',
  'article_machine_turns',
  'clients',
  'weavers',
  'productions',
  'defect_records',
  'outsource_companies',
  'outsource_productions',
  'outsource_yarn_stock',
  'profiles',
  'company_settings',
  'audit_logs',
  'payment_history',
  'invoices',
  'invoice_items',
  'residue_materials',
  'residue_sales',
  'accounts_payable',
  'yarn_types',
  'tv_panels',
  'email_history',
  'iot_devices',
  'iot_downtime_events',
  'iot_machine_assignments',
  'iot_shift_state',
  'machine_readings',
  'needle_inventory',
  'needle_transactions',
];

const MAX_BACKUPS = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all companies
    const { data: companies, error: compErr } = await supabase
      .from('companies')
      .select('id, name');

    if (compErr) throw compErr;

    const today = new Date().toISOString().split('T')[0];
    let backedUp = 0;
    let errors: string[] = [];

    for (const company of companies || []) {
      try {
        const backupData: Record<string, any[]> = {};

        for (const table of TABLES_TO_BACKUP) {
          // Most tables have company_id, machine_logs uses machine_id
          if (table === 'machine_logs') {
            const { data: machines } = await supabase
              .from('machines')
              .select('id')
              .eq('company_id', company.id);
            const machineIds = (machines || []).map((m: any) => m.id);
            if (machineIds.length > 0) {
              const { data } = await supabase
                .from(table)
                .select('*')
                .in('machine_id', machineIds);
              backupData[table] = data || [];
            } else {
              backupData[table] = [];
            }
          } else if (table === 'machine_maintenance_observations') {
            const { data } = await supabase
              .from(table)
              .select('*')
              .eq('company_id', company.id);
            backupData[table] = data || [];
          } else {
            const { data } = await supabase
              .from(table)
              .select('*')
              .eq('company_id', company.id);
            backupData[table] = data || [];
          }
        }

        // Also backup company record itself
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', company.id)
          .single();
        backupData['companies'] = companyData ? [companyData] : [];

        // Insert backup (allows multiple per day)
        const { error: insertErr } = await supabase
          .from('company_backups')
          .insert({
            company_id: company.id,
            backup_date: today,
            data: backupData,
          });

        if (insertErr) {
          errors.push(`${company.name}: ${insertErr.message}`);
        } else {
          backedUp++;
        }

        // Delete old backups beyond 30 days
        const { data: oldBackups } = await supabase
          .from('company_backups')
          .select('id, backup_date')
          .eq('company_id', company.id)
          .order('backup_date', { ascending: false });

        if (oldBackups && oldBackups.length > MAX_BACKUPS) {
          const toDelete = oldBackups.slice(MAX_BACKUPS).map((b: any) => b.id);
          await supabase
            .from('company_backups')
            .delete()
            .in('id', toDelete);
        }
      } catch (err: any) {
        errors.push(`${company.name}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      backed_up: backedUp,
      total_companies: (companies || []).length,
      errors: errors.length > 0 ? errors : undefined,
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
