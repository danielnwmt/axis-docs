import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validateLicense, getCachedLicense, shouldRevalidate, type LicenseInfo } from "@/lib/license";
import { Button } from "@/components/ui/button";
import { ShieldAlert, KeyRound, RefreshCw } from "lucide-react";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [info, setInfo] = useState<LicenseInfo | null>(() => getCachedLicense()?.info || null);
  const [checking, setChecking] = useState(false);

  // Is current user admin?
  const { data: profile } = useQuery({
    queryKey: ["profile-role-gate", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });
  const isAdmin = profile?.role === "Administrador";

  useEffect(() => {
    if (!user) return;
    const run = async () => {
      if (!shouldRevalidate() && info) return;
      setChecking(true);
      try {
        const res = await validateLicense();
        setInfo(res);
      } catch {
        // keep cached
      } finally {
        setChecking(false);
      }
    };
    run();
    const id = window.setInterval(run, 60 * 60 * 1000); // hourly check
    return () => window.clearInterval(id);
  }, [user]);

  const status = info?.status || "inactive";
  const isActive = status === "active";

  // Always allow change-password (forced) and let admins reach /settings to fix the key
  const isExempt =
    location.pathname === "/change-password" ||
    (isAdmin && location.pathname === "/settings");

  if (!isActive && !isExempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-lg w-full bg-card border border-border rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">
            {status === "blocked" && "Licença bloqueada"}
            {status === "expired" && "Licença expirada"}
            {status === "invalid" && "Licença inválida"}
            {status === "inactive" && "Licença não ativada"}
            {status === "unreachable" && "Servidor de licença indisponível"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {info?.message ||
              "Esta instalação do AxisDocs não possui licença ativa. Entre em contato com o suporte ou peça ao administrador para ativar a licença em Configurações."}
          </p>
          <div className="flex flex-col gap-2">
            {isAdmin && (
              <Button onClick={() => navigate("/settings")}>
                <KeyRound className="w-4 h-4 mr-2" /> Ir para Configurações
              </Button>
            )}
            <Button
              variant="outline"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                try {
                  const res = await validateLicense();
                  setInfo(res);
                } finally {
                  setChecking(false);
                }
              }}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${checking ? "animate-spin" : ""}`} />
              Verificar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
