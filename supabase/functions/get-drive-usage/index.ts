import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GoogleDriveConfig {
  serviceAccount: { client_email: string; private_key: string; token_uri: string };
  rootFolderId: string;
}

function b64u(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uBuf(b: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: GoogleDriveConfig["serviceAccount"]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bin, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const jwt = `${header}.${payload}.${b64uBuf(sig)}`;
  const r = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!r.ok) throw new Error(`Token error: ${await r.text()}`);
  return (await r.json()).access_token;
}

function extractFolderId(input: string): string {
  if (!input) return "";
  const m = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

async function sumFolder(token: string, folderId: string): Promise<number> {
  let total = 0;
  const stack: string[] = [folderId];
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  while (stack.length) {
    const current = stack.pop()!;
    let pageToken: string | undefined;
    do {
      const q = `'${current}' in parents and trashed=false`;
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", q);
      url.searchParams.set("fields", "nextPageToken, files(id,mimeType,size,quotaBytesUsed)");
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      url.searchParams.set("corpora", "allDrives");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Drive list error: ${await res.text()}`);
      const data = await res.json();
      for (const f of (data.files || [])) {
        if (f.mimeType === FOLDER_MIME) stack.push(f.id);
        else total += Number(f.quotaBytesUsed || f.size || 0);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth check
    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
    if (!profile || profile.role !== "Administrador" || !profile.active) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem consultar uso de armazenamento" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cfgFile } = await admin.storage.from("settings").download("google-drive-config.json");
    if (!cfgFile) throw new Error("Google Drive não configurado");
    const cfg: GoogleDriveConfig = JSON.parse(await cfgFile.text());
    const rootId = extractFolderId(cfg.rootFolderId);
    if (!rootId) throw new Error("rootFolderId não configurado");

    const token = await getAccessToken(cfg.serviceAccount);
    const usedBytes = await sumFolder(token, rootId);

    const { data: lic } = await admin
      .from("license_config")
      .select("id, storage_limit_gb")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const limitGb = Number(lic?.storage_limit_gb || 0);
    const limitBytes = limitGb > 0 ? Math.floor(limitGb * 1024 ** 3) : 0;
    const full = limitBytes > 0 && usedBytes >= limitBytes;

    if (lic?.id) {
      await admin.from("license_config").update({ storage_used_bytes: usedBytes, updated_at: new Date().toISOString() }).eq("id", lic.id);
    }

    return new Response(JSON.stringify({ usedBytes, limitBytes, full, rootFolderId: rootId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("get-drive-usage error:", e);
    return new Response(JSON.stringify({ error: "Erro interno. Contate o administrador." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
