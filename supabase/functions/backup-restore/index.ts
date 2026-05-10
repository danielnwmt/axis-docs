import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DriveSA {
  client_email: string;
  private_key: string;
  token_uri: string;
}
interface DriveConfig {
  serviceAccount: DriveSA;
  rootFolderId: string;
  ownerEmail?: string;
}

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlBuf = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function getDriveToken(sa: DriveSA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const jwt = `${header}.${payload}.${b64urlBuf(sig)}`;
  const r = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!r.ok) throw new Error(`Drive auth failed: ${await r.text()}`);
  return (await r.json()).access_token;
}

function extractFolderId(input: string): string {
  if (!input) return "";
  const m = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

async function ensureFolder(token: string, name: string, parentId: string): Promise<string> {
  const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const d = await r.json();
  if (d.files?.[0]?.id) return d.files[0].id;
  const c = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!c.ok) throw new Error(`Folder create failed: ${await c.text()}`);
  return (await c.json()).id;
}

async function uploadJsonToDrive(token: string, folderId: string, fileName: string, json: string) {
  const bytes = new TextEncoder().encode(json);
  const boundary = `b${Date.now()}`;
  const meta = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [folderId] })}\r\n`,
  );
  const mediaHdr = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`);
  const ending = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(meta.length + mediaHdr.length + bytes.length + ending.length);
  body.set(meta, 0);
  body.set(mediaHdr, meta.length);
  body.set(bytes, meta.length + mediaHdr.length);
  body.set(ending, meta.length + mediaHdr.length + bytes.length);
  const r = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size&supportsAllDrives=true",
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body },
  );
  if (!r.ok) throw new Error(`Drive upload failed: ${await r.text()}`);
  return await r.json();
}

async function deleteDriveFile(token: string, fileId: string): Promise<boolean> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  return r.ok || r.status === 404;
}

async function loadDriveConfig(admin: any): Promise<DriveConfig> {
  const { data, error } = await admin.storage.from("settings").download("google-drive-config.json");
  if (error || !data) throw new Error("Google Drive não configurado.");
  const cfg = JSON.parse(await data.text()) as DriveConfig;
  if (!cfg.serviceAccount?.client_email || !cfg.serviceAccount?.private_key) throw new Error("Configuração do Google Drive incompleta.");
  if (!cfg.rootFolderId) throw new Error("Pasta raiz do Google Drive não configurada.");
  return cfg;
}

