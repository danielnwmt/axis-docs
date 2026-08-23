import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: unknown) {
  return String(email || "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[create-user] Missing server configuration", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
      return json({ error: "Configuração do servidor incompleta" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }

    // Validate JWT and require active Administrador role
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (callerError || !callerData?.user) {
      return json({ error: "Token inválido" }, 401);
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, active, org_id")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (!callerProfile || !callerProfile.active) {
      return json({ error: "Permissão negada" }, 403);
    }
    const callerOrgId = (callerProfile as any).org_id as string | null;
    if (!callerOrgId) {
      return json({ error: "Usuário sem organização vinculada" }, 403);
    }

    // garante que o alvo pertence à mesma organização do solicitante
    const assertSameOrg = async (userId: string) => {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("org_id")
        .eq("id", userId)
        .maybeSingle();
      return !!data && (data as any).org_id === callerOrgId;
    };

    const isAdmin = callerProfile.role === "Administrador";
    const isOperator = callerProfile.role === "Operador";

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Operador can only create users; everything else is admin-only
    if (!isAdmin) {
      if (!(isOperator && action === "create")) {
        return json({ error: "Permissão negada" }, 403);
      }
    }


    if (req.method === "POST" && action === "create") {
      const { email, password, role, unit, full_name, cpf } = await req.json();
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail || !password) {
        return json({ error: "E-mail e senha são obrigatórios" }, 400);
      }

      const requestedRole = role || "Usuário";
      const allowedRoles = isAdmin
        ? ["Administrador", "Operador", "Usuário"]
        : ["Operador", "Usuário"];
      if (!allowedRoles.includes(requestedRole)) {
        return json({ error: "Perfil não permitido para o seu nível de acesso" }, 403);
      }

      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id,email")
        .ilike("email", normalizedEmail)
        .maybeSingle();
      if (existingProfile) {
        return json({ error: "Usuário já cadastrado" }, 400);
      }

      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        console.error("[create-user] listUsers failed", listError);
        return json({ error: listError.message }, 400);
      }
      const existingAuthUser = listData.users.find((u: any) => normalizeEmail(u.email) === normalizedEmail);
      if (existingAuthUser) {
        const { error: repairError } = await supabaseAdmin.from("profiles").upsert({
          id: existingAuthUser.id,
          email: normalizedEmail,
          role: requestedRole,
          unit: unit || "",
          full_name: full_name || "",
          cpf: cpf || "",
          active: true,
          must_change_password: true,
          org_id: callerOrgId,
        });
        if (repairError) {
          console.error("[create-user] orphan profile repair failed", repairError);
          return json({ error: repairError.message }, 400);
        }
        return json({ user: existingAuthUser });
      }

      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });

      if (createError) {
        return json({ error: createError.message }, 400);
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userData.user.id,
        email: normalizedEmail,
        role: requestedRole,
        unit: unit || "",
        full_name: full_name || "",
        cpf: cpf || "",
        active: true,
        must_change_password: true,
      });

      if (profileError) {
        console.error("[create-user] profile creation failed", profileError);
        await supabaseAdmin.auth.admin.deleteUser(userData.user.id).catch((rollbackError: unknown) => {
          console.error("[create-user] auth rollback failed", rollbackError);
        });
        return json({ error: profileError.message }, 400);
      }

      return json({ user: userData.user });
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
