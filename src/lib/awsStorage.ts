import { supabase } from "@/integrations/supabase/client";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
  return { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error("VITE_API_URL não configurada.");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Erro HTTP ${response.status}`);
  return body as T;
}

export async function uploadFileToS3(file: File, metadata: { category?: string; unit?: string }) {
  const presign = await api<{ uploadUrl: string; objectKey: string; bucket: string }>("/v1/storage/upload-url", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, ...metadata }),
  });
  const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!upload.ok) throw new Error("Falha ao enviar arquivo ao Amazon S3.");
  await api("/v1/storage/confirm", { method: "POST", body: JSON.stringify({ objectKey: presign.objectKey, fileSize: file.size }) });
  return presign;
}

export async function getS3FileUrl(objectKey: string, action: "view" | "download", fileName?: string) {
  return api<{ url: string }>("/v1/storage/download-url", {
    method: "POST",
    body: JSON.stringify({ objectKey, action, fileName }),
  });
}

export async function deleteS3File(objectKey: string) {
  return api<{ success: boolean }>("/v1/storage/object", { method: "DELETE", body: JSON.stringify({ objectKey }) });
}
