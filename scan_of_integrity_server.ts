
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://etsaleegdpswwsprwyzv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c2FsZWVnZHBzd3dzcHJ3eXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjI4MTEsImV4cCI6MjA4ODU5ODgxMX0.HgrEhziu6UyoFlLznhTgeNN5KZ0xhCVvBkfyuIEcR90";

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
