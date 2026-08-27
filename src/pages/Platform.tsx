import { useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2, Plus, Search, Pencil, Users, HardDrive, CheckCircle2,
  Package, Receipt, DollarSign, Trash2, TrendingUp, Copy, KeyRound, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
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
  org_key?: string | null;
  created_at?: string;
};

type Plan = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  max_users: number;
  storage_gb: number;
  description: string | null;
  active: boolean;
};

type Invoice = {
  id: string;
  org_id: string;
  description: string;
  kind: string;
  amount_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

const emptyForm = {
  name: "", slug: "", doc_type: "CNPJ", document: "", contact_name: "",
  contact_email: "", contact_phone: "", city: "", state: "", notes: "",
  plan: "trial", status: "active", max_users: 10, storage_limit_gb: 10,
  admin_email: "", admin_password: "", admin_name: "",
};

const emptyPlan = {
  name: "", slug: "", price_cents: 0, max_users: 10, storage_gb: 10,
  description: "", active: true,
};

const emptyInvoice = {
  org_id: "", description: "", kind: "subscription", amount_cents: 0,
  status: "open", due_date: "", notes: "",
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

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CHART_COLORS = ["hsl(195,80%,50%)", "hsl(215,70%,55%)", "hsl(160,60%,45%)", "hsl(38,92%,55%)"];

export default function Platform() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Org | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // plans
  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({ ...emptyPlan });

  // invoices
  const [invOpen, setInvOpen] = useState(false);
  const [invForm, setInvForm] = useState({ ...emptyInvoice });

  // storage add-on
  const [addonOrg, setAddonOrg] = useState<Org | null>(null);
  const [addonGb, setAddonGb] = useState(10);
  const [addonMode, setAddonMode] = useState<"add" | "remove">("add");
  const [addonPrice, setAddonPrice] = useState(0);
  const [addonPriceTouched, setAddonPriceTouched] = useState(false);
  const [addonInvoice, setAddonInvoice] = useState(true);

  // preço do armazenamento (por GB)
  const [gbPriceInput, setGbPriceInput] = useState("0");
  const [savingGbPrice, setSavingGbPrice] = useState(false);


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

  const { data: plans } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans")
        .select("*").order("price_cents", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
    enabled: !!isOwner,
  });

  const { data: invoices } = useQuery({
    queryKey: ["platform-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Invoice[];
    },
    enabled: !!isOwner,
  });

  const { data: settings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings" as any)
        .select("*").limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
    enabled: !!isOwner,
  });

  const gbPriceCents = Number(settings?.storage_price_cents_per_gb ?? 0);

  useEffect(() => {
    setGbPriceInput(((gbPriceCents || 0) / 100).toString());
  }, [gbPriceCents]);

  const saveGbPrice = async () => {
    setSavingGbPrice(true);
    const cents = Math.round((Number(gbPriceInput.replace(",", ".")) || 0) * 100);
    const { error } = await supabase.from("platform_settings" as any)
      .upsert({ id: true, storage_price_cents_per_gb: cents } as any);
    setSavingGbPrice(false);
    if (error) { toast.error("Erro ao salvar preço", { description: error.message }); return; }
    toast.success("Preço do armazenamento atualizado");
    qc.invalidateQueries({ queryKey: ["platform-settings"] });
  };



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
  const planList = plans ?? [];
  const invoiceList = invoices ?? [];
  const orgName = (id: string) => list.find((o) => o.id === id)?.name ?? "—";

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
    const mrr = list.reduce((a, o) => {
      if (o.status !== "active") return a;
      const p = planList.find((x) => x.slug === o.plan);
      const base = Number(p?.price_cents ?? 0);
      const extraGb = Math.max(0, Number(o.storage_limit_gb || 0) - Number(p?.storage_gb ?? 0));
      return a + base + Math.round(extraGb * gbPriceCents);
    }, 0);
    return {
      orgs: list.length,
      active: list.filter((o) => o.status === "active").length,
      users: totalUsers,
      gb: totalGb,
      mrr,
      open: invoiceList.filter((i) => i.status === "open").reduce((a, i) => a + i.amount_cents, 0),
    };
  }, [list, counts, planList, invoiceList, gbPriceCents]);

  const trendChart = useMemo(() => {
    const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const now = new Date();
    const months: { label: string; year: number; month: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`,
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    let acc = 0;
    return months.map((m) => {
      const end = new Date(m.year, m.month + 1, 1).getTime();
      const novos = list.filter((o) => {
        if (!o.created_at) return false;
        const dt = new Date(o.created_at);
        return dt.getFullYear() === m.year && dt.getMonth() === m.month;
      }).length;
      acc = list.filter((o) => o.created_at && new Date(o.created_at).getTime() < end).length;
      const ativos = list.filter(
        (o) => o.status === "active" && o.created_at && new Date(o.created_at).getTime() < end
      ).length;
      return { name: m.label, Total: acc, Novos: novos, Ativos: ativos };
    });
  }, [list]);

  const planChart = useMemo(() => {
    const map: Record<string, number> = {};
    list.forEach((o) => { map[o.plan] = (map[o.plan] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [list]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (o: Org) => {
    setEditing(o);
    setForm({
      ...emptyForm,
      name: o.name, slug: o.slug, doc_type: o.doc_type ?? "CNPJ", document: o.document ?? "",
      contact_name: o.contact_name ?? "", contact_email: o.contact_email ?? "",
      contact_phone: o.contact_phone ?? "", city: o.city ?? "", state: o.state ?? "",
      notes: o.notes ?? "", plan: o.plan, status: o.status,
      max_users: o.max_users, storage_limit_gb: Number(o.storage_limit_gb),
    });
    setOpen(true);
  };

  const applyPlanToForm = (slug: string) => {
    const p = planList.find((x) => x.slug === slug);
    setForm((f) => ({
      ...f,
      plan: slug,
      max_users: p ? p.max_users : f.max_users,
      storage_limit_gb: p ? Number(p.storage_gb) : f.storage_limit_gb,
    }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const { admin_email, admin_password, admin_name, ...orgFields } = form;
    const payload = {
      ...orgFields,
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      max_users: Number(form.max_users) || 1,
      storage_limit_gb: Number(form.storage_limit_gb) || 1,
    };

    if (!editing && (!admin_email.trim() || admin_password.length < 6)) {
      toast.error("Informe e-mail e senha (mín. 6 caracteres) do usuário padrão da empresa");
      return;
    }

    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("organizations").update(payload as any).eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast.error("Erro ao salvar cliente", { description: error.message });
        return;
      }
      toast.success("Cliente atualizado");
    } else {
      const { data, error } = await supabase.functions.invoke("provision-org", {
        body: { org: payload, admin_email, admin_password, admin_name },
      });
      setSaving(false);
      const errMsg = (data as any)?.error || error?.message;
      if (errMsg) {
        toast.error("Erro ao criar cliente", { description: errMsg });
        return;
      }
      toast.success("Cliente criado", { description: `Usuário padrão: ${admin_email.trim()}` });
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["platform-orgs"] });
    qc.invalidateQueries({ queryKey: ["platform-org-users"] });
  };

  // ---------- plans ----------
  const openNewPlan = () => { setEditingPlan(null); setPlanForm({ ...emptyPlan }); setPlanOpen(true); };
  const openEditPlan = (p: Plan) => {
    setEditingPlan(p);
    setPlanForm({
      name: p.name, slug: p.slug, price_cents: p.price_cents, max_users: p.max_users,
      storage_gb: Number(p.storage_gb), description: p.description ?? "", active: p.active,
    });
    setPlanOpen(true);
  };

  const savePlan = async () => {
    if (!planForm.name.trim()) return;
    const payload = {
      name: planForm.name.trim(),
      slug: (planForm.slug.trim() || slugify(planForm.name)),
      price_cents: Math.round(Number(planForm.price_cents) || 0),
      max_users: Number(planForm.max_users) || 1,
      storage_gb: Number(planForm.storage_gb) || 1,
      description: planForm.description || null,
      active: planForm.active,
    };
    setSaving(true);
    const { error } = editingPlan
      ? await supabase.from("plans").update(payload as any).eq("id", editingPlan.id)
      : await supabase.from("plans").insert(payload as any);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar plano", { description: error.message }); return; }
    toast.success(editingPlan ? "Plano atualizado" : "Plano criado");
    setPlanOpen(false);
    qc.invalidateQueries({ queryKey: ["platform-plans"] });
  };

  const deletePlan = async (p: Plan) => {
    const { error } = await supabase.from("plans").delete().eq("id", p.id);
    if (error) { toast.error("Erro ao remover plano", { description: error.message }); return; }
    toast.success("Plano removido");
    qc.invalidateQueries({ queryKey: ["platform-plans"] });
  };

  // ---------- invoices ----------
  const openNewInvoice = (orgId?: string) => {
    setInvForm({ ...emptyInvoice, org_id: orgId ?? "" });
    setInvOpen(true);
  };

  const saveInvoice = async () => {
    if (!invForm.org_id || !invForm.description.trim()) {
      toast.error("Selecione o cliente e informe a descrição");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("invoices").insert({
      org_id: invForm.org_id,
      description: invForm.description.trim(),
      kind: invForm.kind,
      amount_cents: Math.round(Number(invForm.amount_cents) || 0),
      status: invForm.status,
      due_date: invForm.due_date || null,
      notes: invForm.notes || null,
      paid_at: invForm.status === "paid" ? new Date().toISOString() : null,
    } as any);
    setSaving(false);
    if (error) { toast.error("Erro ao criar fatura", { description: error.message }); return; }
    toast.success("Fatura criada");
    setInvOpen(false);
    qc.invalidateQueries({ queryKey: ["platform-invoices"] });
  };

  const setInvoiceStatus = async (inv: Invoice, status: string) => {
    const { error } = await supabase.from("invoices").update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    } as any).eq("id", inv.id);
    if (error) { toast.error("Erro ao atualizar fatura", { description: error.message }); return; }
    qc.invalidateQueries({ queryKey: ["platform-invoices"] });
  };

  const deleteInvoice = async (inv: Invoice) => {
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) { toast.error("Erro ao remover fatura", { description: error.message }); return; }
    qc.invalidateQueries({ queryKey: ["platform-invoices"] });
  };

  // ---------- chave do cliente ----------
  const copyKey = async (o: Org) => {
    if (!o.org_key) return;
    await navigator.clipboard.writeText(o.org_key);
    toast.success("Chave copiada");
  };

  const regenerateKey = async (o: Org) => {
    if (!confirm(`Gerar uma nova chave para "${o.name}"? A chave atual deixará de valer.`)) return;
    const { data, error } = await supabase.rpc("regenerate_org_key" as any, { _org_id: o.id });
    if (error) { toast.error("Erro ao gerar chave", { description: error.message }); return; }
    toast.success("Nova chave gerada", { description: String(data ?? "") });
    qc.invalidateQueries({ queryKey: ["platform-orgs"] });
  };

  // ---------- storage add-on ----------
  const openAddon = (o: Org) => {
    setAddonOrg(o); setAddonGb(10); setAddonMode("add");
    setAddonPrice(10 * gbPriceCents); setAddonPriceTouched(false);
    setAddonInvoice(true);
  };


  const changeAddonGb = (gb: number) => {
    setAddonGb(gb);
    if (!addonPriceTouched) setAddonPrice(Math.round((Number(gb) || 0) * gbPriceCents));
  };


  const saveAddon = async () => {
    if (!addonOrg) return;
    const gb = Number(addonGb) || 0;
    if (gb <= 0) { toast.error("Informe a quantidade de GB"); return; }
    const removing = addonMode === "remove";
    const current = Number(addonOrg.storage_limit_gb);
    const newLimit = removing ? current - gb : current + gb;
    if (newLimit < 1) { toast.error("O limite não pode ficar abaixo de 1 GB"); return; }
    const usedGb = Number(addonOrg.storage_used_bytes || 0) / 1024 ** 3;
    if (removing && newLimit < usedGb) {
      toast.error("Limite menor que o uso atual", { description: `Cliente já usa ${usedGb.toFixed(2)} GB` });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("organizations")
      .update({ storage_limit_gb: newLimit } as any).eq("id", addonOrg.id);
    if (!error && addonInvoice && !removing) {
      const addCents = Math.round(Number(addonPrice) || 0);
      // procura a próxima fatura em aberto do cliente para somar o valor
      const { data: nextInv } = await supabase.from("invoices")
        .select("id, description, amount_cents")
        .eq("org_id", addonOrg.id)
        .eq("status", "open")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (nextInv) {
        await supabase.from("invoices").update({
          amount_cents: Number((nextInv as any).amount_cents || 0) + addCents,
          description: `${(nextInv as any).description} + ${gb} GB extra`,
        } as any).eq("id", (nextInv as any).id);
      } else {
        await supabase.from("invoices").insert({
          org_id: addonOrg.id,
          description: `Armazenamento adicional: +${gb} GB`,
          kind: "storage_addon",
          amount_cents: addCents,
          status: "open",
        } as any);
      }
    }

    setSaving(false);
    if (error) { toast.error("Erro ao atualizar armazenamento", { description: error.message }); return; }
    toast.success(removing ? `-${gb} GB removidos` : `+${gb} GB adicionados`, { description: `Novo limite: ${newLimit} GB` });
    setAddonOrg(null);
    qc.invalidateQueries({ queryKey: ["platform-orgs"] });
    qc.invalidateQueries({ queryKey: ["platform-invoices"] });
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
    { label: "Receita mensal", value: brl(stats.mrr), icon: DollarSign },
    { label: "Em aberto", value: brl(stats.open), icon: Receipt },
  ];

  const planOptions = planList.length
    ? planList.filter((p) => p.active).map((p) => p.slug)
    : ["trial", "basic", "pro", "enterprise"];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Painel da Plataforma</h1>
            <p className="text-sm text-muted-foreground">Clientes, planos e faturamento do SaaS.</p>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Novo cliente</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => (
            <Card key={c.label} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-semibold truncate">{c.value}</p>
              </div>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            <TabsTrigger value="billing">Faturamento</TabsTrigger>
          </TabsList>

          {/* ---------------- Clientes ---------------- */}
          <TabsContent value="clients" className="space-y-6 mt-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="bg-card rounded-xl border border-border shadow-sm lg:col-span-2 animate-fade-in">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-display font-semibold text-foreground">
                    Evolução de clientes (12 meses)
                  </h3>
                </div>
                <div className="p-5 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <Line type="monotone" dataKey="Total" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Ativos" stroke="hsl(var(--info))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Novos" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-display font-semibold text-foreground">
                    Clientes por plano
                  </h3>
                </div>
                <div className="p-5 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={planChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="hsl(var(--card))" strokeWidth={2}>
                        {planChart.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
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
                      <div className="flex items-center gap-1.5 mt-1">
                        <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                          {o.org_key ?? "—"}
                        </code>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyKey(o)} title="Copiar chave">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => regenerateKey(o)} title="Gerar nova chave">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{o.plan}</Badge>
                      <Badge variant={o.status === "active" ? "default" : "destructive"}>{o.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => openAddon(o)}>
                        <HardDrive className="w-4 h-4 mr-1" /> + GB
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openNewInvoice(o.id)}>
                        <Receipt className="w-4 h-4 mr-1" /> Fatura
                      </Button>
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
          </TabsContent>

          {/* ---------------- Planos ---------------- */}
          <TabsContent value="plans" className="space-y-4 mt-6">
            <Card className="p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4" /> Preço do armazenamento
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-48">
                  <Label>Valor por GB (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={gbPriceInput}
                    onChange={(e) => setGbPriceInput(e.target.value)} />
                </div>
                <Button onClick={saveGbPrice} disabled={savingGbPrice}>
                  {savingGbPrice ? "Salvando..." : "Salvar preço"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Usado para calcular automaticamente o valor ao adicionar GB a um cliente.
                </p>
              </div>
            </Card>

            <Card className="p-5">

              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4" /> Planos ({planList.length})
                </h2>
                <Button size="sm" onClick={openNewPlan}><Plus className="w-4 h-4 mr-2" /> Novo plano</Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {planList.map((p) => (
                  <Card key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">/{p.slug}</p>
                      </div>
                      <Badge variant={p.active ? "default" : "outline"}>{p.active ? "ativo" : "inativo"}</Badge>
                    </div>
                    <p className="text-2xl font-semibold">{brl(p.price_cents)}<span className="text-xs font-normal text-muted-foreground">/mês</span></p>
                    <p className="text-xs text-muted-foreground">
                      Até {p.max_users} usuários · {Number(p.storage_gb)} GB
                    </p>
                    {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      {list.filter((o) => o.plan === p.slug).length} cliente(s)
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEditPlan(p)}>
                        <Pencil className="w-4 h-4 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deletePlan(p)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {planList.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ---------------- Faturamento ---------------- */}
          <TabsContent value="billing" className="space-y-4 mt-6">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Faturas ({invoiceList.length})
                </h2>
                <Button size="sm" onClick={() => openNewInvoice()}>
                  <Plus className="w-4 h-4 mr-2" /> Nova fatura
                </Button>
              </div>

              <div className="space-y-2">
                {invoiceList.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{orgName(i.org_id)} — {i.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {brl(i.amount_cents)}
                        {i.due_date ? ` · vence ${new Date(i.due_date).toLocaleDateString("pt-BR")}` : ""}
                        {i.paid_at ? ` · pago em ${new Date(i.paid_at).toLocaleDateString("pt-BR")}` : ""}
                        {i.kind === "storage_addon" ? " · armazenamento" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={i.status === "paid" ? "default" : i.status === "canceled" ? "outline" : "destructive"}>
                        {i.status === "paid" ? "pago" : i.status === "canceled" ? "cancelado" : "em aberto"}
                      </Badge>
                      {i.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => setInvoiceStatus(i, "paid")}>
                          Marcar pago
                        </Button>
                      )}
                      {i.status === "paid" && (
                        <Button size="sm" variant="outline" onClick={() => setInvoiceStatus(i, "open")}>
                          Reabrir
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteInvoice(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {invoiceList.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma fatura registrada.</p>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Cliente */}
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
              <Select value={form.plan} onValueChange={applyPlanToForm}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {planOptions.map((slug) => (
                    <SelectItem key={slug} value={slug}>{slug}</SelectItem>
                  ))}
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

          {!editing && (
            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">Usuário padrão da empresa</p>
                <p className="text-xs text-muted-foreground">
                  Administrador criado junto com o cliente. A senha deverá ser trocada no primeiro acesso.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} />
                </div>
                <div>
                  <Label>Senha *</Label>
                  <Input type="text" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plano */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Profissional" />
            </div>
            <div>
              <Label>Identificador (slug)</Label>
              <Input value={planForm.slug} onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })} placeholder={slugify(planForm.name) || "pro"} />
            </div>
            <div>
              <Label>Preço mensal (R$)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={planForm.price_cents / 100}
                onChange={(e) => setPlanForm({ ...planForm, price_cents: Math.round(Number(e.target.value) * 100) })}
              />
            </div>
            <div>
              <Label>Máx. usuários</Label>
              <Input type="number" min={1} value={planForm.max_users} onChange={(e) => setPlanForm({ ...planForm, max_users: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Armazenamento (GB)</Label>
              <Input type="number" min={1} value={planForm.storage_gb} onChange={(e) => setPlanForm({ ...planForm, storage_gb: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <Switch checked={planForm.active} onCheckedChange={(v) => setPlanForm({ ...planForm, active: v })} />
              <Label className="mb-0">Plano ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button onClick={savePlan} disabled={saving || !planForm.name.trim()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fatura */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova fatura</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Cliente *</Label>
              <Select value={invForm.org_id} onValueChange={(v) => setInvForm({ ...invForm, org_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {list.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descrição *</Label>
              <Input value={invForm.description} onChange={(e) => setInvForm({ ...invForm, description: e.target.value })} placeholder="Mensalidade — Agosto/2026" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={invForm.amount_cents / 100}
                onChange={(e) => setInvForm({ ...invForm, amount_cents: Math.round(Number(e.target.value) * 100) })}
              />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={invForm.due_date} onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={invForm.kind} onValueChange={(v) => setInvForm({ ...invForm, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">Mensalidade</SelectItem>
                  <SelectItem value="storage_addon">Armazenamento</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={invForm.status} onValueChange={(v) => setInvForm({ ...invForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Em aberto</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvOpen(false)}>Cancelar</Button>
            <Button onClick={saveInvoice} disabled={saving}>{saving ? "Salvando..." : "Criar fatura"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Armazenamento adicional */}
      <Dialog open={!!addonOrg} onOpenChange={(v) => !v && setAddonOrg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar armazenamento</DialogTitle>
            <DialogDescription>
              {addonOrg ? `${addonOrg.name} — limite atual: ${addonOrg.storage_limit_gb} GB` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={addonMode === "add" ? "default" : "outline"}
                onClick={() => setAddonMode("add")}>Adicionar GB</Button>
              <Button type="button" variant={addonMode === "remove" ? "default" : "outline"}
                onClick={() => { setAddonMode("remove"); setAddonInvoice(false); }}>Reduzir GB</Button>
            </div>
            <div>
              <Label>{addonMode === "add" ? "GB adicionais" : "GB a remover"}</Label>
              <Input type="number" min={1} value={addonGb} onChange={(e) => changeAddonGb(Number(e.target.value))} />
              {addonOrg && (
                <p className="text-xs text-muted-foreground mt-1">
                  Novo limite: {addonMode === "add"
                    ? Number(addonOrg.storage_limit_gb) + (Number(addonGb) || 0)
                    : Number(addonOrg.storage_limit_gb) - (Number(addonGb) || 0)} GB
                  {gbPriceCents > 0 && ` · ${brl(gbPriceCents)}/GB`}
                </p>
              )}
            </div>
            {addonMode === "add" ? (
              <>
                <div className="flex items-center gap-3">
                  <Switch checked={addonInvoice} onCheckedChange={setAddonInvoice} />
                  <Label className="mb-0">Cobrar na próxima fatura</Label>
                </div>
                {addonInvoice && (
                  <div>
                    <Label>Valor da cobrança (R$)</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={addonPrice / 100}
                      onChange={(e) => { setAddonPriceTouched(true); setAddonPrice(Math.round(Number(e.target.value) * 100)); }}
                    />
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">
                        {gbPriceCents > 0
                          ? `Calculado: ${addonGb} GB × ${brl(gbPriceCents)} = ${brl(Math.round((Number(addonGb) || 0) * gbPriceCents))}`
                          : "Defina o preço por GB na aba Planos."}
                      </p>
                      {addonPriceTouched && gbPriceCents > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs"
                          onClick={() => { setAddonPriceTouched(false); setAddonPrice(Math.round((Number(addonGb) || 0) * gbPriceCents)); }}>
                          Recalcular
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                A receita mensal do cliente será reduzida em{" "}
                {brl(Math.round((Number(addonGb) || 0) * gbPriceCents))} automaticamente.
              </p>
            )}

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddonOrg(null)}>Cancelar</Button>
            <Button onClick={saveAddon} disabled={saving}>
              {saving ? "Salvando..." : addonMode === "add" ? "Adicionar" : "Reduzir"}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
