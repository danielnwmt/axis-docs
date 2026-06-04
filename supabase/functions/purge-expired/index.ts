import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Aplica retention_policies da LGPD:
// - action='delete'   → remove doc do Drive + linha
// - action='anonymize'→ zera title/notes/subject/keywords/ocr_text e marca [ANONIMIZADO]
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Permite cron interno (x-cron-secret OU chamada sem JWT por pg_cron com apikey anon) ou admin autenticado
    const cronSecret = req.headers.get("x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    let isCron = !!(expected && cronSecret === expected);
    let actorId = "00000000-0000-0000-0000-000000000000";
    let actorEmail = "system@cron";

    if (!isCron && !authHeader) {
      // Reject unauthenticated requests — never treat missing auth as cron
      return json({ error: "Unauthorized" }, 401);
    } else if (!isCron) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader! } } },
      );
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Não autorizado" }, 401);
      const { data: p } = await admin.from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle();
      if (!p || p.role !== "Administrador" || !p.active) return json({ error: "Apenas administradores" }, 403);
      actorId = userData.user.id;
      actorEmail = userData.user.email || "";
    }

    const { data: policies } = await admin.from("retention_policies").select("*").eq("active", true);
    if (!policies || policies.length === 0) {
      return json({ success: true, processed: 0, message: "Sem políticas ativas" });
    }

    const summary: any[] = [];
    let total = 0;

    for (const pol of policies) {
      const cutoff = new Date(Date.now() - Number(pol.retention_days) * 86400000).toISOString();
      const { data: docs } = await admin.from("documents")
        .select("id, title, drive_file_id, file_path, user_id")
        .eq("category", pol.category)
        .lt("created_at", cutoff)
        .limit(500);
      if (!docs || docs.length === 0) continue;

      for (const doc of docs) {
        try {
          if (pol.action === "delete") {
            if (doc.drive_file_id) {
              try {
                await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/delete-from-drive`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({ fileId: doc.drive_file_id }),
                });
              } catch (_) { /* ignore drive failure, still purge metadata */ }
            }
            await admin.from("documents").delete().eq("id", doc.id);
          } else {
            // anonymize
            await admin.from("documents").update({
              title: "[ANONIMIZADO]",
              subject: "",
              keywords: "",
              notes: "Conteúdo removido por política de retenção LGPD",
              ocr_text: "",
              updated_at: new Date().toISOString(),
            }).eq("id", doc.id);
          }
          total++;
        } catch (e) {
          console.warn("purge failed", doc.id, e);
        }
      }
      summary.push({ category: pol.category, action: pol.action, count: docs.length });
    }

    await admin.from("audit_logs").insert({
      user_id: actorId, user_email: actorEmail,
      action: isCron ? "Retenção LGPD automática" : "Retenção LGPD manual",
      action_type: "other",
      target: "documents",
      details: `Processados: ${total}. ${JSON.stringify(summary)}`,
    });

    return json({ success: true, processed: total, summary });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
