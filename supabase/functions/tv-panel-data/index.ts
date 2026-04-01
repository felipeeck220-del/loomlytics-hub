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
      return new Response(JSON.stringify({ error: "Código inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find panel by code
    const { data: panel, error: panelError } = await supabase
      .from("tv_panels")
      .select("id, company_id, enabled_machines")
      .eq("code", code)
      .maybeSingle();

    if (panelError || !panel) {
      return new Response(JSON.stringify({ error: "Painel não encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = panel.company_id;

    // Fetch machines
    const { data: machines } = await supabase
      .from("machines")
      .select("id, number, name, status, article_id, production_mode, rpm")
      .eq("company_id", companyId)
      .order("number");

    // Fetch articles
    const { data: articles } = await supabase
      .from("articles")
      .select("id, name, target_efficiency, turns_per_roll, weight_per_roll")
      .eq("company_id", companyId);

    // Find last date with production
    const { data: lastProdDate } = await supabase
      .from("productions")
      .select("date")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .limit(1);

    const lastDate = lastProdDate?.[0]?.date || null;

    // Fetch productions for that date
    let productions: any[] = [];
    if (lastDate) {
      const { data: prods } = await supabase
        .from("productions")
        .select("machine_id, machine_name, weaver_name, efficiency, rolls_produced, weight_kg, shift")
        .eq("company_id", companyId)
        .eq("date", lastDate);
      productions = prods || [];
    }

    return new Response(JSON.stringify({
      machines: machines || [],
      articles: articles || [],
      productions,
      last_production_date: lastDate,
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
