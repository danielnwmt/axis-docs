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

async function getAccessToken(sa: GoogleDriveConfig["serviceAccount"]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64UrlFromString(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
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
  return (await tokenRes.json()).access_token;
}

function extractFolderId(input: string): string {
  if (!input) return "";
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

async function findFolder(accessToken: string, folderName: string, parentId: string): Promise<string | null> {
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Erro ao buscar pasta: ${await res.text()}`);
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentId: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`Erro ao criar pasta: ${await res.text()}`);
  return (await res.json()).id;
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse FormData - file comes directly from the client
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileName = formData.get("fileName") as string || file?.name || "arquivo";
    const unitName = formData.get("unitName") as string || "";
    const mimeType = file?.type || "application/octet-stream";

    if (!file) {
      return new Response(JSON.stringify({ error: "Arquivo é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load Google Drive config
    const { data: configData, error: configError } = await supabase.storage
      .from("settings")
      .download("google-drive-config.json");

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ error: "Google Drive não configurado. Configure em Configurações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config: GoogleDriveConfig = JSON.parse(await configData.text());

    if (!config.serviceAccount?.client_email || !config.serviceAccount?.private_key) {
      return new Response(
        JSON.stringify({ error: "Configuração do Google Drive incompleta." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rootFolderId = extractFolderId(config.rootFolderId);
    if (!rootFolderId) {
      return new Response(
        JSON.stringify({ error: "ID da pasta raiz do Google Drive não configurado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token and resolve target folder in parallel
    const accessToken = await getAccessToken(config.serviceAccount);
    console.log("Access token obtained");

    let targetFolderId = rootFolderId;
    if (unitName) {
      const existingId = await findFolder(accessToken, unitName, rootFolderId);
      targetFolderId = existingId || await createFolder(accessToken, unitName, rootFolderId);
      console.log(`Target folder: ${targetFolderId} (unit: ${unitName})`);
    }

    // Read file bytes
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    console.log(`Uploading ${fileBytes.length} bytes, mime: ${mimeType}`);

    // Build multipart upload
    const metadata = JSON.stringify({ name: fileName, parents: [targetFolderId] });
    const boundary = `---boundary${Date.now()}`;
    const metadataPart = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
    );
    const mediaPart = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const ending = new TextEncoder().encode(`\r\n--${boundary}--`);

    const fullBody = new Uint8Array(metadataPart.length + mediaPart.length + fileBytes.length + ending.length);
    fullBody.set(metadataPart, 0);
    fullBody.set(mediaPart, metadataPart.length);
    fullBody.set(fileBytes, metadataPart.length + mediaPart.length);
    fullBody.set(ending, metadataPart.length + mediaPart.length + fileBytes.length);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true&enforceSingleParent=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: fullBody,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("Google Drive upload error:", errText);
      throw new Error(`Google Drive upload failed [${uploadRes.status}]: ${errText}`);
    }

    const driveFile = await uploadRes.json();
    console.log(`Upload OK - ID: ${driveFile.id}, Link: ${driveFile.webViewLink}`);

    // Non-fatal ownership transfer attempt
    const ownerEmail = config.ownerEmail?.trim();
    if (ownerEmail && driveFile.id) {
      try {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions?supportsAllDrives=true&transferOwnership=true`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ role: "owner", type: "user", emailAddress: ownerEmail }),
          }
        );
      } catch (e) {
        console.warn("Ownership transfer failed (non-fatal):", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        driveFileId: driveFile.id,
        driveFileName: driveFile.name,
        driveLink: driveFile.webViewLink,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in upload-to-drive:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
