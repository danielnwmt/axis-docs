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

    // verify user
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

    // load config (singleton)
    const { data: config } = await admin
      .from("license_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config || !config.server_url || !config.license_key) {
      return new Response(
        JSON.stringify({
          status: "inactive",
          message: "Licença não configurada. Cadastre a URL do servidor e a chave.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // call external license server
    let serverStatus = "unreachable";
    let serverData: any = {};
    let errorMessage = "";

    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(config.server_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          license_key: config.license_key,
          hardware_id: config.hardware_id || "",
          product: "axisdocs",
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      serverData = await resp.json().catch(() => ({}));
      serverStatus = String(serverData.status || (resp.ok ? "active" : "blocked")).toLowerCase();
      if (!["active", "blocked", "expired", "invalid"].includes(serverStatus)) {
        serverStatus = resp.ok ? "active" : "blocked";
      }
    } catch (e: any) {
      errorMessage = `Servidor de licença inacessível: ${e?.message || e}`;
      // Grace mode: if previously active and within last 7 days, keep active
      if (config.status === "active" && config.last_check) {
        const daysSince = (Date.now() - new Date(config.last_check).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          serverStatus = "active";
          errorMessage += " (modo offline tolerante - até 7 dias)";
        } else {
          serverStatus = "blocked";
        }
      } else {
        serverStatus = "blocked";
      }
    }

    const updates: Record<string, any> = {
      status: serverStatus,
      last_check: new Date().toISOString(),
      message: serverData.message || errorMessage || "",
      customer_name: serverData.customer_name || serverData.customer || config.customer_name || "",
      expires_at: serverData.expires_at || serverData.expiresAt || config.expires_at,
      updated_at: new Date().toISOString(),
      updated_by: userData.user.id,
    };

    await admin.from("license_config").update(updates).eq("id", config.id);

    return new Response(
      JSON.stringify({
        status: serverStatus,
        customer_name: updates.customer_name,
        expires_at: updates.expires_at,
        message: updates.message,
        last_check: updates.last_check,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
