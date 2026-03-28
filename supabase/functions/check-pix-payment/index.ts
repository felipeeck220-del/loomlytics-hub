import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYNCPAY_BASE = "https://api.syncpayments.com.br";

async function getSyncPayToken(): Promise<string> {
  const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("SYNCPAY_CLIENT_ID"),
      client_secret: Deno.env.get("SYNCPAY_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) throw new Error("SyncPay auth failed");
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseAdmin.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("Não autenticado");

    const { identifier } = await req.json();
    if (!identifier) throw new Error("identifier é obrigatório");

    // Check SyncPay transaction status
    const syncToken = await getSyncPayToken();
    const statusRes = await fetch(`${SYNCPAY_BASE}/api/partner/v1/transaction/${identifier}`, {
      headers: {
        "Authorization": `Bearer ${syncToken}`,
        "Accept": "application/json",
      },
    });

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      throw new Error(`SyncPay status check failed: ${statusRes.status} ${errText}`);
    }

    const statusData = await statusRes.json();
    const txStatus = statusData.data?.status;

    // Map SyncPay status to our status
    let paymentStatus = "pending";
    if (txStatus === "completed" || txStatus === "Completo") {
      paymentStatus = "paid";
    } else if (txStatus === "failed" || txStatus === "Falho") {
      paymentStatus = "failed";
    } else if (txStatus === "refunded" || txStatus === "Estornado") {
      paymentStatus = "refunded";
    }

    // If paid, update payment_history and company_settings
    if (paymentStatus === "paid") {
      const { data: payment } = await supabaseAdmin
        .from("payment_history")
        .select("*")
        .eq("transaction_id", identifier)
        .single();

      if (payment && payment.status !== "paid") {
        const now = new Date();
        
        await supabaseAdmin
          .from("payment_history")
          .update({ status: "paid", paid_at: now.toISOString() })
          .eq("transaction_id", identifier);

        // Activate subscription
        await supabaseAdmin
          .from("company_settings")
          .update({
            subscription_status: "active",
            subscription_paid_at: now.toISOString(),
            platform_active: true,
            subscription_plan: payment.plan,
          })
          .eq("company_id", payment.company_id);
      }
    }

    return new Response(JSON.stringify({
      status: paymentStatus,
      syncpay_status: txStatus,
      amount: statusData.data?.amount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("check-pix-payment error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
