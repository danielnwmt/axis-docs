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
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/system-version`;
    const res = await fetch(url, { cache: "no-store" });
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
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, message: "Sessão expirada. Faça login novamente." };

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/system-update`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 404) {
      return { ok: false, message: "Atualização disponível apenas na instalação local (servidor Ubuntu)." };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: data?.message || data?.error || `Erro ${res.status} ao iniciar atualização.` };
    }
    return { ok: true, ...data };
  } catch {
    return { ok: false, message: "Atualização disponível apenas na instalação local (servidor Ubuntu)." };
  }
}

export type SystemUpdateStatus = {
  ok: boolean;
  watcher_alive?: boolean;
  status?: string | null;
  last_request?: string | null;
  log_tail?: string | null;
  message?: string;
};

export async function fetchSystemUpdateStatus(): Promise<SystemUpdateStatus> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, message: "Sessão expirada." };
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/system-update-status`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: `Erro ${res.status}` };
    return await res.json();
  } catch {
    return { ok: false, message: "Status disponível apenas na instalação local." };
  }
}
