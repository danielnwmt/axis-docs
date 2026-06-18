import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Camera, KeyRound, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string;
};

export function UserProfileMenu() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["user-profile-menu", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      return data as ProfileRow | null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const displayName = profile?.full_name?.trim() || profile?.email || user?.email || "Usuário";
  const role = profile?.role || "Usuário";
  const initial = displayName[0]?.toUpperCase() || "U";

  const signedAvatar = useQuery({
    queryKey: ["avatar-signed", profile?.avatar_url],
    queryFn: async () => {
      if (!profile?.avatar_url) return null;
      const { data } = await supabase.storage
        .from("avatars")
        .createSignedUrl(profile.avatar_url, 60 * 60);
      return data?.signedUrl ?? null;
    },
    enabled: !!profile?.avatar_url,
    staleTime: 30 * 60_000,
  });

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máx. 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      if (profile?.avatar_url && profile.avatar_url !== path) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]);
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", user.id);
      if (updErr) throw updErr;

      await qc.invalidateQueries({ queryKey: ["user-profile-menu", user.id] });
      toast({ title: "Foto atualizada" });
    } catch (err: any) {
      toast({ title: "Falha ao enviar foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleChangePassword = async () => {
    if (pwd.length < 8) {
      toast({ title: "Senha muito curta", description: "Mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    if (pwd !== pwd2) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }
    setChangingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd(""); setPwd2("");
      toast({ title: "Senha alterada com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao alterar senha", description: err.message, variant: "destructive" });
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg bg-sidebar-accent w-[calc(100%-1.5rem)] hover:bg-sidebar-accent/80 transition-colors text-left">
          <Avatar className="w-8 h-8">
            <AvatarImage src={signedAvatar.data || undefined} alt={displayName} />
            <AvatarFallback className="bg-info text-info-foreground text-xs font-bold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-primary truncate">{displayName}</p>
            <p className="text-[11px] text-sidebar-muted truncate">{role}</p>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0">
        <div className="p-4 flex items-center gap-3 border-b">
          <div className="relative">
            <Avatar className="w-14 h-14">
              <AvatarImage src={signedAvatar.data || undefined} alt={displayName} />
              <AvatarFallback className="bg-info text-info-foreground text-lg font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:opacity-90 disabled:opacity-50"
              title="Alterar foto"
              aria-label="Alterar foto"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email || user?.email}</p>
            <span className="inline-block mt-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              {role}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="w-4 h-4" /> Alterar senha
          </div>
          <div className="space-y-2">
            <div>
              <Label htmlFor="new-pwd" className="text-xs">Nova senha</Label>
              <Input id="new-pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <Label htmlFor="conf-pwd" className="text-xs">Confirmar nova senha</Label>
              <Input id="conf-pwd" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            </div>
            <Button size="sm" className="w-full" onClick={handleChangePassword} disabled={changingPwd || !pwd || !pwd2}>
              {changingPwd ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar nova senha
            </Button>
          </div>
        </div>

        <Separator />
        <div className="p-2">
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
