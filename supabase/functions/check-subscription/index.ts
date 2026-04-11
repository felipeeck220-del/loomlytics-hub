import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ status: "unknown", blocked: false, error: "No auth session" });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token === "null" || token === "undefined") {
      return jsonResponse({ status: "unknown", blocked: false, error: "No auth session" });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ status: "unknown", blocked: false, error: "Invalid auth session" });
    }

    const userId = claimsData.claims.sub;
    const userEmail = typeof claimsData.claims.email === "string" ? claimsData.claims.email : null;

    const { data: activeCompany } = await adminClient
      .from("user_active_company")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();

    let profileQuery = adminClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1);

    if (activeCompany?.company_id) {
      profileQuery = profileQuery.eq("company_id", activeCompany.company_id);
    }

    const { data: profile, error: profileError } = await profileQuery.maybeSingle();

    if (profileError || !profile?.company_id) {
      return jsonResponse({ status: "unknown", blocked: false, error: "Profile not found" });
    }

    const { data: settings, error: settingsError } = await adminClient
      .from("company_settings")
      .select("trial_end_date, subscription_status, subscription_plan, grace_period_end")
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (settingsError || !settings) {
      return jsonResponse({ status: "unknown", blocked: false, error: "Company settings not found" });
    }

    const now = new Date();

    if (settings.subscription_status === "free") {
      return jsonResponse({ status: "free", blocked: false });
    }

    if (settings.subscription_status === "active") {
      return jsonResponse({
        status: "active",
        plan: settings.subscription_plan,
        blocked: false,
      });
    }

    if (settings.subscription_status === "cancelling") {
      if (settings.grace_period_end && new Date(settings.grace_period_end) < now) {
        await adminClient
          .from("company_settings")
          .update({
            subscription_status: "cancelled",
            platform_active: false,
          })
          .eq("company_id", profile.company_id);

        return jsonResponse({ status: "cancelled", blocked: true });
      }

      return jsonResponse({
        status: "cancelling",
        plan: settings.subscription_plan,
        blocked: false,
      });
    }

    if (settings.subscription_status === "blocked" || settings.subscription_status === "cancelled" || settings.subscription_status === "suspended") {
      return jsonResponse({
        status: settings.subscription_status,
        blocked: true,
      });
    }

    if (settings.trial_end_date) {
      const trialEnd = new Date(settings.trial_end_date);

      if (now < trialEnd) {
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return jsonResponse({
          status: "trial",
          days_left: daysLeft,
          trial_end: settings.trial_end_date,
          blocked: false,
        });
      }
    }

    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && userEmail) {
        const stripe = new Stripe(stripeKey, {
          apiVersion: "2025-08-27.basil",
        });

        const customers = await stripe.customers.list({ email: userEmail, limit: 1 });

        if (customers.data.length > 0) {
          const subscriptions = await stripe.subscriptions.list({
            customer: customers.data[0].id,
            status: "active",
            limit: 1,
          });

          if (subscriptions.data.length > 0) {
            const sub = subscriptions.data[0];
            const endDate = new Date(sub.current_period_end * 1000);

            await adminClient
              .from("company_settings")
              .update({
                subscription_status: "active",
                subscription_plan: sub.items.data[0].price.id,
                subscription_paid_at: new Date().toISOString(),
                stripe_customer_id: customers.data[0].id,
                platform_active: true,
              })
              .eq("company_id", profile.company_id);

            return jsonResponse({
              status: "active",
              plan: sub.items.data[0].price.id,
              subscription_end: endDate.toISOString(),
              blocked: false,
            });
          }
        }
      }
    } catch (stripeErr) {
      console.log("[CHECK-SUBSCRIPTION] Stripe check skipped/failed:", stripeErr);
    }

    const trialEnd = settings.trial_end_date ? new Date(settings.trial_end_date) : null;

    if (trialEnd && now > trialEnd) {
      const graceEnd = new Date(trialEnd.getTime() + 5 * 24 * 60 * 60 * 1000);

      if (now < graceEnd) {
        const graceDaysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return jsonResponse({
          status: "grace",
          days_left: graceDaysLeft,
          grace_end: graceEnd.toISOString(),
          blocked: false,
        });
      }

      await adminClient
        .from("company_settings")
        .update({
          platform_active: false,
          subscription_status: "blocked",
        })
        .eq("company_id", profile.company_id);

      return jsonResponse({ status: "blocked", blocked: true });
    }

    return jsonResponse({
      status: settings.subscription_status || "unknown",
      blocked: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