async function buildBackupJson(admin: any) {
  const [{ data: profiles }, { data: auditLogs }, { data: documents }, { data: categories }, { data: units }] = await Promise.all([
    admin.from("profiles").select("*"),
    admin.from("audit_logs").select("*"),
    admin.from("documents").select("id,user_id,title,category,unit,subject,keywords,notes,file_name,file_path,file_type,file_size,drive_file_id,drive_link,ocr_status,ocr_text,sign_status,created_at,updated_at"),
    admin.from("categories").select("*"),
    admin.from("units").select("*"),
  ]);
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = (authList?.users || []).map((u: any) => ({
    id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at, created_at: u.created_at,
  }));
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    profiles: profiles || [],
    auth_users: authUsers,
    audit_logs: auditLogs || [],
    documents: documents || [],
    categories: categories || [],
    units: units || [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Internal cleanup action: callable via cron with service role key, no user required
    if (req.method === "POST" && action === "cleanup") {
      return await runCleanup(admin);
    }

    // Internal scheduled backup: cron checks every hour if it's time to run
    if (req.method === "POST" && action === "scheduled-run") {
      return await runScheduledBackup(admin);
    }

    // All other actions require admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Não autorizado" }, 401);
    const { data: profile } = await admin.from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle();
    if (!profile || profile.role !== "Administrador" || !profile.active) {
      return json({ error: "Apenas administradores podem realizar backup/restauração" }, 403);
    }

    if (req.method === "POST" && action === "export") {
      const backup = await buildBackupJson(admin);
      await admin.from("audit_logs").insert({
        user_id: userData.user.id, user_email: userData.user.email || "",
        action: "Backup exportado", action_type: "backup", target: "sistema",
        details: `${backup.profiles.length} perfis, ${backup.documents.length} documentos`,
      });
      return json(backup, 200);
    }

    if (req.method === "POST" && action === "export-to-drive") {
      const { data: settings } = await admin.from("backup_settings").select("*").limit(1).maybeSingle();
      const retentionDays = Math.max(1, Number(settings?.retention_days || 5));
      const cfg = await loadDriveConfig(admin);
      const token = await getDriveToken(cfg.serviceAccount);
      const rootId = extractFolderId(cfg.rootFolderId);
      const backupsFolderId = settings?.drive_folder_id || await ensureFolder(token, "Backups", rootId);
      if (!settings?.drive_folder_id) {
        await admin.from("backup_settings").update({ drive_folder_id: backupsFolderId, updated_at: new Date().toISOString() }).eq("id", settings?.id);
      }
      const backup = await buildBackupJson(admin);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const fileName = `axisdocs-backup-${ts}.json`;
      const jsonStr = JSON.stringify(backup, null, 2);
      const driveFile = await uploadJsonToDrive(token, backupsFolderId, fileName, jsonStr);
      const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: row } = await admin.from("backup_files").insert({
        drive_file_id: driveFile.id,
        drive_link: driveFile.webViewLink,
        file_name: driveFile.name,
        file_size: Number(driveFile.size || jsonStr.length),
        retention_days: retentionDays,
        expires_at: expiresAt,
        created_by: userData.user.id,
      }).select().single();
      await admin.from("audit_logs").insert({
        user_id: userData.user.id, user_email: userData.user.email || "",
        action: "Backup enviado ao Google Drive", action_type: "backup", target: fileName,
        details: `Retenção: ${retentionDays} dias. Expira em ${new Date(expiresAt).toLocaleString("pt-BR")}.`,
      });
      return json({ success: true, file: row }, 200);
    }

    if (req.method === "POST" && action === "import") {
      const body = await req.json();
      const backup = body?.backup;
      if (!backup || typeof backup !== "object") return json({ error: "Backup inválido" }, 400);
      const stats = { profiles: 0, audit_logs: 0, documents: 0, categories: 0, units: 0 };
      const upsertAll = async (rows: any[], table: string, key: keyof typeof stats) => {
        if (Array.isArray(rows)) for (const r of rows) { await admin.from(table).upsert(r, { onConflict: "id" }); stats[key]++; }
      };
      await upsertAll(backup.categories, "categories", "categories");
      await upsertAll(backup.units, "units", "units");
      await upsertAll(backup.profiles, "profiles", "profiles");
      await upsertAll(backup.documents, "documents", "documents");
      await upsertAll(backup.audit_logs, "audit_logs", "audit_logs");
      await admin.from("audit_logs").insert({
        user_id: userData.user.id, user_email: userData.user.email || "",
        action: "Backup restaurado", action_type: "restore", target: "sistema",
        details: JSON.stringify(stats),
      });
      return json({ success: true, stats }, 200);
    }

    if (req.method === "POST" && action === "cleanup-now") {
      return await runCleanup(admin, userData.user.id, userData.user.email || "");
    }

    if (req.method === "POST" && action === "delete-drive-backup") {
      const { id } = await req.json();
      const { data: row } = await admin.from("backup_files").select("*").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Backup não encontrado" }, 404);
      try {
        const cfg = await loadDriveConfig(admin);
        const token = await getDriveToken(cfg.serviceAccount);
        await deleteDriveFile(token, row.drive_file_id);
      } catch (e) { console.warn("Drive delete failed:", e); }
      await admin.from("backup_files").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      await admin.from("audit_logs").insert({
        user_id: userData.user.id, user_email: userData.user.email || "",
        action: "Backup excluído do Google Drive", action_type: "backup", target: row.file_name,
      });
      return json({ success: true }, 200);
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});

async function runCleanup(admin: any, userId?: string, userEmail?: string) {
  const { data: settings } = await admin.from("backup_settings").select("*").limit(1).maybeSingle();
  if (settings && settings.auto_cleanup === false) {
    return json({ success: true, deleted: 0, skipped: "auto_cleanup disabled" });
  }
  const { data: expired } = await admin.from("backup_files")
    .select("*").is("deleted_at", null).lte("expires_at", new Date().toISOString());
  if (!expired || expired.length === 0) return json({ success: true, deleted: 0 });
  let token: string | null = null;
  try {
    const cfg = await loadDriveConfig(admin);
    token = await getDriveToken(cfg.serviceAccount);
  } catch (e) {
    console.warn("Cleanup skipped — Drive not configured:", e);
    return json({ success: false, error: (e as Error).message }, 200);
  }
  let deleted = 0;
  for (const row of expired) {
    try {
      await deleteDriveFile(token!, row.drive_file_id);
      await admin.from("backup_files").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
      deleted++;
    } catch (e) { console.warn(`Failed to delete ${row.drive_file_id}:`, e); }
  }
  await admin.from("audit_logs").insert({
    user_id: userId || "00000000-0000-0000-0000-000000000000",
    user_email: userEmail || "system@cron",
    action: "Limpeza automática de backups",
    action_type: "backup",
    target: "google-drive",
    details: `${deleted} arquivo(s) expirado(s) removido(s) do Google Drive.`,
  });
  return json({ success: true, deleted });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
