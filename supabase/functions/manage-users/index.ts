import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify calling user is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: callingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get calling user's profile to verify admin role and get company_id
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, company_id")
      .eq("user_id", callingUser.id)
      .eq("company_id", (
        await supabaseAdmin.from("user_active_company").select("company_id").eq("user_id", callingUser.id).single()
      ).data?.company_id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can manage users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { name, email, password, role } = body;
      if (!name || !email || !password || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let userId: string;

      // Try to create auth user
      const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (signUpError) {
        // Check if email already exists
        if (signUpError.message.includes('already') || signUpError.message.includes('exists') || signUpError.message.includes('registered')) {
          // Find existing user by checking profiles
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("email", email)
            .limit(1)
            .maybeSingle();

          if (!existingProfile) {
            return new Response(JSON.stringify({ error: "Email já registrado em outro sistema. Não foi possível vincular." }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          userId = existingProfile.user_id;

          // Check if user already has a profile in this company
          const { data: existingInCompany } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("user_id", userId)
            .eq("company_id", callerProfile.company_id)
            .maybeSingle();

          if (existingInCompany) {
            return new Response(JSON.stringify({ error: "Este usuário já está cadastrado nesta empresa" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          return new Response(JSON.stringify({ error: signUpError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        userId = authData.user!.id;
        
        // Set active company for new user
        await supabaseAdmin
          .from("user_active_company")
          .insert({ user_id: userId, company_id: callerProfile.company_id })
          .then(() => {});
      }

      // Create profile in the caller's company
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: userId,
          company_id: callerProfile.company_id,
          name,
          email,
          role,
          status: "active",
        });

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, name, role, status } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, string> = {};
      if (name) updates.name = name;
      if (role) updates.role = role;
      if (status) updates.status = status;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("user_id", user_id)
        .eq("company_id", callerProfile.company_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow deleting yourself
      if (user_id === callingUser.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete profile from this company
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", user_id)
        .eq("company_id", callerProfile.company_id);

      // Check if user has profiles in other companies
      const { data: otherProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", user_id);

      // Only delete auth user if no more profiles exist
      if (!otherProfiles || otherProfiles.length === 0) {
        await supabaseAdmin.auth.admin.deleteUser(user_id);
        await supabaseAdmin.from("user_active_company").delete().eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
