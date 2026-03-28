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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // Get user's company_id from profiles
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!profile) throw new Error("Profile not found");

    // Get company settings
    const { data: settings } = await supabaseClient
      .from('company_settings')
      .select('trial_end_date, subscription_status, subscription_plan, grace_period_end')
      .eq('company_id', profile.company_id)
      .single();

    const now = new Date();

    // Check if free user
    if (settings?.subscription_status === 'free') {
      return new Response(JSON.stringify({
        status: 'free',
        blocked: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check trial status
    if (settings?.trial_end_date) {
      const trialEnd = new Date(settings.trial_end_date);
      
      if (now < trialEnd) {
        // Still in trial
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return new Response(JSON.stringify({
          status: 'trial',
          days_left: daysLeft,
          trial_end: settings.trial_end_date,
          blocked: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check Stripe subscription
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length > 0) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customers.data[0].id,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0];
        const endDate = new Date(sub.current_period_end * 1000);
        
        // Update company settings
        await supabaseClient
          .from('company_settings')
          .update({
            subscription_status: 'active',
            subscription_plan: sub.items.data[0].price.id,
            subscription_paid_at: new Date().toISOString(),
            stripe_customer_id: customers.data[0].id,
          })
          .eq('company_id', profile.company_id);

        // If platform was blocked, reactivate
        await supabaseClient
          .from('company_settings')
          .update({ platform_active: true })
          .eq('company_id', profile.company_id);

        return new Response(JSON.stringify({
          status: 'active',
          plan: sub.items.data[0].price.id,
          subscription_end: endDate.toISOString(),
          blocked: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // No active subscription and trial ended - check grace period
    const trialEnd = settings?.trial_end_date ? new Date(settings.trial_end_date) : null;
    
    if (trialEnd && now > trialEnd) {
      const graceEnd = new Date(trialEnd.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days grace
      
      if (now < graceEnd) {
        const graceDaysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return new Response(JSON.stringify({
          status: 'grace',
          days_left: graceDaysLeft,
          grace_end: graceEnd.toISOString(),
          blocked: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Grace period ended - block
      await supabaseClient
        .from('company_settings')
        .update({ 
          platform_active: false, 
          subscription_status: 'blocked',
        })
        .eq('company_id', profile.company_id);

      return new Response(JSON.stringify({
        status: 'blocked',
        blocked: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      status: settings?.subscription_status || 'unknown',
      blocked: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
