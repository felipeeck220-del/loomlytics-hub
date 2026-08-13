
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runScan() {
  console.log("--- Billing Order (OF) Pente Fino (Server Side) ---");

  const companyId = '00000000-0000-0000-0000-000000000000';
  const fakeId = '00000000-0000-0000-0000-000000000000';

  console.log("\n1. Testing RPC signatures...");

  const rpcs = [
    { name: 'collect_billing_order', params: { p_company_id: companyId, p_id: fakeId, p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'set_billing_order_priority', params: { p_company_id: companyId, p_id: fakeId, p_priority: true, p_reason: 'Scan', p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'launch_billing_order_ready', params: { p_company_id: companyId, p_id: fakeId, p_pieces_real: 0, p_weight_real: 0, p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'create_billing_order', params: { p_company_id: companyId, p_payload: {}, p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'cancel_billing_order', params: { p_company_id: companyId, p_id: fakeId, p_reason: 'Scan', p_expected_status: null, p_reversal_quality: 'first', p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'set_billing_order_delivery_doc', params: { p_company_id: companyId, p_id: fakeId, p_doc_type: 'nf', p_doc_number: '123', p_author_name: 'Scan', p_author_code: '0' } }
  ];

  for (const rpc of rpcs) {
    const { error } = await supabase.rpc(rpc.name as any, rpc.params as any);
    if (error && error.message.includes('does not exist')) {
      console.error(`[FAIL] RPC ${rpc.name} signature mismatch or not found: ${error.message}`);
    } else {
      console.log(`[OK] RPC ${rpc.name} detected (Error was: ${error?.code || 'None'})`);
    }
  }

  console.log("\n2. Checking table structure via RPC get_billing_orders_bootstrap...");
  const { data: bootstrap, error: bootErr } = await supabase.rpc('get_billing_orders_bootstrap', { p_company_id: companyId });
  if (bootErr && bootErr.message.includes('does not exist')) {
     console.error("[FAIL] RPC get_billing_orders_bootstrap not found");
  } else {
     console.log("[OK] RPC get_billing_orders_bootstrap found");
  }

  console.log("\nScan complete.");
}

runScan().catch(console.error);
