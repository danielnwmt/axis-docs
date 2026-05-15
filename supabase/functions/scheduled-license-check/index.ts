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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: config } = await admin
      .from("license_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config || !config.server_url || !config.license_key) {
      return new Response(JSON.stringify({ ok: false, message: "Sem licença configurada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Respect active temporary unlock
    if (config.temp_unlock_until && new Date(config.temp_unlock_until).getTime() > Date.now()) {
      return new Response(JSON.stringify({ ok: true, skipped: "temp_unlock_active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let serverStatus = "unreachable";
    let serverData: any = {};
    let errorMessage = "";

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000);
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
      clearTimeout(tid);
      serverData = await resp.json().catch(() => ({}));
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
      if (config.status === "active" && config.last_check) {
        const days = (Date.now() - new Date(config.last_check).getTime()) / (1000 * 60 * 60 * 24);
        serverStatus = days < 7 ? "active" : "blocked";
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
    };

    await admin.from("license_config").update(updates).eq("id", config.id);

    // Audit log (system)
    await admin.from("audit_logs").insert({
      user_id: null,
      user_email: "system@cron",
      action: `Verificação automática de licença: ${serverStatus}`,
      action_type: "system",
      target: "license",
      details: updates.message || null,
    });

    return new Response(JSON.stringify({ ok: true, status: serverStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
