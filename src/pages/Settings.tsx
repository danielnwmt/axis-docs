import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Settings as SettingsIcon, Building, Tag, FolderTree, Sliders, ArrowLeft, Plus, Trash2, Edit2, Save, X, ImageIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Section = "orgao" | "categorias" | "unidades" | "parametros" | "banner" | null;

const sectionCards = [
  { id: "orgao" as Section, icon: Building, title: "Dados do Órgão", description: "Nome, CNPJ e informações institucionais" },
  { id: "categorias" as Section, icon: Tag, title: "Categorias Documentais", description: "Gerenciar tipos de documentos" },
  { id: "unidades" as Section, icon: FolderTree, title: "Unidades/Setores", description: "Gerenciar a estrutura organizacional" },
  { id: "parametros" as Section, icon: Sliders, title: "Parâmetros do Sistema", description: "Configurações gerais da plataforma" },
  { id: "banner" as Section, icon: ImageIcon, title: "Banner do Dashboard", description: "Alterar a imagem do banner principal" },
];

function OrgaoSection() {
  const [data, setData] = useState({
    nome: "",
    cnpj: "",
    endereco: "",
    telefone: "",
    email: "",
    responsavel: "",
  });

  const handleSave = () => {
    toast({ title: "Dados salvos com sucesso!" });
  };

  return (
    <div className="space-y-4 max-w-xl">
      {[
        { key: "nome", label: "Nome do Órgão" },
        { key: "cnpj", label: "CNPJ" },
        { key: "endereco", label: "Endereço" },
        { key: "telefone", label: "Telefone" },
        { key: "email", label: "E-mail institucional" },
        { key: "responsavel", label: "Responsável" },
      ].map((field) => (
        <div key={field.key} className="space-y-1">
          <Label>{field.label}</Label>
          <Input
            value={data[field.key as keyof typeof data]}
            onChange={(e) => setData({ ...data, [field.key]: e.target.value })}
            placeholder={field.label}
          />
        </div>
      ))}
      <Button onClick={handleSave} className="mt-2">
        <Save className="w-4 h-4 mr-2" /> Salvar
      </Button>
    </div>
  );
}


function ListManager({ itemLabel, tableName }: { itemLabel: string; tableName: "categories" | "units" }) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    const { data } = await supabase.from(tableName).select("id, name").order("name");
    if (data) setItems(data);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [tableName]);

  const addItem = async () => {
    if (!newItem.trim()) return;
    const { error } = await supabase.from(tableName).insert({ name: newItem.trim() });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewItem("");
    toast({ title: `${itemLabel} adicionado(a)!` });
    fetchItems();
  };

  const removeItem = async (idx: number) => {
    const { error } = await supabase.from(tableName).delete().eq("id", items[idx].id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${itemLabel} removido(a)!` });
    fetchItems();
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(items[idx].name);
  };

  const saveEdit = async () => {
    if (editingIdx === null || !editValue.trim()) return;
    const { error } = await supabase.from(tableName).update({ name: editValue.trim() }).eq("id", items[editingIdx].id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setEditingIdx(null);
    toast({ title: `${itemLabel} atualizado(a)!` });
    fetchItems();
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Nome do(a) ${itemLabel.toLowerCase()}`}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <Button onClick={addItem} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Adicionar
        </Button>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum(a) {itemLabel.toLowerCase()} cadastrado(a).</p>
      )}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
            {editingIdx === idx ? (
              <>
                <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8" onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
                <Button size="icon" variant="ghost" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingIdx(null)}><X className="w-4 h-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{item.name}</span>
                <Button size="icon" variant="ghost" onClick={() => startEdit(idx)}><Edit2 className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BannerSection() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { data } = supabase.storage.from("settings").getPublicUrl("hero-banner");
    fetch(data.publicUrl + "?t=" + Date.now(), { method: "HEAD", cache: "no-store" }).then((res) => {
      if (res.ok) setCurrentUrl(data.publicUrl + "?t=" + Date.now());
    }).catch(() => {});
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Erro", description: "Selecione um arquivo de imagem.", variant: "destructive" });
      return;
    }
    setUploading(true);
    // Remove old file first
    await supabase.storage.from("settings").remove(["hero-banner"]);
    const { error } = await supabase.storage.from("settings").upload("hero-banner", file, { upsert: true });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const { data } = supabase.storage.from("settings").getPublicUrl("hero-banner");
      setCurrentUrl(data.publicUrl + "?t=" + Date.now());
      toast({ title: "Banner atualizado com sucesso!" });
    }
    setUploading(false);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <Label>Imagem atual do banner</Label>
      {currentUrl ? (
        <img src={currentUrl} alt="Banner atual" className="w-full max-h-48 object-cover rounded-lg border border-border" />
      ) : (
        <div className="w-full h-32 bg-secondary rounded-lg flex items-center justify-center text-muted-foreground text-sm">
          Nenhuma imagem personalizada definida
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
        <Upload className="w-4 h-4" /> {uploading ? "Enviando..." : "Enviar nova imagem"}
      </Button>
    </div>
  );
}

function ParametrosSection() {
  const [params, setParams] = useState({
    retencaoDias: "365",
    tamanhoMaxMB: "50",
    autoOCR: true,
  });

  const handleSave = () => {
    toast({ title: "Parâmetros salvos com sucesso!" });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-1">
        <Label>Retenção de documentos (dias)</Label>
        <Input type="number" value={params.retencaoDias} onChange={(e) => setParams({ ...params, retencaoDias: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Tamanho máximo de arquivo (MB)</Label>
        <Input type="number" value={params.tamanhoMaxMB} onChange={(e) => setParams({ ...params, tamanhoMaxMB: e.target.value })} />
      </div>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="autoOCR"
          checked={params.autoOCR}
          onChange={(e) => setParams({ ...params, autoOCR: e.target.checked })}
          className="rounded border-border"
        />
        <Label htmlFor="autoOCR">Ativar OCR automático nos uploads</Label>
      </div>
      <Button onClick={handleSave} className="mt-2">
        <Save className="w-4 h-4 mr-2" /> Salvar
      </Button>
    </div>
  );
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>(null);

  const renderContent = () => {
    switch (activeSection) {
      case "orgao": return <OrgaoSection />;
      case "categorias": return <ListManager itemLabel="Categoria" tableName="categories" />;
      case "unidades": return <ListManager itemLabel="Unidade/Setor" tableName="units" />;
      case "parametros": return <ParametrosSection />;
      case "banner": return <BannerSection />;
      default: return null;
    }
  };

  const activeCard = sectionCards.find((s) => s.id === activeSection);

  return (
    <AppLayout>
      <div className="flex items-center gap-3 mb-6">
        {activeSection && (
          <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <SettingsIcon className="w-7 h-7 text-primary" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          {activeCard ? activeCard.title : "Configurações"}
        </h1>
      </div>

      {!activeSection ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sectionCards.map((section) => (
            <div
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className="bg-card rounded-xl border border-border shadow-sm p-6 hover:border-primary/30 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <section.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">{section.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm p-6">
          {renderContent()}
        </div>
      )}
    </AppLayout>
  );
}
