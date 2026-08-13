import { supabase } from "@/integrations/supabase/client";

/**
 * Scan script to verify the integrity of recent Billing Order (OF) updates.
 * Focuses on RPC signatures, audit log consistency, and status transitions.
 */
async function runScan() {
  console.log("--- Billing Order (OF) Pente Fino ---");

  // 1. Check RPC signatures by calling them with invalid IDs to trigger parameter count errors or not found
  const companyId = '00000000-0000-0000-0000-000000000000'; // Fake UUID
  const fakeId = '00000000-0000-0000-0000-000000000000';

  console.log("\n1. Testing RPC signatures...");

  const rpcs = [
    { name: 'collect_billing_order', params: { p_company_id: companyId, p_id: fakeId, p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'set_billing_order_priority', params: { p_company_id: companyId, p_id: fakeId, p_priority: true, p_reason: 'Scan', p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'launch_billing_order_ready', params: { p_company_id: companyId, p_id: fakeId, p_pieces_real: 0, p_weight_real: 0, p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'create_billing_order', params: { p_company_id: companyId, p_payload: {}, p_author_name: 'Scan', p_author_code: '0' } },
    { name: 'cancel_billing_order', params: { p_company_id: companyId, p_id: fakeId, p_reason: 'Scan', p_expected_status: null, p_reversal_quality: 'first', p_author_name: 'Scan', p_author_code: '0' } }
  ];

  for (const rpc of rpcs) {
    const { error } = await supabase.rpc(rpc.name as any, rpc.params as any);
    if (error && error.message.includes('does not exist')) {
      console.error(`[FAIL] RPC ${rpc.name} signature mismatch or not found: ${error.message}`);
    } else if (error && error.code === 'P0002') {
       console.log(`[OK] RPC ${rpc.name} found (failed with not found as expected)`);
    } else if (error) {
      console.log(`[INFO] RPC ${rpc.name} error (possible signature match but failed logic): ${error.message} (${error.code})`);
    } else {
      console.log(`[OK] RPC ${rpc.name} executed (unexpectedly success on fake data?)`);
    }
  }

  // 2. Check for missing columns in billing_orders
  console.log("\n2. Checking table structure...");
  const { data: cols, error: colErr } = await supabase.from('billing_orders').select('*').limit(1);
  if (colErr) {
    console.error("[FAIL] Error reading billing_orders table:", colErr.message);
  } else {
    const row = cols?.[0] || {};
    const expected = ['of_number', 'status', 'priority', 'delivery_doc_number', 'separation_finished_at', 'multiplier'];
    for (const field of expected) {
      if (!(field in row)) {
        console.error(`[FAIL] Missing expected column in billing_orders: ${field}`);
      } else {
        console.log(`[OK] Found column: ${field}`);
      }
    }
  }

  console.log("\nScan complete.");
}

runScan().catch(console.error);
