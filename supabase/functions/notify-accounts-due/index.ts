import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID");
    const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN");

    if (!instanceId || !ultramsgToken) {
      console.error("ULTRAMSG_INSTANCE_ID ou ULTRAMSG_TOKEN não configurados");
      return new Response(
        JSON.stringify({ error: "UltraMsg não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ultramsgUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get dates in Brasília timezone (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const brasiliaMs = utcMs + brasiliaOffset * 60000;
    const brasiliaDate = new Date(brasiliaMs);

    const tomorrow = new Date(brasiliaDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const today = brasiliaDate.toISOString().split("T")[0];

    console.log(`[notify-accounts-due] Running for tomorrow=${tomorrowStr}, today=${today}`);

    let notified = 0;
    let errors = 0;

    // === 1. Notify accounts due TOMORROW (véspera) ===
    const { data: accountsDueTomorrow, error: fetchError1 } = await supabase
      .from("accounts_payable")
      .select("*, companies!accounts_payable_company_id_fkey(name)")
      .eq("due_date", tomorrowStr)
      .eq("status", "pendente")
      .eq("notification_sent", false);

    if (fetchError1) {
      console.error("Error fetching tomorrow accounts:", fetchError1);
    }

    console.log(`[notify-accounts-due] Found ${accountsDueTomorrow?.length || 0} accounts due tomorrow`);

    for (const account of accountsDueTomorrow || []) {
      const result = await sendNotification(account, ultramsgUrl, ultramsgToken, supabase, "amanhã");
      if (result.success) notified++;
      else errors++;
    }

    // === 2. Notify accounts due TODAY (dia do vencimento) ===
    const { data: accountsDueToday, error: fetchError2 } = await supabase
      .from("accounts_payable")
      .select("*, companies!accounts_payable_company_id_fkey(name)")
      .eq("due_date", today)
      .eq("status", "pendente");

    if (fetchError2) {
      console.error("Error fetching today accounts:", fetchError2);
    }

    console.log(`[notify-accounts-due] Found ${accountsDueToday?.length || 0} accounts due today still pending`);

    for (const account of accountsDueToday || []) {
      const result = await sendNotification(account, ultramsgUrl, ultramsgToken, supabase, "hoje");
      if (result.success) notified++;
      else errors++;
    }

    // === 3. Update overdue accounts ===
    const { data: overdueUpdated, error: overdueError } = await supabase
      .from("accounts_payable")
      .update({ status: "vencido" })
      .lt("due_date", today)
      .eq("status", "pendente")
      .select("id");

    if (overdueError) {
      console.error("Error updating overdue accounts:", overdueError);
    } else {
      console.log(`[notify-accounts-due] Updated ${overdueUpdated?.length || 0} overdue accounts`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified,
        errors,
        overdue_updated: overdueUpdated?.length || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[notify-accounts-due] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendNotification(
  account: any,
  ultramsgUrl: string,
  ultramsgToken: string,
  supabase: any,
  dueLabel: "amanhã" | "hoje"
): Promise<{ success: boolean }> {
  try {
    const companyName = account.companies?.name || "Empresa";
    const shortId = account.short_id || "—";
    const amountFormatted = Number(account.amount).toFixed(2).replace('.', ',');
    const [year, month, day] = account.due_date.split("-");
    const dueDateFormatted = `${day}/${month}/${year}`;

    const isToday = dueLabel === "hoje";

    const messageBody = isToday
      ? `⚠️ *VENCIMENTO HOJE - MalhaGest*

A conta *#${shortId}* vence *hoje* e ainda consta como pendente no sistema:

📋 *Fornecedor:* ${account.supplier_name}
📝 *Descrição:* ${account.description}
💰 *Valor:* R$ ${amountFormatted}
📅 *Vencimento:* ${dueDateFormatted}

Se já foi paga, atualize o sistema.
Se não foi, pague para evitar juros.

⚠️ Mensagem automática, esse não é um canal de suporte.`
      : `🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

🆔 *ID:* #${shortId}
📋 *Fornecedor:* ${account.supplier_name}
📝 *Descrição:* ${account.description}
💰 *Valor:* R$ ${amountFormatted}
📅 *Vencimento:* ${dueDateFormatted}

Acesse o sistema para mais detalhes.

⚠️ Mensagem automática, esse não é um canal de suporte.`;

    const phoneNumbers = account.whatsapp_number
      .split(',')
      .map((n: string) => n.trim().replace(/\D/g, ''))
      .filter((n: string) => n.length >= 10);

    let allSent = true;
    const errorMessages: string[] = [];

    for (const cleanPhone of phoneNumbers) {
      const formattedPhone = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;

      console.log(`[notify-accounts-due] Sending ${dueLabel} notification to ${formattedPhone} for account ${account.id} (#${shortId})`);

      const response = await fetch(ultramsgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: ultramsgToken,
          to: formattedPhone,
          body: messageBody,
        }),
      });

      const result = await response.json();

      if (result.sent !== "true") {
        const errMsg = result.message || `Falha ao enviar para ${formattedPhone}`;
        console.error(`[notify-accounts-due] ❌ UltraMsg failed for ${formattedPhone}: ${errMsg}`);
        allSent = false;
        errorMessages.push(`${formattedPhone}: ${errMsg}`);
      } else {
        console.log(`[notify-accounts-due] ✅ Sent to ${formattedPhone}`);
      }
    }

    // Only update notification_sent for tomorrow notifications (véspera)
    // For today notifications, don't mark as sent again (it may already be marked)
    if (!isToday) {
      if (phoneNumbers.length === 0) {
        await supabase
          .from("accounts_payable")
          .update({
            notification_sent: true,
            notification_status: "erro",
            notification_error: "Nenhum número válido cadastrado",
          })
          .eq("id", account.id);
        return { success: false };
      } else if (allSent) {
        await supabase
          .from("accounts_payable")
          .update({
            notification_sent: true,
            notification_status: "enviado",
            notification_error: null,
          })
          .eq("id", account.id);
        return { success: true };
      } else {
        await supabase
          .from("accounts_payable")
          .update({
            notification_sent: true,
            notification_status: "erro",
            notification_error: errorMessages.join("; "),
          })
          .eq("id", account.id);
        return { success: false };
      }
    }

    // For today's notification, just log success/failure
    return { success: allSent && phoneNumbers.length > 0 };
  } catch (err) {
    console.error(`[notify-accounts-due] ❌ Error processing account ${account.id}:`, err);
    if (dueLabel === "amanhã") {
      await supabase
        .from("accounts_payable")
        .update({
          notification_sent: true,
          notification_status: "erro",
          notification_error: String(err),
        })
        .eq("id", account.id);
    }
    return { success: false };
  }
}
