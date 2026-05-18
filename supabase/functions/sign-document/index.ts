import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function b64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64UrlBuf(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getDriveAccessToken(sa: { client_email: string; private_key: string; token_uri: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64Url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const key = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${header}.${payload}`));
  const jwt = `${header}.${payload}.${b64UrlBuf(sig)}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Drive auth failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

async function downloadDrivePdfBase64(supabase: any, driveFileId: string): Promise<string> {
  const { data: cfgFile, error: cfgErr } = await supabase.storage.from("settings").download("google-drive-config.json");
  if (cfgErr || !cfgFile) throw new Error("Google Drive não configurado.");
  const cfg = JSON.parse(await cfgFile.text());
  if (!cfg.serviceAccount?.client_email || !cfg.serviceAccount?.private_key) {
    throw new Error("Configuração do Google Drive incompleta.");
  }
  const token = await getDriveAccessToken(cfg.serviceAccount);
  const fileRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!fileRes.ok) throw new Error(`Erro ao baixar do Drive: ${fileRes.status}`);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  // Convert to base64 in chunks to avoid stack overflow
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let zapSignApiKey: string | undefined = Deno.env.get("ZAPSIGN_API_KEY") || undefined;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!zapSignApiKey) {
      try {
        const { data: cfgFile } = await supabase.storage.from("settings").download("zapsign-config.json");
        if (cfgFile) {
          const cfg = JSON.parse(await cfgFile.text());
          if (cfg?.apiKey) zapSignApiKey = cfg.apiKey as string;
        }
      } catch {}
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentId, filePath, fileName, certType } = await req.json();
    if (!documentId || !filePath || !fileName) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc } = await supabase
      .from("documents")
      .select("id, user_id, file_path, drive_file_id")
      .eq("id", documentId)
      .eq("file_path", filePath)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.role === "Administrador" && profile?.active === true;

    if (!doc || (doc.user_id !== user.id && !isAdmin)) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!zapSignApiKey) {
      console.log("ZapSign API key not configured. Document saved as pending.");
      await supabase.from("documents").update({
        sign_status: "pendente",
        notes: `Certificado: ${certType} | Aguardando configuração da API ZapSign`,
      }).eq("id", documentId);
      return new Response(JSON.stringify({
        signed: false,
        message: "API ZapSign não configurada. Documento salvo como pendente.",
        documentId,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== Build ZapSign payload =====
    const zapBody: Record<string, unknown> = {
      name: fileName,
      lang: "pt-br",
      signers: [{
        name: user.email || "Assinante",
        email: user.email,
        auth_mode: certType === "A3" ? "tokenEmail" : "assinaturaTela",
        send_automatic_email: true,
      }],
    };

    if (filePath.startsWith("drive://")) {
      const driveId = doc.drive_file_id || filePath.replace("drive://", "");
      const base64 = await downloadDrivePdfBase64(supabase, driveId);
      zapBody.base64_pdf = base64;
    } else {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 3600);
      if (urlError) throw urlError;
      zapBody.url_pdf = signedUrlData.signedUrl;
    }

    const zapSignResponse = await fetch("https://api.zapsign.com.br/api/v1/docs/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${zapSignApiKey}` },
      body: JSON.stringify(zapBody),
    });

    if (!zapSignResponse.ok) {
      const errorBody = await zapSignResponse.text();
      throw new Error(`ZapSign API error [${zapSignResponse.status}]: ${errorBody}`);
    }

    const zapSignData = await zapSignResponse.json();

    await supabase.from("documents").update({
      sign_status: "assinado",
      notes: `Certificado: ${certType} | ZapSign ID: ${zapSignData.token || "N/A"}`,
    }).eq("id", documentId);

    return new Response(JSON.stringify({
      signed: true,
      zapSignToken: zapSignData.token,
      signUrl: zapSignData.signers?.[0]?.sign_url,
      documentId,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error in sign-document:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
