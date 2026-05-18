import { 
  LayoutDashboard, FileText, Upload, ScanText, Search, PenTool, Shield, Users, Settings, HelpCircle, LogOut, ShieldCheck, Scale
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";


const navItemsBase = [
  { icon: LayoutDashboard, key: "dashboard", path: "/" },
  { icon: FileText, key: "documents", path: "/documents" },
  { icon: Upload, key: "upload", path: "/upload" },
  { icon: ScanText, key: "scanner", path: "/scanner" },
  { icon: Search, key: "search", path: "/search" },
  { icon: PenTool, key: "signature", path: "/signature" },
  { icon: Shield, key: "audit", path: "/audit" },
  { icon: Users, key: "users", path: "/users" },
  { icon: ShieldCheck, key: "mydata", path: "/meus-dados" },
  { icon: Settings, key: "settings", path: "/settings" },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside className="flex flex-col w-[260px] min-h-screen bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-6 py-6">
        <h1 className="font-display tracking-tight flex items-baseline gap-1.5">
          <span className="text-2xl font-bold bg-gradient-to-r from-[hsl(195,80%,50%)] to-[hsl(215,70%,55%)] bg-clip-text text-transparent">AXIS</span>
          <span className="font-light text-info/80 text-base">DOCS</span>
        </h1>
        <p className="text-[10px] leading-tight text-sidebar-muted mt-1">
          Gestão inteligente de<br />Documentos e informações
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItemsBase.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              <span>{t(`nav.${item.key}`)}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-1">
        <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
          <HelpCircle className="w-[18px] h-[18px]" />
          <span>{t("nav.help")}</span>
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>{t("nav.logout")}</span>
        </button>
        <div className="flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg bg-sidebar-accent">
          <div className="w-8 h-8 rounded-full bg-info flex items-center justify-center text-info-foreground text-xs font-bold">
            {user?.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-primary truncate">{user?.email || "Usuário"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
