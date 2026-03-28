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

    // Helper: generate unique code 100-999 not used by profiles or weavers in this company
    const generateUniqueCode = async (): Promise<string> => {
      const { data: existingProfiles } = await supabaseAdmin
        .from("profiles")
        .select("code")
        .eq("company_id", callerProfile.company_id)
        .not("code", "is", null);

      const { data: existingWeavers } = await supabaseAdmin
        .from("weavers")
        .select("code")
        .eq("company_id", callerProfile.company_id);

      const usedCodes = new Set([
        ...(existingProfiles || []).map((p: any) => p.code),
        ...(existingWeavers || []).map((w: any) => w.code),
      ]);

      for (let attempt = 0; attempt < 900; attempt++) {
        const code = String(Math.floor(Math.random() * 900) + 100);
        if (!usedCodes.has(code)) return code;
      }
      throw new Error("Não foi possível gerar um código único");
    };

    if (action === "create") {
      const { name, email, password, role } = body;
      if (!name || !email || !password || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const code = await generateUniqueCode();
      let userId: string;

      const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (signUpError) {
        if (signUpError.message.includes('already') || signUpError.message.includes('exists') || signUpError.message.includes('registered')) {
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("email", email)
            .limit(1)
            .maybeSingle();

          if (!existingProfile) {
            return new Response(JSON.stringify({ error: "Email já registrado em outro sistema." }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          userId = existingProfile.user_id;

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
        await supabaseAdmin
          .from("user_active_company")
          .insert({ user_id: userId, company_id: callerProfile.company_id })
          .then(() => {});
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: userId,
          company_id: callerProfile.company_id,
          name,
          email,
          role,
          code,
          status: "active",
        });

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: userId, code }), {
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

    if (action === "change_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "Missing user_id or new_password" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify user belongs to admin's company
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", user_id)
        .eq("company_id", callerProfile.company_id)
        .maybeSingle();

      if (!targetProfile) {
        return new Response(JSON.stringify({ error: "User not found in your company" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

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

      if (user_id === callingUser.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", user_id)
        .eq("company_id", callerProfile.company_id);

      const { data: otherProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", user_id);

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
