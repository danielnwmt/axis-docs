import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";

type DriveFileAction = "view" | "download";

export async function fetchDriveFileBlob(
  driveFileId: string,
  action: DriveFileAction,
  fileType?: string | null,
  auditTarget?: string,
) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-drive-file`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Accept: action === "download" ? "application/octet-stream" : fileType || "application/octet-stream",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ driveFileId, action }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  // Auditoria centralizada: registra view/download do arquivo via Drive
  void logAudit(
    action === "download" ? "Baixou arquivo" : "Visualizou arquivo",
    action,
    auditTarget || driveFileId,
  );

  return response.blob();
}
