import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // require admin
    const { data: profile } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "Administrador" || profile?.active !== true) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const unlock_code = String(body?.unlock_code || "").trim();
    if (!unlock_code) {
      return new Response(JSON.stringify({ error: "Informe o código de desbloqueio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await admin
      .from("license_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config || !config.server_url) {
      return new Response(
        JSON.stringify({ ok: false, message: "Configure a URL do servidor de licenças primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call license server with action=unlock
    let ok = false;
    let serverMsg = "";
    let valid_until: string | null = null;
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(config.server_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlock",
          unlock_code,
          license_key: config.license_key || "",
          hardware_id: config.hardware_id || "",
          product: "axisdocs",
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      const data = await resp.json().catch(() => ({}));
      ok = resp.ok && (data.ok === true || String(data.status || "").toLowerCase() === "active");
      serverMsg = data.message || "";
      if (data.valid_until) valid_until = data.valid_until;
    } catch (e: any) {
      serverMsg = `Servidor inacessível: ${e?.message || e}`;
    }

    if (!ok) {
      return new Response(
        JSON.stringify({ ok: false, message: serverMsg || "Código inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const until = valid_until
      ? new Date(valid_until).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await admin
      .from("license_config")
      .update({
        temp_unlock_until: until,
        message: `Desbloqueio temporário ativo até ${new Date(until).toLocaleString("pt-BR")}`,
        updated_at: new Date().toISOString(),
        updated_by: userData.user.id,
      })
      .eq("id", config.id);

    return new Response(
      JSON.stringify({ ok: true, valid_until: until, message: serverMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
