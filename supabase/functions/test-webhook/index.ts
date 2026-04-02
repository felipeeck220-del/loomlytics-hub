import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reportanaWebhookUrl = Deno.env.get("REPORTANA_WEBHOOK_URL");
    if (!reportanaWebhookUrl) {
      return new Response(
        JSON.stringify({ error: "REPORTANA_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return new Response(
        JSON.stringify({ error: "Campo 'phone' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove non-digits
    const cleanPhone = phone.replace(/\D/g, "");

    const payload = {
      phone: cleanPhone,
      supplier_name: "Fornecedor Teste",
      description: "Teste de notificação WhatsApp",
      amount: "1.250,00",
      due_date: new Date(Date.now() + 86400000).toLocaleDateString("pt-BR"),
      company_name: "Empresa Teste",
    };

    console.log("[test-webhook] Sending:", JSON.stringify(payload));

    const resp = await fetch(reportanaWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const respText = await resp.text();
    console.log(`[test-webhook] Response: ${resp.status} - ${respText}`);

    return new Response(
      JSON.stringify({
        success: resp.ok,
        webhook_status: resp.status,
        webhook_response: respText,
        payload_sent: payload,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[test-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
