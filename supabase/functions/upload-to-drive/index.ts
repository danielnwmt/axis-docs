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

interface GoogleDriveFolderInfo {
  id: string;
  name?: string;
  driveId?: string;
}

interface GoogleDriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
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

function isPersonalGoogleAccount(email?: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@gmail.com") || normalized.endsWith("@googlemail.com");
}

async function getAccessToken(
  sa: GoogleDriveConfig["serviceAccount"],
  delegatedUserEmail?: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadData: Record<string, string | number> = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  if (delegatedUserEmail) {
    payloadData.sub = delegatedUserEmail;
  }

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
    const err = await tokenRes.text();
    const delegationHint = delegatedUserEmail
      ? ` Não foi possível delegar para ${delegatedUserEmail}. Verifique se a Conta de Serviço tem delegação de domínio habilitada no Google Workspace.`
      : "";
    throw new Error(`Failed to get access token: ${err}.${delegationHint}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function getFolderInfo(accessToken: string, folderId: string): Promise<GoogleDriveFolderInfo> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,driveId&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(
      `Não foi possível validar a pasta raiz do Google Drive [${response.status}]: ${await response.text()}`
    );
  }

  return await response.json();
}

async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId: string
): Promise<string> {
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) {
    throw new Error(`Erro ao buscar pasta no Google Drive [${searchRes.status}]: ${await searchRes.text()}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Erro ao criar pasta no Google Drive [${createRes.status}]: ${await createRes.text()}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

function extractFolderId(input: string): string {
  if (!input) return "";
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return input.trim();
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { filePath, fileName, unitName } = await req.json();

    if (!filePath || !fileName) {
      return new Response(JSON.stringify({ error: "filePath e fileName são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Step 1: Get initial token and check if root folder is in a Shared Drive
    let accessToken = await getAccessToken(config.serviceAccount);
    const rootFolderInfo = await getFolderInfo(accessToken, rootFolderId);
    const isSharedDriveFolder = Boolean(rootFolderInfo.driveId);
    const shouldUseDelegation =
      !isSharedDriveFolder && !!config.ownerEmail && !isPersonalGoogleAccount(config.ownerEmail);

    // Step 2: If not a Shared Drive folder and owner is a Workspace account, try delegation
    if (shouldUseDelegation) {
      accessToken = await getAccessToken(config.serviceAccount, config.ownerEmail);
    }
    // For personal Gmail or no ownerEmail, continue with the service account token directly

    // Step 3: Download the file from Supabase Storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (fileError || !fileData) {
      return new Response(
        JSON.stringify({ error: `Erro ao baixar arquivo: ${fileError?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Find or create unit subfolder
    let targetFolderId = rootFolderId;
    if (unitName) {
      targetFolderId = await findOrCreateFolder(accessToken, unitName, rootFolderId);
    }

    // Step 5: Upload file to Google Drive
    const metadata = JSON.stringify({
      name: fileName,
      parents: [targetFolderId],
    });

    const boundary = `---boundary${Date.now()}`;
    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    const bodyPart = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${fileData.type || "application/octet-stream"}\r\nContent-Transfer-Encoding: binary\r\n\r\n`
    );

    const ending = new TextEncoder().encode(`\r\n--${boundary}--`);
    const fullBody = new Uint8Array(bodyPart.length + fileBytes.length + ending.length);
    fullBody.set(bodyPart, 0);
    fullBody.set(fileBytes, bodyPart.length);
    fullBody.set(ending, bodyPart.length + fileBytes.length);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true",
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
      throw new Error(`Google Drive upload failed [${uploadRes.status}]: ${errText}`);
    }

    const driveFile: GoogleDriveUploadResult = await uploadRes.json();

    // Step 6: Transfer ownership when on Shared Drive (optional)
    if (config.ownerEmail && driveFile.id && isSharedDriveFolder) {
      try {
        const permRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions?supportsAllDrives=true&transferOwnership=true`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              role: "owner",
              type: "user",
              emailAddress: config.ownerEmail,
            }),
          }
        );

        if (!permRes.ok) {
          console.warn("Ownership transfer failed:", await permRes.text());
        }
      } catch (permErr) {
        console.warn("Error transferring ownership:", permErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        driveFileId: driveFile.id,
        driveFileName: driveFile.name,
        driveLink: driveFile.webViewLink,
        mode: isSharedDriveFolder ? "shared-drive" : shouldUseDelegation ? "delegated-owner" : "service-account",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in upload-to-drive:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
