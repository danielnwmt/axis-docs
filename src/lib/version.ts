import { supabase } from "@/integrations/supabase/client";

export const APP_VERSION = "1.0.0";
export const APP_REPO = "https://github.com/danielnwmt/axis-docs";
export const APP_BRANCH = "main";

export type SystemVersionInfo = {
  version: string;
  commit?: string;
  built_at?: string;
};

export async function fetchSystemVersion(): Promise<SystemVersionInfo> {
  try {
    const { data } = await supabase.functions.invoke("system-version", { method: "GET" as any });
    if (data && typeof data === "object") {
      return { version: APP_VERSION, ...(data as any) };
    }
  } catch {
    // ignore — endpoint só existe no install local
  }
  return { version: APP_VERSION };
}

export async function triggerSystemUpdate(): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabase.functions.invoke("system-update", { body: {} });
  if (error) return { ok: false, message: error.message };
  return data as any;
}
