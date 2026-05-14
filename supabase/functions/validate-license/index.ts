import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LICENSE_CHECK_PATH = "/api/public/license/check";

function normalizeLicenseServerUrl(serverUrl: string) {
  const trimmed = String(serverUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.pathname === "" || url.pathname === "/" || url.pathname === "/admin") {
      return `${url.origin}${LICENSE_CHECK_PATH}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

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

    // Temporary unlock takes precedence (admin entered an unlock code)
    if (config?.temp_unlock_until && new Date(config.temp_unlock_until).getTime() > Date.now()) {
      return new Response(
        JSON.stringify({
          status: "active",
          customer_name: config.customer_name || "",
          expires_at: config.expires_at,
          message: `Desbloqueio temporário ativo até ${new Date(config.temp_unlock_until).toLocaleString("pt-BR")}`,
          last_check: config.last_check,
          temp_unlock_until: config.temp_unlock_until,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!config || !config.server_url || !config.license_key) {
      return new Response(
        JSON.stringify({
          status: "inactive",
          message: "Licença não configurada. Cadastre a URL do servidor e a chave.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // call external license server (contract: getlicence.lovable.app)
    let serverStatus = "unreachable";
    let serverData: any = {};
    let errorMessage = "";

    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 10000);
      const licenseServerUrl = normalizeLicenseServerUrl(config.server_url);
      const resp = await fetch(licenseServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          license_key: config.license_key,
          hostname: config.hardware_id || "axisdocs",
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      serverData = await resp.json().catch(() => ({}));

      // Map API contract: { ok, status, expires_at, blocked, expired, storage, reason }
      const apiStatus = String(serverData.status || "").toLowerCase();
      if (serverData.ok === true || apiStatus === "active" || apiStatus === "ok") {
        serverStatus = "active";
      } else if (serverData.blocked === true || apiStatus === "blocked" || apiStatus === "cancelled") {
        serverStatus = "blocked";
      } else if (serverData.expired === true || apiStatus === "expired") {
        serverStatus = "expired";
      } else if (apiStatus === "invalid" || resp.status === 404 || resp.status === 400) {
        serverStatus = "invalid";
      } else if (apiStatus === "pending") {
        serverStatus = "inactive";
      } else {
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
      server_url: normalizeLicenseServerUrl(config.server_url),
      message: serverData.reason || serverData.message || errorMessage || "",
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
