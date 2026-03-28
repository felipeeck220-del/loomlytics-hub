import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Usuário não autenticado");

    const { plan } = await req.json();
    if (!plan || !["monthly", "annual"].includes(plan)) {
      throw new Error("plan deve ser 'monthly' ou 'annual'");
    }

    // Get the company's monthly_plan_value from DB
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find user's company
    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!profileData?.company_id) throw new Error("Empresa não encontrada");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("monthly_plan_value")
      .eq("company_id", profileData.company_id)
      .single();

    const monthlyValue = settings?.monthly_plan_value ?? 147;

    // Calculate amount in centavos
    let amountCentavos: number;
    let interval: "month" | "year";
    let planName: string;

    if (plan === "annual") {
      // 12 months with 40% discount
      amountCentavos = Math.round(monthlyValue * 12 * 0.6 * 100);
      interval = "year";
      planName = `MalhaGest Anual - R$ ${(monthlyValue * 12 * 0.6).toFixed(2)}/ano`;
    } else {
      amountCentavos = Math.round(monthlyValue * 100);
      interval = "month";
      planName = `MalhaGest Mensal - R$ ${monthlyValue.toFixed(2)}/mês`;
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://loomlytics-hub.lovable.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: { name: planName },
            unit_amount: amountCentavos,
            recurring: { interval },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/payment-success`,
      cancel_url: `${origin}/settings`,
      metadata: { user_id: user.id, company_id: profileData.company_id },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
