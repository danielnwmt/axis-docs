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
  const [
    { data: profiles },
    { data: auditLogs },
    { data: documents },
    { data: categories },
    { data: units },
    { data: backupSettings },
    { data: backupFiles },
    { data: licenseConfig },
  ] = await Promise.all([
    admin.from("profiles").select("*"),
    admin.from("audit_logs").select("*"),
    admin.from("documents").select("id,user_id,title,category,unit,subject,keywords,notes,file_name,file_path,file_type,file_size,drive_file_id,drive_link,ocr_status,ocr_text,sign_status,created_at,updated_at"),
    admin.from("categories").select("*"),
    admin.from("units").select("*"),
    admin.from("backup_settings").select("*"),
    admin.from("backup_files").select("*"),
    admin.from("license_config").select("*"),
  ]);
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = (authList?.users || []).map((u: any) => ({
    id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at, created_at: u.created_at,
  }));

  // Settings stored in storage bucket (Drive config, signature config, etc) — metadata only
  let settingsFiles: { name: string; content: string }[] = [];
  try {
    const { data: list } = await admin.storage.from("settings").list("", { limit: 100 });
    if (list) {
      for (const f of list) {
        try {
          const { data: blob } = await admin.storage.from("settings").download(f.name);
          if (blob) settingsFiles.push({ name: f.name, content: await blob.text() });
        } catch (_) { /* ignore */ }
      }
    }
  } catch (_) { /* bucket may not exist */ }

  return {
    version: 2,
    generated_at: new Date().toISOString(),
    profiles: profiles || [],
    auth_users: authUsers,
    audit_logs: auditLogs || [],
    documents: documents || [],
    categories: categories || [],
    units: units || [],
    backup_settings: backupSettings || [],
    backup_files: backupFiles || [],
    license_config: licenseConfig || [],
    settings_files: settingsFiles,
  };
}

