import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";

export default function Platform() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: isOwner, isLoading: loadingOwner } = useQuery({
    queryKey: ["is-platform-owner", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_owners")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user?.id,
  });

  const { data: orgs } = useQuery({
    queryKey: ["platform-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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

  const createOrg = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const finalSlug =
      slug.trim() ||
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    const { error } = await supabase
      .from("organizations")
      .insert({ name: name.trim(), slug: finalSlug } as any);
    setSaving(false);
    if (error) {
      toast.error("Erro ao criar organização", { description: error.message });
      return;
    }
    toast.success("Organização criada");
    setName("");
    setSlug("");
    qc.invalidateQueries({ queryKey: ["platform-orgs"] });
  };

  if (loadingOwner) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
      </AppLayout>
    );
  }

  if (!isOwner) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card className="p-6">
            <h1 className="text-lg font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Esta área é exclusiva do dono da plataforma.
            </p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Painel da Plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Gestão das organizações (clientes) do SaaS.
          </p>
        </div>

        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nova organização
          </h2>
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prefeitura X" />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="prefeitura-x" />
            </div>
            <Button onClick={createOrg} disabled={saving || !name.trim()}>
              {saving ? "Criando..." : "Criar"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Organizações ({orgs?.length ?? 0})
          </h2>
          <div className="space-y-2">
            {(orgs ?? []).map((o: any) => (
              <div
                key={o.id}
                className="flex items-center justify-between border rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    /{o.slug} · {counts?.[o.id] ?? 0}/{o.max_users} usuários ·{" "}
                    {(Number(o.storage_used_bytes || 0) / 1024 ** 3).toFixed(2)} GB de{" "}
                    {o.storage_limit_gb} GB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.plan}</Badge>
                  <Badge variant={o.status === "active" ? "default" : "destructive"}>
                    {o.status}
                  </Badge>
                </div>
              </div>
            ))}
            {(orgs ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma organização.</p>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
