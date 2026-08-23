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

const DEFAULT_UNITS = [
  "Gabinete", "Finanças", "Recursos Humanos", "Jurídico", "Licitações e Contratos",
  "Planejamento", "Saúde", "Educação", "Obras e Infraestrutura", "Meio Ambiente",
  "Cultura", "Esporte e Lazer", "Transporte", "Comunicação", "Tecnologia da Informação",
  "Controle Interno", "Ouvidoria", "Agricultura", "Assistência Social", "Administração",
];

const DEFAULT_CATEGORIES = [
  "Processo Administrativo", "Ofício", "Memorando", "Portaria", "Decreto", "Lei",
  "Nota Fiscal", "Contrato", "Convênio", "Ata", "Relatório", "Parecer", "Certidão",
  "Licença", "Requerimento", "Edital", "Termo de Referência", "Ordem de Serviço",
  "Nota de Empenho", "Alvará",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração do servidor incompleta" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user) return json({ error: "Token inválido" }, 401);

    const { data: owner } = await admin
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", caller.user.id)
      .maybeSingle();
    if (!owner) return json({ error: "Permissão negada" }, 403);

    const body = await req.json();
    const org = body?.org ?? {};
    const adminEmail = String(body?.admin_email || "").trim().toLowerCase();
    const adminPassword = String(body?.admin_password || "");
    const adminName = String(body?.admin_name || "").trim();

    if (!org?.name) return json({ error: "Nome do cliente é obrigatório" }, 400);
    if (!adminEmail || adminPassword.length < 6) {
      return json({ error: "E-mail e senha (mín. 6 caracteres) do usuário padrão são obrigatórios" }, 400);
    }

    // Cria a organização
    const { data: newOrg, error: orgErr } = await admin
      .from("organizations")
      .insert(org)
      .select("id, name")
      .single();
    if (orgErr) return json({ error: orgErr.message }, 400);

    const orgId = newOrg.id;

    // Dados padrão (unidades e categorias) para a nova organização
    await admin.from("units").insert(
      DEFAULT_UNITS.map((name) => ({ name, org_id: orgId, active: true, is_default: true }))
    );
    await admin.from("categories").insert(
      DEFAULT_CATEGORIES.map((name) => ({ name, org_id: orgId, active: true, is_default: true }))
    );

    // Usuário administrador padrão da empresa
    const { data: listData } = await admin.auth.admin.listUsers();
    const existing = listData?.users?.find(
      (u: any) => String(u.email || "").toLowerCase() === adminEmail
    );

    let userId = existing?.id as string | undefined;
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
      if (createErr) {
        await admin.from("organizations").delete().eq("id", orgId);
        return json({ error: createErr.message }, 400);
      }
      userId = created.user.id;
    } else {
      await admin.auth.admin.updateUserById(userId, { password: adminPassword });
    }

    const { error: profileErr } = await admin.from("profiles").upsert({
      id: userId,
      email: adminEmail,
      role: "Administrador",
      unit: "Gabinete",
      full_name: adminName || adminEmail,
      cpf: "",
      active: true,
      must_change_password: true,
      org_id: orgId,
    });
    if (profileErr) {
      if (!existing) await admin.auth.admin.deleteUser(userId!).catch(() => {});
      await admin.from("organizations").delete().eq("id", orgId);
      return json({ error: profileErr.message }, 400);
    }

    // Configurações iniciais
    await admin.from("backup_settings").insert({ org_id: orgId }).select().maybeSingle();

    return json({ success: true, org_id: orgId, user_id: userId });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
