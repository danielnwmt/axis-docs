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
      return new Response(JSON.stringify({ ok: false, message: "Não autenticado" }), {
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
      return new Response(JSON.stringify({ ok: false, message: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "Administrador" || profile?.active !== true) {
      return new Response(JSON.stringify({ ok: false, message: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const serverUrl = normalizeLicenseServerUrl(body.server_url);
    const licenseKey = String(body.license_key || "").trim();
    const hardwareId = String(body.hardware_id || "").trim();

    if (!serverUrl || !licenseKey || !hardwareId) {
      return new Response(JSON.stringify({ ok: false, message: "URL, chave e hardware são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await admin
      .from("license_config")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      server_url: serverUrl,
      license_key: licenseKey,
      hardware_id: hardwareId,
      status: "inactive",
      updated_at: new Date().toISOString(),
      updated_by: userData.user.id,
    };

    const query = existing?.id
      ? admin.from("license_config").update(payload).eq("id", existing.id).select().single()
      : admin.from("license_config").insert(payload).select().single();

    const { data: config, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, config }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, message: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
