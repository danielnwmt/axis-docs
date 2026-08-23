import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Plus, Search, Pencil, Users, HardDrive, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  doc_type: string | null;
  document: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  max_users: number;
  storage_limit_gb: number;
  storage_used_bytes: number;
};

const emptyForm = {
  name: "", slug: "", doc_type: "CNPJ", document: "", contact_name: "",
  contact_email: "", contact_phone: "", city: "", state: "", notes: "",
  plan: "trial", status: "active", max_users: 10, storage_limit_gb: 10,
};

const slugify = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const maskDoc = (v: string, type: string) => {
  const d = v.replace(/\D/g, "").slice(0, type === "CPF" ? 11 : 14);
  if (type === "CPF") {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const CHART_COLORS = ["hsl(195,80%,50%)", "hsl(215,70%,55%)", "hsl(160,60%,45%)", "hsl(38,92%,55%)"];

export default function Platform() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Org | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const { data: isOwner, isLoading: loadingOwner } = useQuery({
    queryKey: ["is-platform-owner", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("platform_owners")
        .select("user_id").eq("user_id", user!.id).maybeSingle();
      return !!data;
    },
    enabled: !!user?.id,
  });

  const { data: orgs } = useQuery({
    queryKey: ["platform-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Org[];
    },
    enabled: !!isOwner,
  });

  const { data: counts } = useQuery({
    queryKey: ["platform-org-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("org_id");
      const map: Record<string, number> = {};
      (data ?? []).forEach((p: any) => {
        if (p.org_id) map[p.org_id] = (map[p.org_id] ?? 0) + 1;
      });
      return map;
    },
    enabled: !!isOwner,
  });

  const list = orgs ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const digits = q.replace(/\D/g, "");
    return list.filter((o) =>
      [o.name, o.slug, o.contact_name, o.contact_email, o.city, o.state]
        .some((f) => (f ?? "").toLowerCase().includes(q)) ||
      (digits.length > 0 && (o.document ?? "").replace(/\D/g, "").includes(digits))
    );
  }, [list, query]);

  const stats = useMemo(() => {
    const totalUsers = Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
    const totalGb = list.reduce((a, o) => a + Number(o.storage_used_bytes || 0), 0) / 1024 ** 3;
    return {
      orgs: list.length,
      active: list.filter((o) => o.status === "active").length,
      users: totalUsers,
      gb: totalGb,
    };
  }, [list, counts]);

  const storageChart = useMemo(
    () => list.map((o) => ({
      name: o.name.length > 14 ? o.name.slice(0, 14) + "…" : o.name,
      GB: Number((Number(o.storage_used_bytes || 0) / 1024 ** 3).toFixed(2)),
      Usuários: counts?.[o.id] ?? 0,
    })).slice(0, 8),
    [list, counts]
  );

  const planChart = useMemo(() => {
    const map: Record<string, number> = {};
    list.forEach((o) => { map[o.plan] = (map[o.plan] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [list]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (o: Org) => {
    setEditing(o);
    setForm({
      name: o.name, slug: o.slug, doc_type: o.doc_type ?? "CNPJ", document: o.document ?? "",
      contact_name: o.contact_name ?? "", contact_email: o.contact_email ?? "",
      contact_phone: o.contact_phone ?? "", city: o.city ?? "", state: o.state ?? "",
      notes: o.notes ?? "", plan: o.plan, status: o.status,
      max_users: o.max_users, storage_limit_gb: Number(o.storage_limit_gb),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      max_users: Number(form.max_users) || 1,
      storage_limit_gb: Number(form.storage_limit_gb) || 1,
    };
    const { error } = editing
      ? await supabase.from("organizations").update(payload as any).eq("id", editing.id)
      : await supabase.from("organizations").insert(payload as any);
    setSaving(false);
    if (error) {
      toast.error(editing ? "Erro ao salvar cliente" : "Erro ao criar cliente", { description: error.message });
      return;
    }
    toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["platform-orgs"] });
  };

  if (loadingOwner) {
    return <AppLayout><div className="p-6 text-sm text-muted-foreground">Carregando...</div></AppLayout>;
  }

  if (!isOwner) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card className="p-6">
            <h1 className="text-lg font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground mt-1">Esta área é exclusiva do dono da plataforma.</p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const cards = [
    { label: "Clientes", value: stats.orgs, icon: Building2 },
    { label: "Ativos", value: stats.active, icon: CheckCircle2 },
    { label: "Usuários", value: stats.users, icon: Users },
    { label: "Armazenamento", value: `${stats.gb.toFixed(2)} GB`, icon: HardDrive },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Painel da Plataforma</h1>
            <p className="text-sm text-muted-foreground">Gestão dos clientes (organizações) do SaaS.</p>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Novo cliente</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-xl font-semibold">{c.value}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4 text-sm">Consumo por cliente</h2>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storageChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="GB" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Usuários" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-4 text-sm">Clientes por plano</h2>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={planChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {planChart.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Clientes ({filtered.length})
            </h2>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, CNPJ/CPF, e-mail, cidade..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.document ? `${o.doc_type ?? "CNPJ"}: ${o.document} · ` : ""}/{o.slug}
                    {o.city ? ` · ${o.city}${o.state ? "/" + o.state : ""}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {counts?.[o.id] ?? 0}/{o.max_users} usuários ·{" "}
                    {(Number(o.storage_used_bytes || 0) / 1024 ** 3).toFixed(2)} GB de {o.storage_limit_gb} GB
                    {o.contact_email ? ` · ${o.contact_email}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.plan}</Badge>
                  <Badge variant={o.status === "active" ? "default" : "destructive"}>{o.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Cadastrar cliente"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome / Razão social *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Prefeitura Municipal de..." />
            </div>
            <div>
              <Label>Tipo de documento</Label>
              <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v, document: maskDoc(form.document, v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNPJ">CNPJ</SelectItem>
                  <SelectItem value="CPF">CPF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.doc_type}</Label>
              <Input value={form.document} onChange={(e) => setForm({ ...form, document: maskDoc(e.target.value, form.doc_type) })} placeholder={form.doc_type === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"} />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <Label>E-mail de contato</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={slugify(form.name) || "cliente-x"} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>UF</Label>
              <Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">trial</SelectItem>
                  <SelectItem value="basic">basic</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                  <SelectItem value="enterprise">enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                  <SelectItem value="canceled">canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Máx. usuários</Label>
              <Input type="number" min={1} value={form.max_users} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Limite de armazenamento (GB)</Label>
              <Input type="number" min={1} value={form.storage_limit_gb} onChange={(e) => setForm({ ...form, storage_limit_gb: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
