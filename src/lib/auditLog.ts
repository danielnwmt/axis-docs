import { supabase } from "@/integrations/supabase/client";

export type AuditActionType = "upload" | "view" | "download" | "edit" | "delete" | "sign" | "login" | "ocr";

export async function logAudit(
  action: string,
  actionType: AuditActionType,
  target: string = "",
  details?: string
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc("insert_audit_log", {
      _action: action,
      _action_type: actionType,
      _target: target,
      _details: details || null,
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
