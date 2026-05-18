import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Shield, UserCog, Trash2, AlertTriangle, FileWarning } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

export default function LgpdAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [dpo, setDpo] = useState({ id: "", name: "", email: "", phone: "", privacy_policy_version: "1.0", terms_version: "1.0" });
  const [requests, setRequests] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [newPolicy, setNewPolicy] = useState({ category: "", retention_days: 365, action: "anonymize" });
  const [newIncident, setNewIncident] = useState({ title: "", description: "", severity: "medium", affected_users_count: 0 });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle().then(({ data }) => {
      const admin = data?.role === "Administrador";
      setIsAdmin(admin);
      if (!admin) navigate("/");
    });
  }, [user, navigate]);

  const load = async () => {
    const [d, r, p, i] = await Promise.all([
      supabase.from("dpo_config").select("*").maybeSingle(),
      supabase.from("data_requests").select("*").order("requested_at", { ascending: false }).limit(50),
      supabase.from("retention_policies").select("*").order("category"),
      supabase.from("privacy_incidents").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (d.data) setDpo(d.data as any);
    setRequests(r.data || []);
    setPolicies(p.data || []);
    setIncidents(i.data || []);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const saveDpo = async () => {
    const { error } = await supabase.from("dpo_config").update({
      name: dpo.name, email: dpo.email, phone: dpo.phone,
      privacy_policy_version: dpo.privacy_policy_version, terms_version: dpo.terms_version,
      updated_at: new Date().toISOString(), updated_by: user?.id,
    }).eq("id", dpo.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "DPO atualizado" });
    logAudit("Atualizou dados do DPO (LGPD)", "edit", "dpo_config");
  };

  const processRequest = async (id: string, status: string, targetUserId?: string) => {
    const { error } = await supabase.from("data_requests").update({
      status, processed_at: new Date().toISOString(), processed_by: user?.id,
    }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Solicitação atualizada" });
    logAudit(`Solicitação LGPD ${status}`, "edit", id);
    load();
  };

  const anonymize = async (targetUserId: string, requestId: string) => {
    const { error } = await supabase.rpc("anonymize_user", { _target: targetUserId });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    await processRequest(requestId, "completed");
    toast({ title: "Usuário anonimizado" });
  };

  const addPolicy = async () => {
    if (!newPolicy.category) return;
    const { error } = await supabase.from("retention_policies").insert({ ...newPolicy, updated_by: user?.id });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNewPolicy({ category: "", retention_days: 365, action: "anonymize" });
    load();
  };

  const deletePolicy = async (id: string) => {
    await supabase.from("retention_policies").delete().eq("id", id);
    load();
  };

  const addIncident = async () => {
    if (!newIncident.title) return;
    const { error } = await supabase.from("privacy_incidents").insert({ ...newIncident, created_by: user?.id });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNewIncident({ title: "", description: "", severity: "medium", affected_users_count: 0 });
    logAudit("Registrou incidente LGPD", "edit", "privacy_incidents");
    load();
  };

  const markReported = async (id: string) => {
    const protocol = prompt("Protocolo ANPD:");
    if (!protocol) return;
    await supabase.from("privacy_incidents").update({
      reported_to_anpd_at: new Date().toISOString(), anpd_protocol: protocol,
    }).eq("id", id);
    load();
  };

  if (isAdmin === null) return null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-info" /> Painel LGPD</h1>
          <p className="text-sm text-muted-foreground mt-1">Governança, solicitações de titulares, retenção e incidentes.</p>
        </div>

        {/* DPO */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><UserCog className="w-4 h-4" /> Encarregado pelo Tratamento (DPO)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Nome</Label><Input value={dpo.name} onChange={e => setDpo({ ...dpo, name: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input type="email" value={dpo.email} onChange={e => setDpo({ ...dpo, email: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={dpo.phone} onChange={e => setDpo({ ...dpo, phone: e.target.value })} /></div>
            <div><Label>Versão Política Privacidade</Label><Input value={dpo.privacy_policy_version} onChange={e => setDpo({ ...dpo, privacy_policy_version: e.target.value })} /></div>
            <div><Label>Versão Termos de Uso</Label><Input value={dpo.terms_version} onChange={e => setDpo({ ...dpo, terms_version: e.target.value })} /></div>
          </div>
          <Button onClick={saveDpo}>Salvar</Button>
        </Card>

        {/* Solicitações */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Solicitações de Titulares (Art. 18)</h2>
          {requests.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma solicitação.</p> : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm">
                  <div>
                    <span className="font-medium capitalize">{r.type}</span> — {r.user_email}
                    <span className="text-muted-foreground ml-2">{new Date(r.requested_at).toLocaleString("pt-BR")}</span>
                    {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "completed" ? "bg-success/20 text-success" : r.status === "rejected" ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"}`}>{r.status}</span>
                    {r.status === "pending" && r.type === "delete" && (
                      <Button size="sm" variant="destructive" onClick={() => anonymize(r.user_id, r.id)}>Anonimizar</Button>
                    )}
                    {r.status === "pending" && r.type !== "delete" && (
                      <Button size="sm" onClick={() => processRequest(r.id, "completed")}>Concluir</Button>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => processRequest(r.id, "rejected")}>Rejeitar</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Retenção */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Políticas de Retenção</h2>
          <div className="flex flex-wrap gap-2 mb-4 items-end">
            <div><Label>Categoria</Label><Input value={newPolicy.category} onChange={e => setNewPolicy({ ...newPolicy, category: e.target.value })} /></div>
            <div><Label>Dias</Label><Input type="number" value={newPolicy.retention_days} onChange={e => setNewPolicy({ ...newPolicy, retention_days: +e.target.value })} className="w-24" /></div>
            <div>
              <Label>Ação</Label>
              <Select value={newPolicy.action} onValueChange={v => setNewPolicy({ ...newPolicy, action: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="anonymize">Anonimizar</SelectItem><SelectItem value="delete">Excluir</SelectItem></SelectContent>
              </Select>
            </div>
            <Button onClick={addPolicy}>Adicionar</Button>
          </div>
          {policies.map(p => (
            <div key={p.id} className="flex justify-between items-center border-b py-2 text-sm">
              <span><strong>{p.category}</strong> — {p.retention_days} dias → {p.action}</span>
              <Button size="sm" variant="ghost" onClick={() => deletePolicy(p.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </Card>

        {/* Incidentes */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><FileWarning className="w-4 h-4" /> Incidentes de Privacidade (Art. 48)</h2>
          <div className="space-y-2 mb-4">
            <Input placeholder="Título" value={newIncident.title} onChange={e => setNewIncident({ ...newIncident, title: e.target.value })} />
            <Textarea placeholder="Descrição" value={newIncident.description} onChange={e => setNewIncident({ ...newIncident, description: e.target.value })} />
            <div className="flex gap-2">
              <Select value={newIncident.severity} onValueChange={v => setNewIncident({ ...newIncident, severity: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Afetados" value={newIncident.affected_users_count} onChange={e => setNewIncident({ ...newIncident, affected_users_count: +e.target.value })} className="w-32" />
              <Button onClick={addIncident}>Registrar</Button>
            </div>
          </div>
          {incidents.map(i => (
            <div key={i.id} className="border-b py-2 text-sm space-y-1">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${i.severity === "critical" ? "text-destructive" : "text-warning"}`} />
                  <strong>{i.title}</strong>
                  <span className="text-xs text-muted-foreground">({i.severity} · {i.affected_users_count} afetados)</span>
                </div>
                {i.reported_to_anpd_at ? (
                  <span className="text-xs text-success">ANPD #{i.anpd_protocol}</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => markReported(i.id)}>Marcar reportado à ANPD</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{i.description}</p>
            </div>
          ))}
        </Card>
      </div>
    </AppLayout>
  );
}
