import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

    const { data: config } = await admin
      .from("license_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ ok: false, message: "Configuração de licença não encontrada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Enforce: once per 30 days
    const last = config.last_temp_unlock_at ? new Date(config.last_temp_unlock_at).getTime() : 0;
    const now = Date.now();
    if (last && now - last < THIRTY_DAYS_MS) {
      const nextAllowed = new Date(last + THIRTY_DAYS_MS);
      return new Response(
        JSON.stringify({
          ok: false,
          message: `Desbloqueio temporário já utilizado este mês. Próximo disponível em ${nextAllowed.toLocaleString("pt-BR")}.`,
          next_allowed_at: nextAllowed.toISOString(),
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const until = new Date(now + TWENTY_FOUR_HOURS_MS).toISOString();

    await admin
      .from("license_config")
      .update({
        temp_unlock_until: until,
        last_temp_unlock_at: new Date(now).toISOString(),
        message: `Desbloqueio temporário ativo até ${new Date(until).toLocaleString("pt-BR")}`,
        updated_at: new Date().toISOString(),
        updated_by: userData.user.id,
      })
      .eq("id", config.id);

    return new Response(
      JSON.stringify({ ok: true, valid_until: until }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, message: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
