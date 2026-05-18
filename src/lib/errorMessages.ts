import i18n from "@/i18n";

// Maps known backend/Supabase error messages to translation keys.
const PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /row-level security|violates row-level/i, key: "errors.rls" },
  { re: /duplicate key|already exists|unique constraint/i, key: "errors.duplicate" },
  { re: /permission denied|not authorized|forbidden/i, key: "errors.forbidden" },
  { re: /jwt|invalid token|not authenticated|auth session/i, key: "errors.auth" },
  { re: /network|failed to fetch|timeout|timed out/i, key: "errors.network" },
  { re: /payload too large|file size|too large/i, key: "errors.tooLarge" },
  { re: /not found|no rows|0 rows/i, key: "errors.notFound" },
  { re: /storage quota|quota exceeded/i, key: "errors.quota" },
  { re: /invalid input|invalid value|check constraint/i, key: "errors.invalid" },
];

export function translateError(message?: string | null): string {
  const fallback = message || i18n.t("errors.generic");
  if (!message) return fallback;
  for (const { re, key } of PATTERNS) {
    if (re.test(message)) {
      const translated = i18n.t(key);
      if (translated && translated !== key) return translated;
    }
  }
  return fallback;
}
