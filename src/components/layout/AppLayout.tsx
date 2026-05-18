import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CookieBanner } from "@/components/CookieBanner";
import { Link } from "react-router-dom";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
        <footer className="border-t bg-card px-6 py-3 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} AxisDocs</span>
          <div className="flex gap-4">
            <Link to="/privacidade" className="hover:text-foreground">Política de Privacidade</Link>
            <Link to="/termos" className="hover:text-foreground">Termos de Uso</Link>
            <Link to="/meus-dados" className="hover:text-foreground">Meus Dados (LGPD)</Link>
          </div>
        </footer>
      </div>
      <CookieBanner />
    </div>
  );
}
