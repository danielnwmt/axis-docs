import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ShieldAlert, Trash2, AlertCircle, CheckCircle2, FileWarning, RefreshCw, Plus } from "lucide-react";

type Incident = {
  id: string; title: string; description: string; severity: string;
  affected_users_count: number; status: string;
  reported_to_anpd_at: string | null; anpd_protocol: string | null;
  data_subjects_notified_at: string | null; resolution: string | null;
  created_at: string;
};
type Policy = { id: string; category: string; retention_days: number; action: string; active: boolean };

export default function Lgpd() {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      .then(({ data }) => { setRole((data as any)?.role ?? null); setLoading(false); });
  }, [user?.id]);

  if (loading) return null;
  if (role !== "Administrador") return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-8 max-w-6xl">
        <header className="flex items-center gap-3">
          <ShieldAlert className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Governança LGPD</h1>
            <p className="text-sm text-muted-foreground">Incidentes, retenção de dados e conformidade legal.</p>
          </div>
        </header>

        <RetentionPanel />
        <IncidentsPanel />
      </div>
    </AppLayout>
  );
}

function RetentionPanel() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [days, setDays] = useState(365);
  const [action, setAction] = useState<"anonymize" | "delete">("anonymize");
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      (supabase as any).from("retention_policies").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("categories").select("name").eq("active", true).order("name"),
    ]);
    setPolicies((p || []) as Policy[]);
    setCategories(((c || []) as any[]).map(x => x.name));
  };
  useEffect(() => { load(); }, []);

  const addPolicy = async () => {
    if (!category) return toast({ title: "Selecione categoria", variant: "destructive" });
    const { error } = await (supabase as any).from("retention_policies")
      .insert({ category, retention_days: Number(days), action, active: true });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Política criada" }); load(); }
  };
  const toggle = async (p: Policy) => {
    await (supabase as any).from("retention_policies").update({ active: !p.active }).eq("id", p.id);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir política?")) return;
    await (supabase as any).from("retention_policies").delete().eq("id", id);
    load();
  };
  const runNow = async () => {
    if (!confirm("Aplicar retenção agora? Documentos vencidos serão anonimizados ou excluídos.")) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("purge-expired", { method: "POST" });
      if (error) throw error;
      toast({ title: "Retenção executada", description: `${(data as any).processed || 0} documento(s) processado(s).` });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  return (
    <section className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Políticas de Retenção (Art. 16 LGPD)</h2>
        </div>
        <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
          <RefreshCw className={`w-4 h-4 mr-2 ${running ? "animate-spin" : ""}`} /> Executar agora
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-lg bg-secondary/40">
        <div>
          <Label>Categoria</Label>
          <select className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">— escolher —</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label>Retenção (dias)</Label>
          <Input type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))} />
        </div>
        <div>
          <Label>Ação ao vencer</Label>
          <select className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={action} onChange={e => setAction(e.target.value as any)}>
            <option value="anonymize">Anonimizar</option>
            <option value="delete">Excluir</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button onClick={addPolicy} className="w-full"><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
        </div>
      </div>

      <div className="space-y-2">
        {policies.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma política definida.</p>}
        {policies.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "ativa" : "inativa"}</Badge>
            <span className="font-medium">{p.category}</span>
            <span className="text-sm text-muted-foreground">{p.retention_days} dias · {p.action === "delete" ? "excluir" : "anonimizar"}</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggle(p)}>{p.active ? "Pausar" : "Ativar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IncidentsPanel() {
  const [items, setItems] = useState<Incident[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affected, setAffected] = useState(0);
  const { user } = useAuth();

  const load = async () => {
    const { data } = await (supabase as any).from("privacy_incidents").select("*").order("created_at", { ascending: false });
    setItems((data || []) as Incident[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim() || !description.trim()) return toast({ title: "Preencha título e descrição", variant: "destructive" });
    const { error } = await (supabase as any).from("privacy_incidents").insert({
      title, description, severity, affected_users_count: Number(affected) || 0, created_by: user?.id,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Incidente registrado" }); setTitle(""); setDescription(""); setAffected(0); load(); }
  };

  const notifySubjects = async (id: string) => {
    if (!confirm("Confirmar comunicação aos titulares afetados (Art. 48)?")) return;
    const { error } = await (supabase as any).rpc("notify_incident_subjects", { _incident_id: id });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Titulares marcados como notificados" }); load(); }
  };
  const reportAnpd = async (id: string) => {
    const protocol = prompt("Número do protocolo ANPD:");
    if (!protocol) return;
    const { error } = await (supabase as any).rpc("report_incident_anpd", { _incident_id: id, _protocol: protocol });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Incidente reportado à ANPD" }); load(); }
  };
  const resolve = async (id: string) => {
    const r = prompt("Descreva a resolução:");
    if (!r) return;
    const { error } = await (supabase as any).rpc("resolve_incident", { _incident_id: id, _resolution: r });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Incidente resolvido" }); load(); }
  };

  return (
    <section className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <h2 className="text-lg font-semibold">Incidentes de Privacidade (Art. 48 LGPD)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-secondary/40">
        <div className="space-y-2">
          <Label>Título</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: vazamento acidental de e-mails" />
          <Label>Severidade</Label>
          <select className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option>
          </select>
          <Label>Titulares afetados (estimado)</Label>
          <Input type="number" min={0} value={affected} onChange={e => setAffected(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Descrição do incidente</Label>
          <Textarea rows={8} value={description} onChange={e => setDescription(e.target.value)} placeholder="Natureza dos dados, contexto, medidas tomadas..." />
          <Button onClick={create} className="w-full">Registrar incidente</Button>
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum incidente registrado.</p>}
        {items.map(i => (
          <div key={i.id} className="p-4 rounded-lg border border-border space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={i.status === "resolved" ? "secondary" : i.severity === "critical" || i.severity === "high" ? "destructive" : "default"}>{i.status}</Badge>
              <Badge variant="outline">{i.severity}</Badge>
              <strong>{i.title}</strong>
              <span className="text-xs text-muted-foreground ml-auto">{new Date(i.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{i.description}</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Titulares afetados: <strong>{i.affected_users_count}</strong></div>
              {i.reported_to_anpd_at && <div>ANPD: protocolo {i.anpd_protocol} em {new Date(i.reported_to_anpd_at).toLocaleString("pt-BR")}</div>}
              {i.data_subjects_notified_at && <div>Titulares notificados: {new Date(i.data_subjects_notified_at).toLocaleString("pt-BR")}</div>}
              {i.resolution && <div>Resolução: {i.resolution}</div>}
            </div>
            {i.status !== "resolved" && (
              <div className="flex gap-2 flex-wrap pt-2">
                {!i.data_subjects_notified_at && <Button size="sm" variant="outline" onClick={() => notifySubjects(i.id)}>Notificar titulares</Button>}
                {!i.reported_to_anpd_at && <Button size="sm" variant="outline" onClick={() => reportAnpd(i.id)}>Reportar à ANPD</Button>}
                <Button size="sm" onClick={() => resolve(i.id)}><CheckCircle2 className="w-4 h-4 mr-1" /> Resolver</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
