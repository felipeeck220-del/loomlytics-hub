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
    const { code } = await req.json();
    if (!code || typeof code !== "string" || !/^\d{8}$/.test(code)) {
      return new Response(JSON.stringify({ error: "Código inválido. Deve conter 8 dígitos." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find panel by code in tv_panels
    const { data: panel, error: panelError } = await supabase
      .from("tv_panels")
      .select("id, company_id, name, panel_type, enabled_machines")
      .eq("code", code)
      .maybeSingle();

    if (panelError || !panel) {
      return new Response(JSON.stringify({ error: "Código não encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark panel as connected
    await supabase
      .from("tv_panels")
      .update({ is_connected: true })
      .eq("id", panel.id);

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, slug, logo_url")
      .eq("id", panel.company_id)
      .single();

    // Get shift settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("shift_manha_start, shift_manha_end, shift_tarde_start, shift_tarde_end, shift_noite_start, shift_noite_end")
      .eq("company_id", panel.company_id)
      .single();

    return new Response(JSON.stringify({
      panel_id: panel.id,
      panel_name: panel.name,
      panel_type: panel.panel_type,
      enabled_machines: panel.enabled_machines,
      company_id: panel.company_id,
      company_name: company?.name,
      company_slug: company?.slug,
      logo_url: company?.logo_url,
      shift_settings: settings,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
