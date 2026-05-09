import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }

    // Validate caller is admin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || profile.role !== "Administrador" || !profile.active) {
      return json({ error: "Apenas administradores podem realizar backup/restauração" }, 403);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "POST" && action === "export") {
      const { data: profiles } = await admin.from("profiles").select("*");
      const { data: auditLogs } = await admin.from("audit_logs").select("*");
      const { data: documents } = await admin
        .from("documents")
        .select("id,user_id,title,category,unit,subject,keywords,notes,file_name,file_path,file_type,file_size,drive_file_id,drive_link,ocr_status,ocr_text,sign_status,created_at,updated_at");
      const { data: categories } = await admin.from("categories").select("*");
      const { data: units } = await admin.from("units").select("*");

      const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const authUsers = (authList?.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
        created_at: u.created_at,
      }));

      const backup = {
        version: 1,
        generated_at: new Date().toISOString(),
        profiles: profiles || [],
        auth_users: authUsers,
        audit_logs: auditLogs || [],
        documents: documents || [],
        categories: categories || [],
        units: units || [],
      };

      await admin.from("audit_logs").insert({
        user_id: userData.user.id,
        user_email: userData.user.email || "",
        action: "Backup exportado",
        action_type: "backup",
        target: "sistema",
        details: `${(profiles||[]).length} perfis, ${(documents||[]).length} documentos, ${(auditLogs||[]).length} auditorias`,
      });

      return json(backup, 200);
    }

    if (req.method === "POST" && action === "import") {
      const body = await req.json();
      const backup = body?.backup;
      if (!backup || typeof backup !== "object") return json({ error: "Backup inválido" }, 400);

      const stats = { profiles: 0, audit_logs: 0, documents: 0, categories: 0, units: 0 };

      if (Array.isArray(backup.categories)) {
        for (const c of backup.categories) {
          await admin.from("categories").upsert(c, { onConflict: "id" });
          stats.categories++;
        }
      }
      if (Array.isArray(backup.units)) {
        for (const u of backup.units) {
          await admin.from("units").upsert(u, { onConflict: "id" });
          stats.units++;
        }
      }
      if (Array.isArray(backup.profiles)) {
        for (const p of backup.profiles) {
          await admin.from("profiles").upsert(p, { onConflict: "id" });
          stats.profiles++;
        }
      }
      if (Array.isArray(backup.documents)) {
        for (const d of backup.documents) {
          await admin.from("documents").upsert(d, { onConflict: "id" });
          stats.documents++;
        }
      }
      if (Array.isArray(backup.audit_logs)) {
        for (const a of backup.audit_logs) {
          await admin.from("audit_logs").upsert(a, { onConflict: "id" });
          stats.audit_logs++;
        }
      }

      await admin.from("audit_logs").insert({
        user_id: userData.user.id,
        user_email: userData.user.email || "",
        action: "Backup restaurado",
        action_type: "restore",
        target: "sistema",
        details: JSON.stringify(stats),
      });

      return json({ success: true, stats }, 200);
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
