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
}

export async function unlockTemporary(unlock_code: string): Promise<{ ok: boolean; valid_until?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke("license-temp-unlock", { body: { unlock_code } });
  if (error) {
    const msg = (error as any)?.message || "Falha no desbloqueio";
    return { ok: false, message: msg };
  }
  return data as any;

const CACHE_KEY = "axis_license_cache_v1";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

function getHardwareId(): string {
  let id = localStorage.getItem("axis_hw_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("axis_hw_id", id);
  }
  return id;
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
  const existing = await loadLicenseConfig();
  const hardware_id = getHardwareId();
  const payload = { server_url, license_key, hardware_id, status: "inactive", updated_at: new Date().toISOString() };

  if (existing?.id) {
    const { data, error } = await (supabase as any)
      .from("license_config")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await (supabase as any).from("license_config").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function validateLicense(): Promise<LicenseInfo> {
  const { data, error } = await supabase.functions.invoke("validate-license");
  if (error) throw error;
  const info = (data || {}) as LicenseInfo;
  localStorage.setItem(CACHE_KEY, JSON.stringify({ info, t: Date.now() }));
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
  return Date.now() - c.t > CHECK_INTERVAL_MS;
}

export function clearLicenseCache() {
  localStorage.removeItem(CACHE_KEY);
}
