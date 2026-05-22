import { supabase } from "@/integrations/supabase/client";

export type LicenseStatus = "active" | "blocked" | "expired" | "invalid" | "inactive" | "unreachable";

export interface LicenseInfo {
  status: LicenseStatus;
  customer_name?: string | null;
  expires_at?: string | null;
  message?: string | null;
  last_check?: string | null;
  server_url?: string | null;
  license_key?: string | null;
  hardware_id?: string | null;
  id?: string | null;
  temp_unlock_until?: string | null;
  last_temp_unlock_at?: string | null;
  storage_limit_gb?: number | null;
  storage_used_bytes?: number | null;
}

export async function unlockTemporary(): Promise<{ ok: boolean; valid_until?: string; message?: string; next_allowed_at?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("license-temp-unlock", { body: {} });
    if (!error) return data as any;
  } catch {
    // Instalações locais antigas podem não ter este endpoint em /functions/v1.
  }

  return unlockTemporaryDirect();
}

const CACHE_KEY = "axis_license_cache_v1";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1h
const LICENSE_CHECK_PATH = "/api/public/license/check";

export function normalizeLicenseServerUrl(server_url: string): string {
  let trimmed = server_url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  // Auto-correção de typos comuns no path
  trimmed = trimmed
    .replace(/\/ap\/public\/license\/check$/i, LICENSE_CHECK_PATH)
    .replace(/\/api\/public\/licence\/check$/i, LICENSE_CHECK_PATH)
    .replace(/\/api\/public\/license\/chek$/i, LICENSE_CHECK_PATH);

  try {
    const url = new URL(trimmed);
    if (url.pathname === "" || url.pathname === "/" || url.pathname === "/admin") {
      return `${url.origin}${LICENSE_CHECK_PATH}`;
    }
    // Se o path contém "license" mas não termina com o caminho correto, normaliza
    if (/\/(ap|api)\/public\/licen[cs]e/i.test(url.pathname) && url.pathname !== LICENSE_CHECK_PATH) {
      return `${url.origin}${LICENSE_CHECK_PATH}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function getHardwareId(): string {
  let id = localStorage.getItem("axis_hw_id");
  if (!id) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    } else {
      // Fallback para contextos não-seguros (HTTP) onde crypto.randomUUID não existe
      const rnd = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      id = `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rnd(3)}-${rnd(12)}`;
    }
    localStorage.setItem("axis_hw_id", id);
  }
  return id;
}

function cacheAndNotifyLicense(info: LicenseInfo): LicenseInfo {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ info, t: Date.now() }));
  window.dispatchEvent(new CustomEvent("axis-license-updated", { detail: info }));
  return info;
}

export async function loadLicenseConfig(): Promise<LicenseInfo | null> {
  const { data } = await (supabase as any)
    .from("license_config")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function saveLicenseConfig(server_url: string, license_key: string): Promise<LicenseInfo> {
  const hardware_id = getHardwareId();
  const normalized = normalizeLicenseServerUrl(server_url);

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  const existing = await loadLicenseConfig();
  const payload: any = {
    server_url: normalized,
    license_key,
    hardware_id,
    status: "inactive",
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  let saved: any = null;
  if (existing?.id) {
    const { data, error } = await (supabase as any)
      .from("license_config")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await (supabase as any)
      .from("license_config")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    saved = data;
  }
  return saved as LicenseInfo;
}

function parseStorageGb(input: any): number {
  if (input == null) return 0;
  if (typeof input === "number") return input;
  if (typeof input === "string") return Number(input) || 0;
  const unit = String(input.unit ?? input.units ?? "GB").toUpperCase();
  const amount = Number(input.total ?? input.total_amount ?? input.total_gb ?? input.amount ?? input.value ?? input.size ?? 0) || 0;
  if (unit === "TB") return amount * 1024;
  if (unit === "MB") return amount / 1024;
  if (unit === "KB") return amount / (1024 * 1024);
  return amount;
}

async function getStorageUsedBytes(): Promise<number> {
  const { data } = await (supabase as any).from("documents").select("file_size");
  return (data || []).reduce((sum: number, doc: any) => sum + (Number(doc.file_size) || 0), 0);
}

async function validateLicenseDirect(): Promise<LicenseInfo> {
  const config = await loadLicenseConfig();
  if (config?.temp_unlock_until && new Date(config.temp_unlock_until).getTime() > Date.now()) {
    const tempMsg = `Desbloqueio temporário ativo até ${new Date(config.temp_unlock_until).toLocaleString("pt-BR")}`;
    const nowIso = new Date().toISOString();
    if (config.id) {
      await (supabase as any).from("license_config").update({
        status: "active",
        last_check: nowIso,
        message: tempMsg,
        updated_at: nowIso,
      }).eq("id", config.id);
    }
    return cacheAndNotifyLicense({
      ...config,
      status: "active",
      last_check: nowIso,
      message: tempMsg,
    });
  }

  if (!config?.id || !config.server_url || !config.license_key) {
    return cacheAndNotifyLicense({ status: "inactive", message: "Licença não configurada. Cadastre a URL do servidor e a chave." });
  }

  let status: LicenseStatus = "unreachable";
  let serverData: any = {};
  let message = "";
  try {
    const ctrl = new AbortController();
    const timeoutId = window.setTimeout(() => ctrl.abort(), 10000);
    // Aceita qualquer domínio. Em instalações locais sem edge functions, usa proxy
    // Nginx genérico (/license-proxy/<host>/<path>) para evitar CORS.
    const targetUrl = normalizeLicenseServerUrl(config.server_url);
    const isLovableCloud = typeof window !== "undefined" && /\.lovable(project)?\.app$/.test(window.location.hostname);
    let finalUrl = targetUrl;
    if (!isLovableCloud) {
      try {
        const u = new URL(targetUrl);
        finalUrl = `${window.location.origin}/license-proxy/${u.host}${u.pathname}${u.search}`;
      } catch {
        finalUrl = targetUrl;
      }
    }
    const resp = await fetch(finalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: config.license_key, hostname: config.hardware_id || "axisdocs" }),
      signal: ctrl.signal,
    });
    window.clearTimeout(timeoutId);
    serverData = await resp.json().catch(() => ({}));
    const apiStatus = String(serverData.status || "").toLowerCase();
    if (serverData.ok === true || apiStatus === "active" || apiStatus === "ok") status = "active";
    else if (serverData.blocked === true || apiStatus === "blocked" || apiStatus === "cancelled") status = "blocked";
    else if (serverData.expired === true || apiStatus === "expired") status = "expired";
    else if (apiStatus === "invalid" || resp.status === 404 || resp.status === 400) status = "invalid";
    else if (apiStatus === "pending") status = "inactive";
    else status = resp.ok ? "active" : "blocked";
  } catch (e: any) {
    message = `Servidor de licença inacessível: ${e?.message || e}`;
    status = config.status === "active" ? "active" : "unreachable";
  }

  const storageLimitGb = parseStorageGb(serverData.storage_limit_gb) || parseStorageGb(serverData.storage_gb) || parseStorageGb(serverData.storage) || config.storage_limit_gb || 0;
  const updates: Partial<LicenseInfo> = {
    status,
    last_check: new Date().toISOString(),
    server_url: normalizeLicenseServerUrl(config.server_url),
    message: serverData.reason || serverData.message || message || "",
    customer_name: serverData.customer_name || serverData.customer || config.customer_name || "",
    expires_at: serverData.expires_at || serverData.expiresAt || config.expires_at,
    storage_limit_gb: storageLimitGb,
    storage_used_bytes: await getStorageUsedBytes(),
  };
  const { data, error } = await (supabase as any).from("license_config").update(updates).eq("id", config.id).select().maybeSingle();
  if (error) throw error;
  return cacheAndNotifyLicense((data || { ...config, ...updates }) as LicenseInfo);
}

async function unlockTemporaryDirect(): Promise<{ ok: boolean; valid_until?: string; message?: string; next_allowed_at?: string }> {
  const config = await loadLicenseConfig();
  if (!config?.id) return { ok: false, message: "Configuração de licença não encontrada." };
  const last = config.last_temp_unlock_at ? new Date(config.last_temp_unlock_at).getTime() : 0;
  const now = Date.now();
  if (last && now - last < 30 * 24 * 60 * 60 * 1000) {
    const next = new Date(last + 30 * 24 * 60 * 60 * 1000);
    return { ok: false, message: `Desbloqueio temporário já utilizado este mês. Próximo disponível em ${next.toLocaleString("pt-BR")}.`, next_allowed_at: next.toISOString() };
  }
  const until = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await (supabase as any).from("license_config").update({
    temp_unlock_until: until,
    last_temp_unlock_at: new Date(now).toISOString(),
    message: `Desbloqueio temporário ativo até ${new Date(until).toLocaleString("pt-BR")}`,
    updated_at: new Date().toISOString(),
  }).eq("id", config.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, valid_until: until };
}

export async function validateLicense(): Promise<LicenseInfo> {
  try {
    const { data, error } = await supabase.functions.invoke("validate-license");
    if (!error) return cacheAndNotifyLicense((data || {}) as LicenseInfo);
  } catch {
    // Instalações locais antigas podem não ter este endpoint em /functions/v1.
  }

  return validateLicenseDirect();
}

export function getCachedLicense(): { info: LicenseInfo; t: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function shouldRevalidate(): boolean {
  const c = getCachedLicense();
  if (!c) return true;
  if (c.info.status !== "active") return true;
  return Date.now() - c.t > CHECK_INTERVAL_MS;
}

export function clearLicenseCache() {
  localStorage.removeItem(CACHE_KEY);
}
