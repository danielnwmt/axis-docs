import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, SupportedLanguage, setAppLanguage } from "@/i18n";

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const handleChange = async (lang: SupportedLanguage) => {
    setAppLanguage(lang);
    if (user?.id) {
      await supabase.from("profiles").update({ language: lang }).eq("id", user.id);
    }
  };

  const current = (i18n.resolvedLanguage || i18n.language) as SupportedLanguage;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
        title={t("common.language")}
      >
        <Globe className="w-5 h-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => handleChange(lang)}
            className={current === lang ? "bg-secondary font-medium" : ""}
          >
            {t(`languages.${lang}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
