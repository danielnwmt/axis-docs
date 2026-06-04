import { supabase } from "@/integrations/supabase/client";

export interface StorageQuota {
  limitBytes: number;
  usedBytes: number;
  remainingBytes: number;
  percent: number;
  level: "ok" | "warn" | "full";
  hasLimit: boolean;
}

const GB = 1024 ** 3;

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

export async function getStorageQuota(): Promise<StorageQuota> {
  const { data: rows } = await (supabase as any).rpc("get_license_status_public");
  const cfg = Array.isArray(rows) ? rows[0] : rows;

  const limitGb = Number(cfg?.storage_limit_gb || 0);
  const limitBytes = limitGb > 0 ? Math.floor(limitGb * GB) : 0;

  // Compute live usage from the Drive root folder
  let usedBytes = Number(cfg?.storage_used_bytes || 0);
  try {
    const { data, error } = await supabase.functions.invoke("get-drive-usage");
    if (!error && data && typeof data.usedBytes === "number") {
      usedBytes = data.usedBytes;
    }
  } catch {}

  const remainingBytes = limitBytes > 0 ? Math.max(0, limitBytes - usedBytes) : 0;
  const percent = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
  const level: StorageQuota["level"] =
    !limitBytes ? "ok" : percent >= 100 ? "full" : percent >= 80 ? "warn" : "ok";

  return { limitBytes, usedBytes, remainingBytes, percent, level, hasLimit: limitBytes > 0 };
}
