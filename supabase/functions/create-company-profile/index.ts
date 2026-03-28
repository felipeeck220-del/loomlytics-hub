import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'empresa';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, admin_name, admin_email, company_name, whatsapp } = await req.json();

    if (!user_id || !admin_name || !admin_email || !company_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Generate unique slug
    let slug = generateSlug(company_name);
    let counter = 0;
    while (true) {
      const checkSlug = counter === 0 ? slug : `${slug}-${counter}`;
      const { data } = await supabaseAdmin.from('companies').select('id').eq('slug', checkSlug).maybeSingle();
      if (!data) { slug = checkSlug; break; }
      counter++;
    }

    // 1. Create company with slug
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: company_name,
        admin_name,
        admin_email,
        whatsapp: whatsapp || null,
        slug,
      })
      .select("id")
      .single();

    if (companyError) {
      return new Response(JSON.stringify({ error: companyError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Create profile linked to auth user and company
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        user_id: user_id,
        company_id: company.id,
        name: admin_name,
        email: admin_email,
        role: "admin",
        code: "1",
      });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Set active company
    await supabaseAdmin
      .from("user_active_company")
      .insert({ user_id, company_id: company.id });

    // 4. Create company_settings with trial_end_date from platform settings
    const { data: platformSettings } = await supabaseAdmin
      .from('platform_settings')
      .select('key, value');
    
    let trialDays = 90;
    let monthlyPlanValue = 47;
    (platformSettings || []).forEach((s: any) => {
      if (s.key === 'trial_days') trialDays = Number(s.value);
      if (s.key === 'monthly_price') monthlyPlanValue = Number(s.value);
    });

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + trialDays);

    await supabaseAdmin
      .from('company_settings')
      .insert({
        company_id: company.id,
        monthly_plan_value: monthlyPlanValue,
        trial_end_date: trialEndDate.toISOString(),
        subscription_status: 'trial',
      });

    return new Response(
      JSON.stringify({ company_id: company.id, slug }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
