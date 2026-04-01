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

    // Find company by tv_code
    const { data: settings, error } = await supabase
      .from("company_settings")
      .select("company_id")
      .eq("tv_code", code)
      .maybeSingle();

    if (error || !settings) {
      return new Response(JSON.stringify({ error: "Código não encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, slug, logo_url")
      .eq("id", settings.company_id)
      .single();

    // Get shift settings
    const { data: fullSettings } = await supabase
      .from("company_settings")
      .select("shift_manha_start, shift_manha_end, shift_tarde_start, shift_tarde_end, shift_noite_start, shift_noite_end")
      .eq("company_id", settings.company_id)
      .single();

    return new Response(JSON.stringify({
      company_id: settings.company_id,
      company_name: company?.name,
      company_slug: company?.slug,
      logo_url: company?.logo_url,
      shift_settings: fullSettings,
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
