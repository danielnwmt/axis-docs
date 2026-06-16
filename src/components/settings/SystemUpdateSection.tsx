import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertCircle, Server } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VERSION } from "@/lib/version";

type Status = "pending" | "processing" | "success" | "failed";

export function SystemUpdateSection() {
  const { user } = useAuth();
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const reloadTimer = useRef<number | null>(null);

  const busy = loading || status === "pending" || status === "processing";

  useEffect(() => {
    if (!updateId) return;

    // Polling a cada 3s — RLS em system_updates garante que só admins leem.
    // Não usamos Realtime para evitar inscrição em canal por usuários autorizados sem necessidade.
    const poll = window.setInterval(async () => {
      const { data } = await supabase
        .from("system_updates")
        .select("status")
        .eq("id", updateId)
        .maybeSingle();
      if (data?.status) handleStatusChange(data.status as Status);
    }, 3000);

    return () => {
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateId]);

  const handleStatusChange = (next: Status) => {
    setStatus((prev) => {
      if (prev === next) return prev;

      if (next === "success") {
        toast({ title: "Sistema atualizado com sucesso!", description: "Recarregando..." });
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => window.location.reload(), 5000);
      } else if (next === "failed") {
        toast({
          title: "Falha ao aplicar atualização na VPS",
          description: "Verifique os logs do agente de atualização no servidor.",
          variant: "destructive",
        });
        setUpdateId(null);
      }
      return next;
    });
  };

  const handleClick = async () => {
    if (!user) return;
    setLoading(true);
    setStatus(null);
    try {
      const { data, error } = await supabase
        .from("system_updates")
        .insert({ status: "pending", version: `v${APP_VERSION}`, requested_by: user.id })
        .select("id, status")
        .single();
      if (error) throw error;
      setUpdateId(data.id);
      setStatus(data.status as Status);
      toast({ title: "Solicitação enviada", description: "Aguardando resposta da VPS..." });
    } catch (e: unknown) {
      console.error("[SystemUpdate] insert error:", e);
      const err = e as { message?: string; details?: string; hint?: string; code?: string } | null;
      const msg =
        (e instanceof Error && e.message) ||
        err?.message ||
        err?.details ||
        err?.hint ||
        (err?.code ? `Código: ${err.code}` : "") ||
        (typeof e === "string" ? e : JSON.stringify(e));
      toast({ title: "Erro ao solicitar atualização", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = (() => {
    if (loading) return "Enviando solicitação...";
    if (status === "pending") return "Aguardando resposta da VPS...";
    if (status === "processing") return "Aplicando atualizações na VPS...";
    if (status === "success") return "Atualização concluída — recarregando...";
    return "Verificar e Atualizar Sistema";
  })();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Server className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold text-foreground">Atualização do Sistema</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Solicita ao agente da VPS que sincronize o código com o repositório oficial e refaça o build.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Versão Atual:</span>
          <Badge variant="secondary" className="font-mono text-sm">
            v{APP_VERSION}
          </Badge>
          {status && (
            <Badge
              variant={status === "failed" ? "destructive" : status === "success" ? "default" : "secondary"}
              className="ml-2"
            >
              {status === "pending" && "Pendente"}
              {status === "processing" && "Processando"}
              {status === "success" && "Sucesso"}
              {status === "failed" && "Falhou"}
            </Badge>
          )}
        </div>

        <Button
          size="lg"
          onClick={handleClick}
          disabled={busy}
          className="w-full gap-2 h-12 text-base"
        >
          {status === "success" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : status === "failed" ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <RefreshCw className={`w-5 h-5 ${busy ? "animate-spin" : ""}`} />
          )}
          {buttonLabel}
        </Button>

        <p className="text-xs text-muted-foreground">
          O agente local da VPS monitora a tabela <code className="font-mono">system_updates</code> e executa{" "}
          <code className="font-mono">git pull</code> + rebuild ao detectar um registro pendente.
        </p>
      </div>
    </div>
  );
}
