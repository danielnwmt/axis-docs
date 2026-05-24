import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LicenseGate } from "@/components/LicenseGate";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-access-check", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("must_change_password, active")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Checa nível de garantia de autenticação (MFA)
  const { data: aal, isLoading: aalLoading } = useQuery({
    queryKey: ["mfa-aal", user?.id],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return data;
    },
    enabled: !!user,
    staleTime: 0,
  });

  const isInactive = !!profile && profile.active === false;

  useEffect(() => {
    if (isInactive) {
      toast({
        title: "Acesso bloqueado",
        description: "Seu usuário está inativo. Contate o administrador.",
        variant: "destructive",
      });
      signOut();
    }
  }, [isInactive, signOut]);

  if (loading || (user && (profileLoading || aalLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || isInactive) {
    return <Navigate to="/login" replace />;
  }

  // Se o usuário tem fator MFA verificado mas a sessão ainda é aal1, força verificação
  if (
    aal?.currentLevel === "aal1" &&
    aal?.nextLevel === "aal2" &&
    location.pathname !== "/mfa-verify"
  ) {
    return <Navigate to="/mfa-verify" replace />;
  }

  if (
    profile?.must_change_password &&
    location.pathname !== "/change-password"
  ) {
    return <Navigate to="/change-password" replace />;
  }

  return <LicenseGate>{children}</LicenseGate>;
}
