import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendUltraMsg(phone: string, message: string) {
  const instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID");
  const token = Deno.env.get("ULTRAMSG_TOKEN");
  if (!instanceId || !token || !phone) return;

  const to = phone.replace(/\D/g, '');
  if (!to) return;

  try {
    const res = await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, to: `+55${to}`, body: message }),
    });
    console.log("[ULTRAMSG] Payment confirmation sent, status:", res.status);
  } catch (e) {
    console.error("[ULTRAMSG] Failed to send payment confirmation:", e);
  }
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

      // Send WhatsApp notification for Pix payment confirmed
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("admin_name, whatsapp, slug")
        .eq("id", payment.company_id)
        .single();

      if (company?.whatsapp) {
        const nextDueDate = payment.next_billing_date
          ? new Date(payment.next_billing_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : 'N/A';
        const amount = Number(payment.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const message = `✅ Pagamento confirmado!\n\nOlá, ${company.admin_name}!\n\nSeu pagamento de R$ ${amount} via Pix foi confirmado com sucesso.\n\n📅 Sua assinatura está ativa até ${nextDueDate}.\n\nObrigado por confiar no MalhaGest!\n— Equipe MalhaGest\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`;

        sendUltraMsg(company.whatsapp, message);
      }
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
