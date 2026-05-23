import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate JWT and require active Administrador role
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, active")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (!callerProfile || !callerProfile.active) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isAdmin = callerProfile.role === "Administrador";
    const isOperator = callerProfile.role === "Operador";

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Operador can only create users; everything else is admin-only
    if (!isAdmin) {
      if (!(isOperator && action === "create")) {
        return new Response(JSON.stringify({ error: "Permissão negada" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    if (req.method === "POST" && action === "create") {
      const { email, password, role, unit, full_name, cpf } = await req.json();

      if (!email || !password) {
        return new Response(JSON.stringify({ error: "E-mail e senha são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const requestedRole = role || "Usuário";
      const allowedRoles = isAdmin
        ? ["Administrador", "Operador", "Usuário"]
        : ["Operador", "Usuário"];
      if (!allowedRoles.includes(requestedRole)) {
        return new Response(JSON.stringify({ error: "Perfil não permitido para o seu nível de acesso" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("profiles").insert({
        id: userData.user.id,
        email,
        role: requestedRole,
        unit: unit || "",
        full_name: full_name || "",
        cpf: cpf || "",
        active: true,
        must_change_password: true,
      });

      return new Response(JSON.stringify({ user: userData.user }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "ensure-profile") {
      const { email, role, unit } = await req.json();

      // Find user by email in auth
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authUser = users.find((u: any) => u.email === email);
      if (!authUser) {
        return new Response(JSON.stringify({ error: "Usuário não encontrado na autenticação" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert profile
      const { error: upsertError } = await supabaseAdmin.from("profiles").upsert({
        id: authUser.id,
        email,
        role: role || "Administrador",
        unit: unit || "",
        active: true,
      });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, userId: authUser.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "toggle") {
      const { userId, active } = await req.json();

      const { error } = await supabaseAdmin.from("profiles").update({ active }).eq("id", userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "delete") {
      const { userId } = await req.json();

      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "reset-password") {
      const { userId, newPassword } = await req.json();

      if (!userId || !newPassword) {
        return new Response(JSON.stringify({ error: "ID do usuário e nova senha são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "update") {
      const { userId, role, unit, full_name, cpf } = await req.json();

      if (!userId) {
        return new Response(JSON.stringify({ error: "ID do usuário é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedRoles = isAdmin
        ? ["Administrador", "Operador", "Usuário"]
        : ["Operador", "Usuário"];

      const updates: Record<string, unknown> = {};
      if (typeof role === "string") {
        if (!allowedRoles.includes(role)) {
          return new Response(JSON.stringify({ error: "Perfil não permitido para o seu nível de acesso" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        updates.role = role;
      }
      if (typeof unit === "string") updates.unit = unit;
      if (typeof full_name === "string") updates.full_name = full_name;
      if (typeof cpf === "string") updates.cpf = cpf;

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
