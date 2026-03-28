import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json();
    console.log("[SYNCPAY-WEBHOOK] Received:", JSON.stringify(body));

    const identifier = body.identifier || body.reference_id || body.data?.reference_id;
    const status = body.status || body.data?.status;

    if (!identifier) {
      return new Response(JSON.stringify({ error: "No identifier" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Find payment
    const { data: payment } = await supabaseAdmin
      .from("payment_history")
      .select("*")
      .eq("transaction_id", identifier)
      .single();

    if (!payment) {
      console.log("[SYNCPAY-WEBHOOK] Payment not found for:", identifier);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let paymentStatus = "pending";
    if (status === "completed" || status === "Completo") {
      paymentStatus = "paid";
    } else if (status === "failed" || status === "Falho") {
      paymentStatus = "failed";
    } else if (status === "refunded" || status === "Estornado") {
      paymentStatus = "refunded";
    }

    if (paymentStatus === "paid" && payment.status !== "paid") {
      const now = new Date();

      await supabaseAdmin
        .from("payment_history")
        .update({ status: "paid", paid_at: now.toISOString() })
        .eq("id", payment.id);

      await supabaseAdmin
        .from("company_settings")
        .update({
          subscription_status: "active",
          subscription_paid_at: now.toISOString(),
          platform_active: true,
          subscription_plan: payment.plan,
        })
        .eq("company_id", payment.company_id);

      console.log("[SYNCPAY-WEBHOOK] Payment confirmed for company:", payment.company_id);
    } else if (paymentStatus !== "pending") {
      await supabaseAdmin
        .from("payment_history")
        .update({ status: paymentStatus })
        .eq("id", payment.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SYNCPAY-WEBHOOK] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
