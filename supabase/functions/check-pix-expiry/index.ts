import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, to: `+55${to}`, body: message }),
    });
    console.log("[CHECK-PIX] Expiry message sent to", to);
  } catch (e) {
    console.error("[CHECK-PIX] Failed:", e);
  }
}

function formatCurrency(value: number): string {
  return value.toFixed(2).replace('.', ',');
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
    // Find auto_billing pending pix payments created ~1 hour ago (between 55 and 70 minutes ago)
    // Only target auto-generated pix (plan = "auto_billing"), not user-initiated pix
    const now = new Date();
    const fiftyFiveMinAgo = new Date(now.getTime() - 55 * 60 * 1000).toISOString();
    const seventyMinAgo = new Date(now.getTime() - 70 * 60 * 1000).toISOString();

    const { data: expiredPayments } = await supabaseAdmin
      .from("payment_history")
      .select("*")
      .eq("status", "pending")
      .eq("plan", "auto_billing")
      .gte("created_at", seventyMinAgo)
      .lte("created_at", fiftyFiveMinAgo);

    if (!expiredPayments || expiredPayments.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const payment of expiredPayments) {
      try {
        // Mark as expired
        await supabaseAdmin
          .from("payment_history")
          .update({ status: "expired" })
          .eq("id", payment.id);

        // Get company info
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("admin_name, whatsapp, slug")
          .eq("id", payment.company_id)
          .single();

        if (!company?.whatsapp) continue;

        // Get settings to determine days since due
        const { data: settings } = await supabaseAdmin
          .from("company_settings")
          .select("trial_end_date, subscription_paid_at")
          .eq("company_id", payment.company_id)
          .single();

        if (!settings) continue;

        let dueDate: Date | null = null;
        if (settings.trial_end_date) {
          dueDate = new Date(settings.trial_end_date);
        }
        if (settings.subscription_paid_at) {
          const paidAt = new Date(settings.subscription_paid_at);
          const nextDue = new Date(paidAt);
          nextDue.setMonth(nextDue.getMonth() + 1);
          if (!dueDate || nextDue > dueDate) dueDate = nextDue;
        }

        const daysSinceDue = dueDate
          ? Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
          : 4;
        const diaAtual = Math.min(daysSinceDue + 1, 5);

        const amount = formatCurrency(Number(payment.amount));
        const slugUrl = `https://malhagest.site/${company.slug}`;

        const urgencyLine = diaAtual === 5
          ? "🚫 Sua conta será suspensa hoje se o pagamento não for identificado."
          : "⚠️ Amanhã é o último dia antes da suspensão.";

        const msg = `⏰ Pix expirado\n\nOlá, ${company.admin_name}!\n\nO Pix de R$ ${amount} gerado anteriormente expirou.\n\nSe você ainda não regularizou, acesse o sistema para gerar um novo pagamento:\n🔗 ${slugUrl}\n\n${urgencyLine}\n\n— Equipe MalhaGest\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`;
        await sendUltraMsg(company.whatsapp, msg);

        processed++;
      } catch (e) {
        console.error("[CHECK-PIX] Error processing payment:", payment.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[CHECK-PIX] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
