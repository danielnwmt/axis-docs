import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { loadDriveConfigForUser } from "../_shared/orgDrive.ts";

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

    // Auth check (compatível com signing keys)
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const jwt = auth.replace("Bearer ", "").trim();
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    let userId: string | null = null;
    const { data: claimsData } = await anon.auth.getClaims(jwt);
    userId = (claimsData?.claims?.sub as string) ?? null;
    if (!userId) {
      const { data: u } = await admin.auth.getUser(jwt);
      userId = u?.user?.id ?? null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Token inválido", debug: { jwtLen: jwt.length, role: (claimsData as any)?.claims?.role ?? null } }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: prof } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    const orgId = prof?.org_id ?? null;

    const cfg: GoogleDriveConfig = await loadDriveConfigForUser(admin, userId);
    const rootId = cfg ? extractFolderId(cfg.rootFolderId) : "";

    let usedBytes = 0;
    if (cfg && rootId) {
      const token = await getAccessToken(cfg.serviceAccount);
      usedBytes = await sumFolder(token, rootId);
    }

    const { data: org } = orgId
      ? await admin.from("organizations").select("id, storage_limit_gb").eq("id", orgId).maybeSingle()
      : { data: null as any };

    const limitGb = Number(org?.storage_limit_gb || 0);
    const limitBytes = limitGb > 0 ? Math.floor(limitGb * 1024 ** 3) : 0;
    const full = limitBytes > 0 && usedBytes >= limitBytes;

    if (org?.id) {
      await admin.from("organizations").update({ storage_used_bytes: usedBytes }).eq("id", org.id);
    }


    return new Response(JSON.stringify({ usedBytes, limitBytes, full, rootFolderId: rootId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
