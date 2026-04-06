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

    // Get tomorrow's date in YYYY-MM-DD format (Brasília timezone = UTC-3)
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

    // 1. Fetch accounts due tomorrow that haven't been notified
    const { data: accountsDue, error: fetchError } = await supabase
      .from("accounts_payable")
      .select("*, companies!accounts_payable_company_id_fkey(name)")
      .eq("due_date", tomorrowStr)
      .eq("status", "pendente")
      .eq("notification_sent", false);

    if (fetchError) {
      console.error("Error fetching accounts:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[notify-accounts-due] Found ${accountsDue?.length || 0} accounts due tomorrow`);

    let notified = 0;
    let errors = 0;

    // 2. Send notifications via UltraMsg API
    for (const account of accountsDue || []) {
      try {
        const companyName = (account as any).companies?.name || "Empresa";

        // Format amount to Brazilian format
        const amountFormatted = Number(account.amount).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        // Format due date to dd/MM/yyyy
        const [year, month, day] = account.due_date.split("-");
        const dueDateFormatted = `${day}/${month}/${year}`;

        const messageBody = `🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

📋 *Fornecedor:* ${account.supplier_name}
📝 *Descrição:* ${account.description}
💰 *Valor:* R$ ${amountFormatted}
📅 *Vencimento:* ${dueDateFormatted}

Acesse o sistema para mais detalhes.`;

        // Parse multiple phone numbers (comma-separated)
        const phoneNumbers = account.whatsapp_number
          .split(',')
          .map((n: string) => n.trim().replace(/\D/g, ''))
          .filter((n: string) => n.length >= 10);

        let allSent = true;

        for (const cleanPhone of phoneNumbers) {
          const formattedPhone = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;

          console.log(`[notify-accounts-due] Sending to ${formattedPhone} for account ${account.id}`);

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
            console.error(`[notify-accounts-due] ❌ UltraMsg failed for ${formattedPhone}: ${result.message}`);
            allSent = false;
          } else {
            console.log(`[notify-accounts-due] ✅ Sent to ${formattedPhone}`);
          }
        }

        if (allSent && phoneNumbers.length > 0) {
          // Mark as notified
          await supabase
            .from("accounts_payable")
            .update({ notification_sent: true })
            .eq("id", account.id);
          notified++;
          console.log(`[notify-accounts-due] ✅ Notified account ${account.id} (${phoneNumbers.length} numbers)`);
        } else {
          errors++;
        }
      } catch (err) {
        console.error(`[notify-accounts-due] ❌ Error processing account ${account.id}:`, err);
        errors++;
      }
    }

    // 3. Update overdue accounts (due_date < today and still pending)
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
