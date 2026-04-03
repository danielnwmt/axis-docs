import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GoogleDriveConfig {
  serviceAccount: {
    client_email: string;
    private_key: string;
    token_uri: string;
  };
  rootFolderId: string;
  ownerEmail?: string;
  authMode?: string;
  oauth2?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

function toBase64UrlFromString(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64UrlFromBuffer(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getServiceAccountToken(
  sa: GoogleDriveConfig["serviceAccount"]
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadData = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const payload = toBase64UrlFromString(JSON.stringify(payloadData));

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
    throw new Error(`Failed to get SA access token: ${await tokenRes.text()}`);
  }
  return (await tokenRes.json()).access_token;
}

async function getOAuth2Token(oauth2: GoogleDriveConfig["oauth2"]): Promise<string> {
  if (!oauth2?.clientId || !oauth2?.clientSecret || !oauth2?.refreshToken) {
    throw new Error("OAuth2 credentials incomplete");
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauth2.clientId,
      client_secret: oauth2.clientSecret,
      refresh_token: oauth2.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Failed to get OAuth2 token: ${await tokenRes.text()}`);
  }
  return (await tokenRes.json()).access_token;
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

    const { driveFileId } = await req.json();
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

    const config: GoogleDriveConfig = JSON.parse(await configData.text());

    // Get access token based on auth mode
    let accessToken: string;
    if (config.authMode === "oauth2" && config.oauth2) {
      accessToken = await getOAuth2Token(config.oauth2);
    } else {
      accessToken = await getServiceAccountToken(config.serviceAccount);
    }

    // Delete file from Google Drive
    const deleteRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!deleteRes.ok && deleteRes.status !== 404) {
      const errText = await deleteRes.text();
      console.error("Google Drive delete failed:", errText);
      throw new Error(`Erro ao excluir do Google Drive [${deleteRes.status}]: ${errText}`);
    }

    console.log(`File ${driveFileId} deleted from Google Drive`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in delete-from-drive:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
