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
    const res = await fetch("/api/system/version", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return { version: APP_VERSION, ...data };
    }
  } catch {
    // endpoint só existe no install local
  }
  return { version: APP_VERSION };
}

export async function triggerSystemUpdate(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/system/update", { method: "POST" });
    if (res.status === 404) {
      return { ok: false, message: "Atualização disponível apenas na instalação local (servidor Ubuntu)." };
    }
    if (!res.ok) {
      return { ok: false, message: `Erro ${res.status} ao iniciar atualização.` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, ...data };
  } catch (e: any) {
    return { ok: false, message: "Atualização disponível apenas na instalação local (servidor Ubuntu)." };
  }
}
