import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toBase64UrlFromString(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64UrlFromBuffer(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function buildContentDisposition(action: string, fileName: string) {
  if (action !== "download") return "inline";

  const asciiFallback = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "'");

  const encodedFileName = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback || "arquivo"}"; filename*=UTF-8''${encodedFileName}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64UrlFromString(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const jwt = `${header}.${payload}.${toBase64UrlFromBuffer(signature)}`;

  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    throw new Error(`Failed to get access token: ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { driveFileId, action } = await req.json();

    if (!driveFileId) {
      return new Response(JSON.stringify({ error: "driveFileId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load Google Drive config
    const { data: configData, error: configError } = await supabase.storage
      .from("settings")
      .download("google-drive-config.json");

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ error: "Google Drive não configurado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = JSON.parse(await configData.text());

    if (!config.serviceAccount?.client_email || !config.serviceAccount?.private_key) {
      return new Response(
        JSON.stringify({ error: "Configuração do Google Drive incompleta." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(config.serviceAccount);

    if (action === "metadata") {
      // Return file metadata (name, mimeType, size)
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,mimeType,size,webViewLink,webContentLink&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!metaRes.ok) {
        throw new Error(`Erro ao obter metadados: ${await metaRes.text()}`);
      }

      const metadata = await metaRes.json();
      return new Response(JSON.stringify(metadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: stream the file content
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fileRes.ok) {
      throw new Error(`Erro ao baixar arquivo do Drive: ${fileRes.status}`);
    }

    const fileBody = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";

    // Get file name for download
    const metaRes2 = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=name&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const fileMeta = metaRes2.ok ? await metaRes2.json() : { name: "arquivo" };

    const disposition = buildContentDisposition(action, fileMeta.name || "arquivo");

    return new Response(fileBody, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(fileBody.byteLength),
      },
    });
  } catch (error: unknown) {
    console.error("Error in serve-drive-file:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
