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

    await supabase.from("audit_logs" as any).insert({
      user_id: user.id,
      user_email: user.email || "",
      action,
      action_type: actionType,
      target,
      details: details || null,
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
