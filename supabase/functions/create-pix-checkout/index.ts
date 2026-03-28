import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYNCPAY_BASE = "https://api.syncpayments.com.br";
const PIX_EXPIRY_MINUTES = 30;

async function getSyncPayToken(): Promise<string> {
  const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("SYNCPAY_CLIENT_ID"),
      client_secret: Deno.env.get("SYNCPAY_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SyncPay auth failed: ${res.status} ${text}`);
  }
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
    if (!user?.email) throw new Error("Usuário não autenticado");

    const { plan } = await req.json();
    if (!plan || !["monthly", "annual"].includes(plan)) {
      throw new Error("plan deve ser 'monthly' ou 'annual'");
    }

    // Get company
    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!profileData?.company_id) throw new Error("Empresa não encontrada");

    // Check for existing pending pix for the same plan (within 30 min)
    const thirtyMinAgo = new Date(Date.now() - PIX_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const { data: existingPending } = await supabaseAdmin
      .from("payment_history")
      .select("*")
      .eq("company_id", profileData.company_id)
      .eq("plan", plan)
      .eq("status", "pending")
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      const existing = existingPending[0];
      // Return existing pending pix
      const planName = plan === "annual" ? "MalhaGest Anual" : "MalhaGest Mensal";
      return new Response(JSON.stringify({
        pix_code: existing.pix_code,
        identifier: existing.transaction_id,
        amount: Number(existing.amount),
        plan_name: planName,
        reused: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Expire old pending payments (older than 30 min)
    await supabaseAdmin
      .from("payment_history")
      .update({ status: "expired" })
      .eq("company_id", profileData.company_id)
      .eq("status", "pending")
      .lt("created_at", thirtyMinAgo);

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("monthly_plan_value")
      .eq("company_id", profileData.company_id)
      .single();

    const monthlyValue = settings?.monthly_plan_value ?? 147;

    let amount: number;
    let planName: string;

    if (plan === "annual") {
      amount = Math.round(monthlyValue * 12 * 0.6 * 100) / 100;
      planName = `MalhaGest Anual`;
    } else {
      amount = Number(monthlyValue);
      planName = `MalhaGest Mensal`;
    }

    // Get SyncPay token
    const syncToken = await getSyncPayToken();

    // Get webhook URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const webhookUrl = `${supabaseUrl}/functions/v1/syncpay-webhook`;

    // Create Pix cash-in
    const pixRes = await fetch(`${SYNCPAY_BASE}/api/partner/v1/cash-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${syncToken}`,
      },
      body: JSON.stringify({
        amount,
        description: `${planName} - ${user.email}`,
        webhook_url: webhookUrl,
        client: {
          name: user.user_metadata?.name || user.email?.split("@")[0] || "Cliente",
          cpf: "00000000000",
          email: user.email,
          phone: "00000000000",
        },
      }),
    });

    if (!pixRes.ok) {
      const errText = await pixRes.text();
      throw new Error(`SyncPay error: ${pixRes.status} ${errText}`);
    }

    const pixData = await pixRes.json();

    // Calculate next billing date
    const now = new Date();
    const nextBilling = new Date(now);
    if (plan === "annual") {
      nextBilling.setFullYear(nextBilling.getFullYear() + 1);
    } else {
      nextBilling.setMonth(nextBilling.getMonth() + 1);
    }

    // Save to payment_history
    await supabaseAdmin.from("payment_history").insert({
      company_id: profileData.company_id,
      plan,
      amount,
      status: "pending",
      pix_code: pixData.pix_code,
      transaction_id: pixData.identifier,
      next_billing_date: nextBilling.toISOString(),
    });

    return new Response(JSON.stringify({
      pix_code: pixData.pix_code,
      identifier: pixData.identifier,
      amount,
      plan_name: planName,
      reused: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("create-pix-checkout error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