// ===== LGPD: AES-256-GCM + SHA-256 =====
async function getBackupKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
  if (!secret) throw new Error("CERT_ENCRYPTION_KEY não configurado.");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function toB64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const c of b) s += String.fromCharCode(c);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function encryptBackup(plain: string): Promise<{ envelope: string; sha256: string }> {
  const key = await getBackupKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const sha256 = await sha256Hex(plain);
  const envelope = JSON.stringify({
    axisdocs_backup: true, encrypted: true, algo: "AES-256-GCM",
    iv: toB64(iv), data: toB64(ct), sha256, generated_at: new Date().toISOString(),
  }, null, 2);
  return { envelope, sha256 };
}
async function decryptBackupIfNeeded(input: any): Promise<any> {
  if (!input || typeof input !== "object") throw new Error("Backup inválido");
  if (!input.encrypted) return input;
  if (input.algo !== "AES-256-GCM") throw new Error("Algoritmo não suportado: " + input.algo);
  const key = await getBackupKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(input.iv) }, key, fromB64(input.data));
  const plain = new TextDecoder().decode(pt);
  const hash = await sha256Hex(plain);
  if (input.sha256 && input.sha256 !== hash) throw new Error("Integridade falhou: hash SHA-256 não confere.");
  return JSON.parse(plain);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Internal cron actions: require shared CRON_SECRET header
    if (req.method === "POST" && (action === "cleanup" || action === "scheduled-run")) {
      const cronSecret = req.headers.get("x-cron-secret");
      const expected = Deno.env.get("CRON_SECRET");
      if (!expected || cronSecret !== expected) {
        return json({ error: "Unauthorized" }, 401);
      }
      if (action === "cleanup") return await runCleanup(admin);
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
      const plain = JSON.stringify(backup);
      const { envelope, sha256 } = await encryptBackup(plain);
      await admin.from("audit_logs").insert({
        user_id: userData.user.id, user_email: userData.user.email || "",
        action: "Backup exportado (cifrado)", action_type: "backup", target: "sistema",
        details: `${backup.profiles.length} perfis, ${backup.documents.length} documentos. SHA-256=${sha256.slice(0,16)}…`,
      });
      return new Response(envelope, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const fileName = `axisdocs-backup-${ts}.enc.json`;
      const plain = JSON.stringify(backup);
      const { envelope, sha256 } = await encryptBackup(plain);
      const driveFile = await uploadJsonToDrive(token, backupsFolderId, fileName, envelope);
      const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: row } = await admin.from("backup_files").insert({
        drive_file_id: driveFile.id,
        drive_link: driveFile.webViewLink,
        file_name: driveFile.name,
        file_size: Number(driveFile.size || envelope.length),
        retention_days: retentionDays,
        expires_at: expiresAt,
        created_by: userData.user.id,
        sha256, encrypted: true, encryption_algo: "AES-256-GCM",
      }).select().single();
      await admin.from("audit_logs").insert({
        user_id: userData.user.id, user_email: userData.user.email || "",
        action: "Backup cifrado enviado ao Google Drive", action_type: "backup", target: fileName,
        details: `Retenção: ${retentionDays} dias. SHA-256=${sha256.slice(0,16)}…`,
      });
      return json({ success: true, file: row }, 200);
    }

    if (req.method === "POST" && action === "import") {
      const body = await req.json();
      let backup = body?.backup;
      try { backup = await decryptBackupIfNeeded(backup); }
      catch (e) { return json({ error: (e as Error).message }, 400); }
      if (!backup || typeof backup !== "object") return json({ error: "Backup inválido" }, 400);
      const stats = { profiles: 0, audit_logs: 0, documents: 0, categories: 0, units: 0, backup_settings: 0, backup_files: 0, license_config: 0, settings_files: 0 };
      const upsertAll = async (rows: any[], table: string, key: keyof typeof stats) => {
        if (Array.isArray(rows)) for (const r of rows) { await admin.from(table).upsert(r, { onConflict: "id" }); stats[key]++; }
      };
      await upsertAll(backup.categories, "categories", "categories");
      await upsertAll(backup.units, "units", "units");
      await upsertAll(backup.profiles, "profiles", "profiles");
      await upsertAll(backup.documents, "documents", "documents");
      await upsertAll(backup.audit_logs, "audit_logs", "audit_logs");
      await upsertAll(backup.backup_settings, "backup_settings", "backup_settings");
      await upsertAll(backup.backup_files, "backup_files", "backup_files");
      await upsertAll(backup.license_config, "license_config", "license_config");
      if (Array.isArray(backup.settings_files)) {
        for (const f of backup.settings_files) {
          try {
            const bytes = new TextEncoder().encode(f.content);
            await admin.storage.from("settings").upload(f.name, bytes, { upsert: true, contentType: "application/json" });
            stats.settings_files++;
          } catch (_) { /* ignore */ }
        }
      }
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

async function resolveBackupFolder(admin: any, token: string, settings: any, rootId: string): Promise<string> {
  let baseId = settings?.drive_folder_id;
  if (!baseId) {
    baseId = await ensureFolder(token, "AxisDocs-Backups", rootId);
    if (settings?.id) {
      await admin.from("backup_settings").update({ drive_folder_id: baseId, updated_at: new Date().toISOString() }).eq("id", settings.id);
    }
  }
  const sp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const year = String(sp.getUTCFullYear());
  const month = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const yearId = await ensureFolder(token, year, baseId);
  return await ensureFolder(token, month, yearId);
}

async function performDriveBackup(admin: any, settings: any, createdBy: string) {
  const retentionDays = Math.max(1, Number(settings?.retention_days || 5));
  const cfg = await loadDriveConfig(admin);
  const token = await getDriveToken(cfg.serviceAccount);
  const rootId = extractFolderId(cfg.rootFolderId);
  const backupsFolderId = await resolveBackupFolder(admin, token, settings, rootId);
  const backup = await buildBackupJson(admin);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const fileName = `axisdocs-backup-${ts}.enc.json`;
  const plain = JSON.stringify(backup);
  const { envelope, sha256 } = await encryptBackup(plain);
  const driveFile = await uploadJsonToDrive(token, backupsFolderId, fileName, envelope);
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: row } = await admin.from("backup_files").insert({
    drive_file_id: driveFile.id,
    drive_link: driveFile.webViewLink,
    file_name: driveFile.name,
    file_size: Number(driveFile.size || envelope.length),
    retention_days: retentionDays,
    expires_at: expiresAt,
    created_by: createdBy,
    sha256, encrypted: true, encryption_algo: "AES-256-GCM",
  }).select().single();
  return { row, fileName, retentionDays, expiresAt };
}

async function runScheduledBackup(admin: any) {
  const { data: settings } = await admin.from("backup_settings").select("*").limit(1).maybeSingle();
  if (!settings || !settings.schedule_enabled) {
    return json({ success: true, skipped: "schedule_disabled" });
  }
  const nowUtc = new Date();
  const sp = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000);
  const today = sp.toISOString().slice(0, 10);
  const currentHour = sp.getUTCHours();
  const [schedHourStr] = String(settings.schedule_time || "02:00:00").split(":");
  const schedHour = Number(schedHourStr);
  if (currentHour !== schedHour) {
    return json({ success: true, skipped: `not_time (now=${currentHour}h, scheduled=${schedHour}h)` });
  }
  if (settings.last_scheduled_run === today) {
    return json({ success: true, skipped: "already_ran_today" });
  }
  try {
    const result = await performDriveBackup(admin, settings, "00000000-0000-0000-0000-000000000000");
    await admin.from("backup_settings").update({ last_scheduled_run: today, updated_at: new Date().toISOString() }).eq("id", settings.id);
    await admin.from("audit_logs").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      user_email: "system@cron",
      action: "Backup automático agendado",
      action_type: "backup",
      target: result.fileName,
      details: `Horário ${settings.schedule_time}. Retenção: ${result.retentionDays} dias.`,
    });
    return json({ success: true, file: result.row });
  } catch (e) {
    console.error("Scheduled backup failed:", e);
    return json({ success: false, error: (e as Error).message }, 200);
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
