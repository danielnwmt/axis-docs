// Helpers multi-tenant: resolve a organização do usuário e carrega a
// configuração do Google Drive específica dela.
// Caminho novo: settings/orgs/<org_id>/google-drive-config.json
// Fallback legado: settings/google-drive-config.json

export async function resolveOrgId(admin: any, userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
  return data?.org_id ?? null;
}

export function orgDriveConfigPath(orgId: string | null | undefined): string {
  return orgId ? `orgs/${orgId}/google-drive-config.json` : "google-drive-config.json";
}

export async function downloadOrgDriveConfig(admin: any, orgId: string | null | undefined): Promise<any | null> {
  if (orgId) {
    const { data } = await admin.storage.from("settings").download(orgDriveConfigPath(orgId));
    if (data) {
      try {
        return JSON.parse(await data.text());
      } catch {
        return null;
      }
    }
  }
  // Fallback: instalação anterior de tenant único
  const { data: legacy } = await admin.storage.from("settings").download("google-drive-config.json");
  if (!legacy) return null;
  try {
    return JSON.parse(await legacy.text());
  } catch {
    return null;
  }
}

export async function loadDriveConfigForUser(admin: any, userId: string): Promise<any | null> {
  const orgId = await resolveOrgId(admin, userId);
  return downloadOrgDriveConfig(admin, orgId);
}
