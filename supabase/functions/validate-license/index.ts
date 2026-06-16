import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LICENSE_CHECK_PATH = "/api/public/license/check";

function normalizeLicenseServerUrl(serverUrl: string) {
  let trimmed = String(serverUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  trimmed = trimmed
    .replace(/\/ap\/public\/license\/check$/i, LICENSE_CHECK_PATH)
    .replace(/\/api\/public\/licence\/check$/i, LICENSE_CHECK_PATH)
    .replace(/\/api\/public\/license\/chek$/i, LICENSE_CHECK_PATH);

  try {
    const url = new URL(trimmed);
    if (url.pathname === "" || url.pathname === "/" || url.pathname === "/admin") {
      return `${url.origin}${LICENSE_CHECK_PATH}`;
    }
    if (/\/(ap|api)\/public\/licen[cs]e/i.test(url.pathname) && url.pathname !== LICENSE_CHECK_PATH) {
      return `${url.origin}${LICENSE_CHECK_PATH}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Admin-only: license details and writes are restricted to Administrador role
    const { data: profile } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || profile.role !== "Administrador" || !profile.active) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem validar a licença" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // load config (singleton)
    const { data: config } = await admin
      .from("license_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Desbloqueio temporário mantém o sistema "active", mas seguimos consultando o servidor
    // para atualizar customer_name, cpf_cnpj, expires_at, storage etc.
    const tempUnlockActive = !!(config?.temp_unlock_until && new Date(config.temp_unlock_until).getTime() > Date.now());



    if (!config || !config.server_url || !config.license_key) {
      return new Response(
        JSON.stringify({
          status: "inactive",
          message: "Licença não configurada. Cadastre a URL do servidor e a chave.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // call external license server (contract: getlicence.lovable.app)
    let serverStatus = "unreachable";
    let serverData: any = {};
    let errorMessage = "";

    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 10000);
      const licenseServerUrl = normalizeLicenseServerUrl(config.server_url);
      let resp = await fetch(licenseServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          license_key: config.license_key,
          hostname: config.hardware_id || "axisdocs",
        }),
        signal: ctrl.signal,
        redirect: "manual",
      });
      // Se o servidor responder com redirect, seguimos manualmente preservando
      // o host original (evita que o destino reescreva o path concatenando o host).
      if ([301, 302, 307, 308].includes(resp.status)) {
        const loc = resp.headers.get("location");
        if (loc) {
          try {
            const origUrl = new URL(licenseServerUrl);
            const redirected = new URL(loc, licenseServerUrl);
            // Reusa o host configurado no painel, mas adota o path/redirect retornado.
            const forced = new URL(redirected.pathname + redirected.search, origUrl.origin);
            resp = await fetch(forced.toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({
                license_key: config.license_key,
                hostname: config.hardware_id || "axisdocs",
              }),
              signal: ctrl.signal,
              redirect: "manual",
            });
          } catch {}
        }
      }
      clearTimeout(timeoutId);
      serverData = await resp.json().catch(() => ({}));

      // Map API contract: { ok, status, expires_at, blocked, expired, storage, reason }
      const apiStatus = String(serverData.status || "").toLowerCase();
      if (serverData.ok === true || apiStatus === "active" || apiStatus === "ok") {
        serverStatus = "active";
      } else if (serverData.blocked === true || apiStatus === "blocked" || apiStatus === "cancelled") {
        serverStatus = "blocked";
      } else if (serverData.expired === true || apiStatus === "expired") {
        serverStatus = "expired";
      } else if (apiStatus === "invalid" || resp.status === 404 || resp.status === 400) {
        serverStatus = "invalid";
      } else if (apiStatus === "pending") {
        serverStatus = "inactive";
      } else {
        serverStatus = resp.ok ? "active" : "blocked";
      }
    } catch (e: any) {
      errorMessage = `Servidor de licença inacessível: ${e?.message || e}`;
      // Grace mode: if previously active and within last 7 days, keep active
      if (config.status === "active" && config.last_check) {
        const daysSince = (Date.now() - new Date(config.last_check).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          serverStatus = "active";
          errorMessage += " (modo offline tolerante - até 7 dias)";
        } else {
          serverStatus = "blocked";
        }
      } else {
        serverStatus = "blocked";
      }
    }

    // Parse storage limit from various API shapes
    // Supports: { storage_limit_gb: 100 } | { storage_gb: 100 } | { storage: 100 }
    //          | { storage: { amount: 500, unit: "GB" } }
    function toGb(amount: number, unit: string): number {
      if (!amount) return 0;
      switch (String(unit || "GB").toUpperCase()) {
        case "TB": return amount * 1024;
        case "GB": return amount;
        case "MB": return amount / 1024;
        case "KB": return amount / (1024 * 1024);
        default: return amount;
      }
    }
    function parseStorageGb(input: any): number {
      if (input == null) return 0;
      if (typeof input === "number") return input;
      if (typeof input === "string") return Number(input) || 0;
      if (typeof input === "object") {
        const unit = input.unit ?? input.units ?? "GB";
        // 1. Consolidated total field (highest priority)
        const totalRaw = input.total ?? input.total_amount ?? input.total_gb;
        if (totalRaw != null) {
          return toGb(Number(totalRaw) || 0, input.total_unit ?? unit);
        }
        // 2. If "amount" is present, treat it as the already-consolidated total
        //    (the API returns amount = base_amount + extra_amount).
        if (input.amount != null || input.value != null || input.size != null) {
          return toGb(Number(input.amount ?? input.value ?? input.size) || 0, unit);
        }
        // 3. Fallback: explicit base + extra split (no consolidated amount provided)
        const base = toGb(Number(input.base_amount ?? input.base ?? input.base_gb ?? 0), input.base_unit ?? unit);
        const extraRaw =
          input.extra ?? input.extra_amount ?? input.extra_gb ??
          input.addon ?? input.addon_amount ?? input.addon_gb ??
          input.additional ?? input.additional_amount ?? 0;
        let extra = 0;
        if (typeof extraRaw === "object" && extraRaw !== null) {
          extra = toGb(Number(extraRaw.amount ?? extraRaw.value ?? 0), extraRaw.unit ?? "GB");
        } else {
          extra = toGb(Number(extraRaw) || 0, input.extra_unit ?? unit);
        }
        return base + extra;
      }
      return 0;
    }
    const storageLimitGb =
      parseStorageGb(serverData.storage_limit_gb) ||
      parseStorageGb(serverData.storage_gb) ||
      parseStorageGb(serverData.storage) ||
      0;

    // Compute current storage usage: prefer Google Drive (real total), fallback to documents table
    let storageUsedBytes = 0;
    let driveOk = false;
    try {
      const { data: cfgFile } = await admin.storage.from("settings").download("google-drive-config.json");
      if (cfgFile) {
        const driveCfg: any = JSON.parse(await cfgFile.text());
        const rootInput = String(driveCfg.rootFolderId || "");
        const fm = rootInput.match(/folders\/([a-zA-Z0-9_-]+)/);
        const rootId = fm ? fm[1] : rootInput.trim();
        const sa = driveCfg.serviceAccount;
        if (rootId && sa?.client_email && sa?.private_key && sa?.token_uri) {
          const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          const b64uBuf = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          const nowSec = Math.floor(Date.now() / 1000);
          const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
          const payload = b64u(JSON.stringify({
            iss: sa.client_email,
            scope: "https://www.googleapis.com/auth/drive.readonly",
            aud: sa.token_uri,
            iat: nowSec,
            exp: nowSec + 3600,
          }));
          const pem = String(sa.private_key).replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
          const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
          const key = await crypto.subtle.importKey("pkcs8", bin, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
          const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
          const jwt = `${header}.${payload}.${b64uBuf(sig)}`;
          const tokRes = await fetch(sa.token_uri, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
          });
          if (tokRes.ok) {
            const accessToken = (await tokRes.json()).access_token;
            const FOLDER_MIME = "application/vnd.google-apps.folder";
            const stack: string[] = [rootId];
            let total = 0;
            while (stack.length) {
              const current = stack.pop()!;
              let pageToken: string | undefined;
              do {
                const url = new URL("https://www.googleapis.com/drive/v3/files");
                url.searchParams.set("q", `'${current}' in parents and trashed=false`);
                url.searchParams.set("fields", "nextPageToken, files(id,mimeType,size,quotaBytesUsed)");
                url.searchParams.set("pageSize", "1000");
                url.searchParams.set("supportsAllDrives", "true");
                url.searchParams.set("includeItemsFromAllDrives", "true");
                url.searchParams.set("corpora", "allDrives");
                if (pageToken) url.searchParams.set("pageToken", pageToken);
                const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
                if (!res.ok) break;
                const data = await res.json();
                for (const f of (data.files || [])) {
                  if (f.mimeType === FOLDER_MIME) stack.push(f.id);
                  else total += Number(f.quotaBytesUsed || f.size || 0);
                }
                pageToken = data.nextPageToken;
              } while (pageToken);
            }
            storageUsedBytes = total;
            driveOk = true;
          }
        }
      }
    } catch {}
    if (!driveOk) {
      try {
        const { data: docs } = await admin.from("documents").select("file_size");
        storageUsedBytes = (docs || []).reduce((sum: number, d: any) => sum + (Number(d.file_size) || 0), 0);
      } catch {}
    }

    // Extrai cpf/cnpj e nome de várias formas que o servidor pode retornar
    const cust = (typeof serverData.customer === "object" && serverData.customer) ? serverData.customer : {};
    const rawCpfCnpj = String(
      serverData.cpf_cnpj ?? serverData.cpfCnpj ?? serverData.cpf ?? serverData.cnpj ??
      cust.cpf_cnpj ?? cust.cpfCnpj ?? cust.cpf ?? cust.cnpj ?? ""
    ).replace(/\D/g, "");
    const rawName = String(
      serverData.customer_name ?? serverData.customerName ?? serverData.full_name ?? serverData.name ??
      (typeof serverData.customer === "string" ? serverData.customer : "") ??
      cust.full_name ?? cust.name ?? ""
    ).trim();

    // Preserva cpf_cnpj anterior se o servidor não retornar
    let prevParsed: any = {};
    try { prevParsed = JSON.parse(config.customer_name || "{}"); } catch {}
    const finalCpfCnpj = rawCpfCnpj || String(prevParsed?.cpf_cnpj || "").replace(/\D/g, "");
    const finalName = rawName || prevParsed?.full_name || prevParsed?.name || "";

    const customerJson = (finalCpfCnpj || finalName)
      ? JSON.stringify({ cpf_cnpj: finalCpfCnpj, full_name: finalName })
      : (config.customer_name || "");

    // Se a licença está ativa no servidor, limpa o desbloqueio temporário (não é mais necessário)
    const licenseTrulyActive = serverStatus === "active";
    const showTempUnlock = tempUnlockActive && !licenseTrulyActive;
    const effectiveStatus = showTempUnlock ? "active" : serverStatus;
    const effectiveMessage = showTempUnlock
      ? `Desbloqueio temporário ativo até ${new Date(config.temp_unlock_until).toLocaleString("pt-BR")}`
      : (serverData.reason || serverData.message || errorMessage || "");

    const updates: Record<string, any> = {
      status: effectiveStatus,
      last_check: new Date().toISOString(),
      server_url: normalizeLicenseServerUrl(config.server_url),
      message: effectiveMessage,
      customer_name: customerJson,
      expires_at: serverData.expires_at || serverData.expiresAt || config.expires_at,
      storage_limit_gb: storageLimitGb || config.storage_limit_gb || 0,
      storage_used_bytes: storageUsedBytes,
      updated_at: new Date().toISOString(),
      updated_by: userData.user.id,
    };

    // Limpa desbloqueio temporário quando licença já está ativa no servidor
    if (licenseTrulyActive && tempUnlockActive) {
      updates.temp_unlock_until = null;
    }

    await admin.from("license_config").update(updates).eq("id", config.id);

    return new Response(
      JSON.stringify({
        status: effectiveStatus,
        customer_name: updates.customer_name,
        expires_at: updates.expires_at,
        message: updates.message,
        last_check: updates.last_check,
        storage_limit_gb: updates.storage_limit_gb,
        storage_used_bytes: updates.storage_used_bytes,
        temp_unlock_until: showTempUnlock ? config.temp_unlock_until : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("validate-license error:", error);
    return new Response(JSON.stringify({ error: "Erro interno. Contate o administrador." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
