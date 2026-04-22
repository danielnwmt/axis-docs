import { supabase } from "@/integrations/supabase/client";

type AdminUserAction = "create" | "toggle" | "delete" | "reset-password";

const apiBaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const isLocalBackend = import.meta.env.VITE_SUPABASE_PROJECT_ID === "local";

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    "Content-Type": "application/json",
    apikey: publishableKey,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export async function adminUserAction<TResponse = unknown>(action: AdminUserAction, payload: Record<string, unknown>) {
  const endpoint = isLocalBackend
    ? `${apiBaseUrl}/auth/v1/admin/users?action=${encodeURIComponent(action)}`
    : `${apiBaseUrl}/functions/v1/create-user?action=${encodeURIComponent(action)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) : {};

  if (!response.ok || data?.error) {
    throw new Error(data?.error || "Não foi possível concluir a ação administrativa.");
  }

  return data as TResponse;
}

export function isLocalInstall() {
  return isLocalBackend;
}