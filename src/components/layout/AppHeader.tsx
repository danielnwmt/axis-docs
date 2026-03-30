import { Search, Bell, Mail, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

export function AppHeader() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";
  const { user } = useAuth();
  const email = user?.email ?? "";
  const initials = email
    .split("@")[0]
    .split(/[._-]/)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <header className="flex items-center justify-between h-16 px-6 bg-card border-b border-border">
      {/* Search */}
      {isDashboard ? (
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar documentos..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right */}
      <div className="flex items-center gap-3 ml-6">
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <Bell className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <Mail className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <Settings className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 ml-2 pl-4 border-l border-border">
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground leading-tight">{email}</p>
            <p className="text-xs text-muted-foreground">Administrador</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
