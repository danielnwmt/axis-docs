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
  normalizeLicenseServerUrl,
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
    const onLicenseUpdated = (event: Event) => setInfo((event as CustomEvent<LicenseInfo>).detail);
    window.addEventListener("axis-license-updated", onLicenseUpdated as EventListener);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("axis-license-updated", onLicenseUpdated as EventListener);
    };
  }, [user]);

  const status = info?.status || "inactive";
  const isActive = status === "active";

  // Quando bloqueada/expirada, NADA é acessível (nem /settings) — apenas o gate é mostrado.
  // Para os demais estados (inactive/invalid/unreachable), liberamos /settings e /change-password
  // para que o admin possa cadastrar/ativar a licença.
  const isHardBlocked = status === "blocked" || status === "expired";
  const isExempt =
    !isHardBlocked &&
    (location.pathname === "/change-password" || location.pathname === "/settings");

  const refresh = async () => {
    setChecking(true);
    try {
      const res = await validateLicense();
      setInfo(res);
    } finally {
      setChecking(false);
    }
  };

  const isBlocked = status === "blocked" || status === "expired";
  const showActivationForm = !isBlocked; // inactive, invalid, unreachable → permite cadastrar/ativar

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
                (isBlocked
                  ? "Sua licença foi bloqueada por falta de pagamento ou suspensão pelo provedor. Regularize a pendência com o suporte para reativar o sistema. Você pode usar um código de desbloqueio temporário (24h) para liberar o acesso enquanto resolve."
                  : "Esta instalação do AxisDocs não possui licença ativa.")}
            </p>
          </div>

          {isBlocked && <BlockedLicenseInfo info={info} onChanged={refresh} />}

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
      await saveLicenseConfig(normalizeLicenseServerUrl(serverUrl), licenseKey.trim());
      clearLicenseCache();
      toast({ title: "Configuração salva. Validando..." });
      const res = await validateLicense();
      if (res.status === "active") {
        let desc = "Validação concluída.";
        if (res.customer_name) {
          try {
            const p = JSON.parse(res.customer_name);
            desc = p?.full_name || p?.name || p?.email || desc;
          } catch { desc = res.customer_name; }
        }
        toast({ title: "Licença ativa", description: desc });
      } else {
        toast({
          title: `Status: ${res.status}`,
          description: res.message || "Verifique a chave e o servidor.",
          variant: "destructive",
        });
      }
      await onChanged();
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.hint || JSON.stringify(e);
      const isMissing = /relation .*license_config.* does not exist|schema cache/i.test(msg);
      toast({
        title: "Erro ao salvar",
        description: isMissing
          ? "Tabela license_config não encontrada no banco local. Execute novamente o script scripts/setup-database.sql para criar a tabela."
          : msg,
        variant: "destructive",
      });
      console.error("[LicenseGate] save error", e);
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
      const res = await unlockTemporary();
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

function BlockedLicenseInfo({ info, onChanged }: { info: LicenseInfo | null; onChanged: () => Promise<void> | void }) {
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const res = await unlockTemporary();
      if (res.ok) {
        clearLicenseCache();
        toast({
          title: "Sistema desbloqueado",
          description: res.valid_until
            ? `Válido até ${new Date(res.valid_until).toLocaleString("pt-BR")}`
            : "Desbloqueio temporário ativado por 24h.",
        });
        await onChanged();
      } else {
        toast({ title: "Não foi possível desbloquear", description: res.message || "Tente novamente mais tarde.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Falha no desbloqueio", description: e.message, variant: "destructive" });
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-destructive">Acesso suspenso</h3>
        <p className="text-xs text-muted-foreground">
          Entre em contato com o suporte para regularizar o pagamento e reativar a licença.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
          {info?.customer_name && (() => {
            let label = info.customer_name;
            try {
              const p = JSON.parse(info.customer_name);
              label = p?.full_name || p?.name || p?.email || label;
            } catch { /* keep raw */ }
            return <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{label}</span></div>;
          })()}
          {info?.expires_at && (
            <div><span className="text-muted-foreground">Vencimento:</span> <span className="font-medium">{new Date(info.expires_at).toLocaleDateString("pt-BR")}</span></div>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg bg-muted/30 border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Desbloqueio temporário (24h)</h3>
          <p className="text-xs text-muted-foreground">
            Libere o sistema por 24 horas enquanto regulariza. Disponível apenas uma vez a cada 30 dias.
          </p>
        </div>
        <Button onClick={handleUnlock} disabled={unlocking} variant="secondary" className="w-full">
          <KeyRound className="w-4 h-4 mr-2" />
          {unlocking ? "Desbloqueando..." : "Desbloquear por 24 horas"}
        </Button>
      </div>
    </div>
  );
}

