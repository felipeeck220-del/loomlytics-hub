const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID");
    const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN");

    if (!instanceId || !ultramsgToken) {
      return new Response(
        JSON.stringify({ error: "ULTRAMSG_INSTANCE_ID ou ULTRAMSG_TOKEN não configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ultramsgUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;

    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return new Response(
        JSON.stringify({ error: "Campo 'phone' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure format +55XXXXXXXXXXX
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? `+${cleanPhone}` : `+55${cleanPhone}`;

    const tomorrowDate = new Date(Date.now() + 86400000).toLocaleDateString("pt-BR");

    const messageBody = `🔔 *Teste de Notificação - MalhaGest*

📋 *Fornecedor:* Fornecedor Teste
📝 *Descrição:* Teste de notificação WhatsApp
💰 *Valor:* R$ 1.250,00
📅 *Vencimento:* ${tomorrowDate}

✅ Se você recebeu esta mensagem, a integração está funcionando!`;

    console.log(`[test-webhook] Sending to ${formattedPhone}`);

    const resp = await fetch(ultramsgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: ultramsgToken,
        to: formattedPhone,
        body: messageBody,
      }),
    });

    const result = await resp.json();
    console.log(`[test-webhook] Response:`, JSON.stringify(result));

    return new Response(
      JSON.stringify({
        success: result.sent === "true",
        ultramsg_response: result,
        payload_sent: { to: formattedPhone, body: messageBody },
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
