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
  const trimmed = server_url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.pathname === "" || url.pathname === "/") {
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
    id = crypto.randomUUID();
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

export async function validateLicense(): Promise<LicenseInfo> {
  const { data, error } = await supabase.functions.invoke("validate-license");
  if (error) throw error;
  const info = (data || {}) as LicenseInfo;
  localStorage.setItem(CACHE_KEY, JSON.stringify({ info, t: Date.now() }));
  window.dispatchEvent(new CustomEvent("axis-license-updated", { detail: info }));
  return info;
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
