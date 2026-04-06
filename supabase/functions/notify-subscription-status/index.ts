import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  if (!res.ok) throw new Error(`SyncPay auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

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
    console.log("[NOTIFY] Message sent to", to);
  } catch (e) {
    console.error("[NOTIFY] Failed:", e);
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86400000;
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toDay.getTime() - fromDay.getTime()) / msPerDay);
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
    // Get all companies with settings
    const { data: settingsRows } = await supabaseAdmin
      .from("company_settings")
      .select("company_id, subscription_status, trial_end_date, subscription_paid_at, monthly_plan_value, subscription_plan, grace_period_end");

    if (!settingsRows || settingsRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let processed = 0;

    for (const settings of settingsRows) {
      try {
        const { subscription_status, trial_end_date, subscription_paid_at, monthly_plan_value, subscription_plan, company_id } = settings;

        // Only process active or trial companies
        if (subscription_status !== 'active' && subscription_status !== 'trial') continue;

        // Determine due date
        let dueDate: Date | null = null;

        if (subscription_status === 'trial' && trial_end_date) {
          dueDate = new Date(trial_end_date);
        } else if (subscription_status === 'active' && subscription_paid_at) {
          // Next billing = paid_at + 1 month
          const paidAt = new Date(subscription_paid_at);
          dueDate = new Date(paidAt);
          dueDate.setMonth(dueDate.getMonth() + 1);
        }

        if (!dueDate) continue;

        const daysSinceDue = daysBetween(dueDate, now);

        // Get company info
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("admin_name, whatsapp, slug")
          .eq("id", company_id)
          .single();

        if (!company?.whatsapp) continue;

        const slugUrl = `https://malhagest.site/${company.slug}`;
        const dueDateStr = formatDate(dueDate);
        const amount = Number(monthly_plan_value || 147).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const adminName = company.admin_name;

        // Check if already sent notification today (idempotency via payment_history)
        const todayStr = now.toISOString().split('T')[0];
        const { data: todayNotifications } = await supabaseAdmin
          .from("payment_history")
          .select("id")
          .eq("company_id", company_id)
          .gte("created_at", `${todayStr}T00:00:00Z`)
          .eq("status", "pending")
          .limit(1);

        // -1 day: Pre-due reminder (Pix only)
        if (daysSinceDue === -1) {
          // Only for Pix payers (no stripe_customer_id = Pix)
          const isPixPayer = !settings.subscription_plan || settings.subscription_plan === 'monthly';
          const hasStripe = await supabaseAdmin
            .from("company_settings")
            .select("stripe_customer_id")
            .eq("company_id", company_id)
            .single();

          if (!hasStripe?.data?.stripe_customer_id) {
            const msg = `⏰ Lembrete de vencimento\n\nOlá, ${adminName}!\n\nSua assinatura do MalhaGest vence amanhã (${dueDateStr}).\nValor: R$ ${amount}\n\n🔗 Acesse o sistema para gerar seu Pix e evitar interrupção:\n${slugUrl}\n\n— Equipe MalhaGest\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`;
            await sendUltraMsg(company.whatsapp, msg);
          }
        }
        // Days 0-2: Warning messages (days 1-3 of the flow)
        else if (daysSinceDue >= 0 && daysSinceDue <= 2) {
          // Check if there's a paid payment after due date
          const { data: recentPaid } = await supabaseAdmin
            .from("payment_history")
            .select("id")
            .eq("company_id", company_id)
            .eq("status", "paid")
            .gte("paid_at", dueDate.toISOString())
            .limit(1);

          if (recentPaid && recentPaid.length > 0) continue; // Already paid

          const diaAtual = daysSinceDue + 1;
          const diasRestantes = 5 - diaAtual;
          const msg = `🔔 Aviso de pendência — Dia ${diaAtual}/5\n\nOlá, ${adminName}!\n\nSua assinatura do MalhaGest venceu em ${dueDateStr} e ainda não identificamos o pagamento.\n\n⚠️ Você tem ${diasRestantes} dia(s) para regularizar antes da suspensão do acesso.\n\n🔗 Acesse o sistema para efetuar o pagamento:\n${slugUrl}\n\n— Equipe MalhaGest\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`;
          await sendUltraMsg(company.whatsapp, msg);
        }
        // Days 3-4: Generate Pix + urgent warning (days 4-5 of the flow)
        else if (daysSinceDue >= 3 && daysSinceDue <= 4) {
          // Check if already paid
          const { data: recentPaid } = await supabaseAdmin
            .from("payment_history")
            .select("id")
            .eq("company_id", company_id)
            .eq("status", "paid")
            .gte("paid_at", dueDate.toISOString())
            .limit(1);

          if (recentPaid && recentPaid.length > 0) continue;

          // Skip if we already generated a pix today
          if (todayNotifications && todayNotifications.length > 0) continue;

          const diaAtual = daysSinceDue + 1;
          const diasRestantes = 5 - diaAtual;

          // Generate Pix via SyncPayments
          try {
            const syncToken = await getSyncPayToken();
            const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
            const webhookUrl = `${supabaseUrl}/functions/v1/syncpay-webhook`;

            const pixRes = await fetch(`${SYNCPAY_BASE}/api/partner/v1/cash-in`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${syncToken}`,
              },
              body: JSON.stringify({
                amount: Number(monthly_plan_value || 147),
                description: `MalhaGest Mensal - Cobrança automática dia ${diaAtual}`,
                webhook_url: webhookUrl,
                client: {
                  name: adminName,
                  cpf: "00000000000",
                  email: "cobranca@malhagest.site",
                  phone: "00000000000",
                },
              }),
            });

            if (pixRes.ok) {
              const pixData = await pixRes.json();
              const nextBilling = new Date(now);
              nextBilling.setMonth(nextBilling.getMonth() + 1);

              await supabaseAdmin.from("payment_history").insert({
                company_id,
                plan: "monthly",
                amount: Number(monthly_plan_value || 147),
                status: "pending",
                pix_code: pixData.pix_code,
                transaction_id: pixData.identifier,
                next_billing_date: nextBilling.toISOString(),
              });

              const urgencyLine = diasRestantes === 0
                ? "🚫 ÚLTIMO DIA! Se não pago hoje, sua conta será suspensa."
                : "⚠️ Falta apenas 1 dia para a suspensão.";

              const msg = `🔔 URGENTE — Aviso de pendência — Dia ${diaAtual}/5\n\nOlá, ${adminName}!\n\nSua assinatura do MalhaGest venceu em ${dueDateStr}.\n\n💰 Geramos um Pix de R$ ${amount} para facilitar sua regularização:\n\n📋 Código Pix (copia e cola):\n${pixData.pix_code}\n\n⏰ Este Pix expira em 1 hora. Após expirar, um novo será gerado automaticamente.\n\n${urgencyLine}\n\n— Equipe MalhaGest\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`;
              await sendUltraMsg(company.whatsapp, msg);
            }
          } catch (pixErr) {
            console.error("[NOTIFY] Pix generation failed for company:", company_id, pixErr);
          }
        }
        // Day 5+: Suspend account
        else if (daysSinceDue >= 5) {
          // Check if already paid
          const { data: recentPaid } = await supabaseAdmin
            .from("payment_history")
            .select("id")
            .eq("company_id", company_id)
            .eq("status", "paid")
            .gte("paid_at", dueDate.toISOString())
            .limit(1);

          if (recentPaid && recentPaid.length > 0) continue;

          // Suspend the account
          await supabaseAdmin
            .from("company_settings")
            .update({ subscription_status: "suspended" })
            .eq("company_id", company_id);

          const msg = `🚫 Conta suspensa\n\nOlá, ${adminName}!\n\nSua conta MalhaGest foi suspensa por falta de pagamento.\nO vencimento era ${dueDateStr} e já se passaram 5 dias sem regularização.\n\nPara restaurar o acesso completo, efetue o pagamento:\n🔗 ${slugUrl}\n\nApós a confirmação do pagamento, seu acesso será restaurado automaticamente.\n\n— Equipe MalhaGest\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`;
          await sendUltraMsg(company.whatsapp, msg);
        }

        processed++;
      } catch (companyErr) {
        console.error("[NOTIFY] Error processing company:", settings.company_id, companyErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[NOTIFY] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
