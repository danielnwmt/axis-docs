import { AppLayout } from "@/components/layout/AppLayout";
import { Users as UsersIcon, Plus, MoreVertical, Trash2, ToggleLeft, ToggleRight, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

interface UnitOption {
  id: string;
  name: string;
}
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserProfile {
  id: string;
  email: string;
  role: string;
  unit: string;
  active: boolean;
  created_at: string;
}

export default function Users() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Usuário");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const fetchUsers = async () => {
    const { data, error } = await supabase.from("profiles" as any).select("*").order("created_at", { ascending: true });
    if (!error && data) {
      setUsers(data as any as UserProfile[]);
    }
  };

  const fetchUnits = async () => {
    const { data } = await supabase.from("units").select("id, name").order("name");
    if (data) setUnits(data);
  };

  useEffect(() => {
    fetchUsers();
    fetchUnits();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("create-user?action=create", {
        body: { email, password, role, unit },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({ title: "Usuário criado!", description: `Usuário ${email} criado com sucesso.` });
      setOpen(false);
      setEmail("");
      setPassword("");
      setRole("Usuário");
      setUnit("");
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Erro ao criar usuário", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    try {
      const response = await supabase.functions.invoke("create-user?action=toggle", {
        body: { userId: user.id, active: !user.active },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({ title: user.active ? "Usuário inativado" : "Usuário ativado", description: `${user.email} foi ${user.active ? "inativado" : "ativado"}.` });
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      const response = await supabase.functions.invoke("create-user?action=delete", {
        body: { userId: deleteTarget.id },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({ title: "Usuário excluído", description: `${deleteTarget.email} foi removido.` });
      setDeleteTarget(null);
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UsersIcon className="w-7 h-7 text-primary" />
          <h1 className="font-display text-2xl font-bold text-foreground">Usuários e Permissões</h1>
        </div>
        <Button className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Novo Usuário
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-5 py-3 font-semibold text-foreground">E-mail</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Perfil</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Unidade</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Status</th>
              <th className="text-left px-5 py-3 font-semibold text-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhum usuário encontrado</td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                <td className="px-5 py-3 text-foreground">{user.email}</td>
                <td className="px-5 py-3">
                  <Badge variant="secondary">{user.role}</Badge>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{user.unit || "—"}</td>
                <td className="px-5 py-3">
                  <Badge variant={user.active ? "default" : "outline"}>
                    {user.active ? "Ativo" : "Inativo"}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  {user.id !== currentUser?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-secondary rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                          {user.active ? (
                            <><ToggleLeft className="w-4 h-4 mr-2" /> Inativar</>
                          ) : (
                            <><ToggleRight className="w-4 h-4 mr-2" /> Ativar</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(user)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" placeholder="usuario@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Administrador">Administrador</SelectItem>
                  <SelectItem value="Operador">Operador</SelectItem>
                  <SelectItem value="Usuário">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidade/Setor</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando..." : "Criar Usuário"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{deleteTarget?.email}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
