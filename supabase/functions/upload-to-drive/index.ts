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
  parents?: string[];
}

interface GoogleDriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
}

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      message?: string;
      domain?: string;
      reason?: string;
    }>;
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
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(
      `Não foi possível validar a pasta raiz do Google Drive [${response.status}]: ${await response.text()}`
    );
  }

  return await response.json();
}

async function findFolder(
  accessToken: string,
  folderName: string,
  parentId: string
): Promise<string | null> {
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

  return null;
}

async function createFolder(
  accessToken: string,
  folderName: string,
  parentId: string
): Promise<string> {
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

function parseGoogleApiError(errorText: string): GoogleApiErrorPayload | null {
  try {
    return JSON.parse(errorText) as GoogleApiErrorPayload;
  } catch {
    return null;
  }
}

function hasQuotaExceededError(payload: GoogleApiErrorPayload | null): boolean {
  return payload?.error?.errors?.some((item) => item.reason === "storageQuotaExceeded") ?? false;
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

    const accessToken = await getAccessToken(config.serviceAccount);
    console.log("Access token obtained successfully");

    const rootFolderInfo = await getFolderInfo(accessToken, rootFolderId);
    console.log(
      `Root folder validated: ${rootFolderInfo.id} (${rootFolderInfo.name ?? "sem nome"})`
    );

    const { data: fileData, error: fileError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (fileError || !fileData) {
      return new Response(
        JSON.stringify({ error: `Erro ao baixar arquivo: ${fileError?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`File downloaded from storage: ${fileName}, size: ${fileData.size}, type: ${fileData.type}`);

    let targetFolderId = rootFolderId;

    if (unitName) {
      const existingUnitFolderId = await findFolder(accessToken, unitName, rootFolderId);

      if (existingUnitFolderId) {
        targetFolderId = existingUnitFolderId;
        console.log(
          `Target folder resolved from existing folder: ${targetFolderId} (unit: ${unitName})`
        );
      } else {
        targetFolderId = await createFolder(accessToken, unitName, rootFolderId);
        console.log(`Target folder created: ${targetFolderId} (unit: ${unitName}, parent: ${rootFolderId})`);
      }
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    const mimeType = fileData.type || "application/octet-stream";
    const metadataObj = {
      name: fileName,
      parents: [targetFolderId],
    };

    console.log(
      `Preparing upload: ${fileBytes.length} bytes, mime: ${mimeType}, root folder: ${rootFolderId}, target folder: ${targetFolderId}`
    );

    const metadata = JSON.stringify(metadataObj);
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
      const parsedError = parseGoogleApiError(errText);

      console.error(
        "Google Drive upload error:",
        JSON.stringify(
          {
            status: uploadRes.status,
            statusText: uploadRes.statusText,
            fileName,
            filePath,
            unitName: unitName ?? null,
            rootFolderId,
             rootFolderName: rootFolderInfo.name ?? null,
            targetFolderId,
            parents: metadataObj.parents,
            googleError: parsedError ?? errText,
          },
          null,
          2
        )
      );

      if (hasQuotaExceededError(parsedError)) {
        return new Response(
          JSON.stringify({
            error:
              "O Google Drive recusou o upload por cota da Service Account.",
            details: {
              rootFolderId,
              rootFolderName: rootFolderInfo.name ?? null,
              targetFolderId,
              parents: metadataObj.parents,
              googleError: parsedError,
            },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Google Drive upload failed [${uploadRes.status}]: ${errText}`);
    }

    const driveFile: GoogleDriveUploadResult = await uploadRes.json();
    console.log(`Upload successful - File ID: ${driveFile.id}, Name: ${driveFile.name}, Link: ${driveFile.webViewLink}`);

    const ownershipTransferEmail = config.ownerEmail?.trim() || "testeprotenexus@gmail.com";

    if (ownershipTransferEmail && driveFile.id) {
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
              emailAddress: ownershipTransferEmail,
            }),
          }
        );

        if (!permRes.ok) {
          const permErrText = await permRes.text();
          console.error(
            "Google Drive ownership transfer failed:",
            JSON.stringify(
              {
                status: permRes.status,
                statusText: permRes.statusText,
                fileId: driveFile.id,
                emailAddress: ownershipTransferEmail,
                googleError: parseGoogleApiError(permErrText) ?? permErrText,
              },
              null,
              2
            )
          );
          throw new Error(`Google Drive ownership transfer failed [${permRes.status}]: ${permErrText}`);
        } else {
          console.log(`File ownership transferred to ${ownershipTransferEmail}`);
        }
      } catch (permErr) {
        console.error("Error transferring file ownership:", permErr);
        throw permErr;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        driveFileId: driveFile.id,
        driveFileName: driveFile.name,
        driveLink: driveFile.webViewLink,
        mode: "service-account",
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
