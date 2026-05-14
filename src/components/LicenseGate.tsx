import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  validateLicense,
  getCachedLicense,
  shouldRevalidate,
  loadLicenseConfig,
  saveLicenseConfig,
  unlockTemporary,
  clearLicenseCache,
  type LicenseInfo,
} from "@/lib/license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ShieldAlert, KeyRound, RefreshCw, Save, Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";

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

  const refresh = async () => {
    setChecking(true);
    try {
      const res = await validateLicense();
      setInfo(res);
    } finally {
      setChecking(false);
    }
  };

  if (!isActive && !isExempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-2xl w-full bg-card border border-border rounded-2xl shadow-lg p-8">
          <div className="text-center">
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
                "Esta instalação do AxisDocs não possui licença ativa."}
            </p>
          </div>

          <AdminLicenseForm onChanged={refresh} />

          <div className="flex flex-col sm:flex-row gap-2 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/settings")}>
              <SettingsIcon className="w-4 h-4 mr-2" /> Ir para Configurações
            </Button>
            <Button variant="outline" className="flex-1" disabled={checking} onClick={refresh}>
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

function AdminLicenseForm({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [serverUrl, setServerUrl] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await loadLicenseConfig();
        if (c) {
          setServerUrl(c.server_url || "");
          setLicenseKey(c.license_key || "");
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!serverUrl.trim() || !licenseKey.trim()) {
      toast({ title: "Preencha URL e chave", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveLicenseConfig(serverUrl.trim(), licenseKey.trim());
      clearLicenseCache();
      toast({ title: "Configuração salva. Validando..." });
      const res = await validateLicense();
      if (res.status === "active") {
        toast({ title: "Licença ativa", description: res.customer_name || "Validação concluída." });
      } else {
        toast({
          title: `Status: ${res.status}`,
          description: res.message || "Verifique a chave e o servidor.",
          variant: "destructive",
        });
      }
      await onChanged();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!unlockCode.trim()) {
      toast({ title: "Informe o código de desbloqueio", variant: "destructive" });
      return;
    }
    setUnlocking(true);
    try {
      const res = await unlockTemporary(unlockCode.trim());
      if (res.ok) {
        clearLicenseCache();
        setUnlockCode("");
        toast({
          title: "Sistema desbloqueado",
          description: res.valid_until
            ? `Válido até ${new Date(res.valid_until).toLocaleString("pt-BR")}`
            : "Desbloqueio temporário ativado por 24h.",
        });
        await onChanged();
      } else {
        toast({ title: "Código inválido", description: res.message || "Verifique e tente novamente.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Falha no desbloqueio", description: e.message, variant: "destructive" });
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="space-y-5 border-t border-border pt-5">
      {/* Ativação */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Ativar licença</h3>
        <div className="space-y-1">
          <Label className="text-xs">URL do servidor de licenças</Label>
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://licencas.suaempresa.com/api/validar"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chave de licença</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="AXIS-XXXX-XXXX-XXXX"
              className="pr-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar e ativar"}
        </Button>
      </div>

      {/* Desbloqueio temporário */}
      <div className="space-y-2 rounded-lg bg-muted/30 border border-border p-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Desbloqueio temporário (24h)</h3>
          <p className="text-xs text-muted-foreground">
            Use o código fornecido pelo suporte para liberar o sistema por 24 horas.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={unlockCode}
            onChange={(e) => setUnlockCode(e.target.value)}
            placeholder="Código de desbloqueio"
            className="font-mono"
          />
          <Button onClick={handleUnlock} disabled={unlocking || !unlockCode.trim()} variant="secondary">
            <KeyRound className="w-4 h-4 mr-2" />
            {unlocking ? "..." : "Desbloquear"}
          </Button>
        </div>
      </div>
    </div>
  );
}
