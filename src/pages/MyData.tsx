import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Download, UserX, History, ShieldCheck, FileText } from "lucide-react";
import { logAudit } from "@/lib/auditLog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

export default function MyData() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    const [r, l] = await Promise.all([
      supabase.from("data_requests").select("*").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(20),
      supabase.from("audit_logs").select("action,action_type,target,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setRequests(r.data || []);
    setLogs(l.data || []);
  };

  useEffect(() => { load(); }, [user?.id]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_data_export");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      await supabase.rpc("request_data_action", { _type: "export", _notes: "Download via portal" });
      logAudit("Exportou dados pessoais (LGPD)", "download", user?.email || "");
      toast({ title: "Dados exportados", description: "Seu arquivo JSON foi baixado." });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const requestAction = async (type: string, notes?: string) => {
    try {
      const { error } = await supabase.rpc("request_data_action", { _type: type, _notes: notes ?? null });
      if (error) throw error;
      toast({ title: "Solicitação registrada", description: "O administrador será notificado." });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-info" /> Meus Dados (LGPD)</h1>
          <p className="text-sm text-muted-foreground mt-1">Exerça seus direitos previstos no Art. 18 da Lei Geral de Proteção de Dados.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 space-y-3">
            <Download className="w-8 h-8 text-info" />
            <h3 className="font-semibold">Exportar meus dados</h3>
            <p className="text-xs text-muted-foreground">Baixe um JSON com seu perfil, documentos, consentimentos e logs.</p>
            <Button onClick={handleExport} disabled={loading} className="w-full">{loading ? "Gerando..." : "Exportar"}</Button>
          </Card>

          <Card className="p-5 space-y-3">
            <FileText className="w-8 h-8 text-info" />
            <h3 className="font-semibold">Solicitar retificação</h3>
            <p className="text-xs text-muted-foreground">Peça correção de dados incompletos ou desatualizados.</p>
            <Button variant="outline" onClick={() => requestAction("rectify", "Solicitação aberta pelo titular")} className="w-full">Solicitar</Button>
          </Card>

          <Card className="p-5 space-y-3">
            <UserX className="w-8 h-8 text-destructive" />
            <h3 className="font-semibold">Excluir minha conta</h3>
            <p className="text-xs text-muted-foreground">Anonimização conforme Art. 16. Documentos institucionais podem ser retidos por obrigação legal.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">Solicitar exclusão</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Solicitar exclusão da conta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sua solicitação será registrada e analisada por um administrador. Após processada, seu e-mail e nome serão anonimizados e o acesso será removido.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => requestAction("delete", "Solicitação de exclusão pelo titular")}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Minhas solicitações</h3>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <span className="font-medium capitalize">{r.type}</span>
                    <span className="text-muted-foreground ml-2">{new Date(r.requested_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === "completed" ? "bg-success/20 text-success" :
                    r.status === "rejected" ? "bg-destructive/20 text-destructive" :
                    "bg-warning/20 text-warning"
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Histórico de acessos</h3>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registros.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {logs.map((l, i) => (
                <div key={i} className="text-xs flex justify-between border-b py-1.5 last:border-0">
                  <span>{l.action} {l.target && <span className="text-muted-foreground">— {l.target}</span>}</span>
                  <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
