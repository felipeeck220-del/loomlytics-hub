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
    const reportanaWebhookUrl = Deno.env.get("REPORTANA_WEBHOOK_URL");

    if (!reportanaWebhookUrl) {
      console.error("REPORTANA_WEBHOOK_URL not configured");
      return new Response(
        JSON.stringify({ error: "Webhook URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // 2. Send notifications via Reportana webhook
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

        // Format phone to +55XXXXXXXXXXX as required by Reportana API
        const cleanPhone = account.whatsapp_number.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;

        const payload = {
          phone: formattedPhone,
          supplier_name: account.supplier_name,
          description: account.description,
          amount: amountFormatted,
          due_date: dueDateFormatted,
          company_name: companyName,
        };

        console.log(`[notify-accounts-due] Sending to ${account.whatsapp_number}:`, payload);

        const webhookResponse = await fetch(reportanaWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (webhookResponse.ok) {
          // Mark as notified
          await supabase
            .from("accounts_payable")
            .update({ notification_sent: true })
            .eq("id", account.id);
          notified++;
          console.log(`[notify-accounts-due] ✅ Notified account ${account.id}`);
        } else {
          const respText = await webhookResponse.text();
          console.error(`[notify-accounts-due] ❌ Webhook failed for ${account.id}: ${webhookResponse.status} ${respText}`);
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