import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Shield, UserPlus, Pencil, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface ManagedUser {
  id: string;
  email: string;
  display_name: string;
  username: string | null;
  role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    username: "",
    display_name: "",
    role: "visualizador" as string,
  });
  const [editData, setEditData] = useState({
    email: "",
    password: "",
    username: "",
    display_name: "",
  });

  const fetchUsers = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "list" },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Erro ao carregar usuários");
    } else {
      setUsers(data.users || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.role) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (formData.password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }
    const hasUpper = /[A-Z]/.test(formData.password);
    const hasLower = /[a-z]/.test(formData.password);
    const hasNumber = /[0-9]/.test(formData.password);
    if (!hasUpper || !hasLower || !hasNumber) {
      toast.error("A senha deve conter letras maiúsculas, minúsculas e números");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: formData,
    });

    if (error || data?.error) {
      toast.error(data?.error || "Erro ao criar usuário");
    } else {
      toast.success("Usuário criado com sucesso!");
      setShowCreateForm(false);
      setFormData({ email: "", password: "", username: "", display_name: "", role: "visualizador" });
      fetchUsers();
    }
    setCreating(false);
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "update_role", user_id: userId, role },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao atualizar papel");
    } else {
      toast.success("Papel atualizado!");
      fetchUsers();
    }
  };

  const openEdit = (user: ManagedUser) => {
    setEditingUser(user);
    setEditData({
      email: user.email,
      password: "",
      username: user.username || "",
      display_name: user.display_name,
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      action: "update_user",
      user_id: editingUser.id,
      display_name: editData.display_name,
      username: editData.username,
    };
    if (editData.email !== editingUser.email) body.email = editData.email;
    if (editData.password) body.password = editData.password;

    const { data, error } = await supabase.functions.invoke("admin-manage-user", { body });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao atualizar usuário");
    } else {
      toast.success("Usuário atualizado!");
      setEditingUser(null);
      fetchUsers();
    }
    setSaving(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${name}"?`)) return;

    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "delete", user_id: userId },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Erro ao excluir usuário");
    } else {
      toast.success("Usuário excluído!");
      fetchUsers();
    }
  };

  const roleBadgeVariant = (role: string | null) => {
    if (role === "admin") return "default";
    if (role === "operador") return "secondary";
    return "outline";
  };

  const roleLabel = (role: string | null) => {
    if (role === "admin") return "Admin";
    if (role === "operador") return "Operador";
    if (role === "visualizador") return "Visualizador";
    return "Sem papel";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Usuários ({users.length})
        </h2>
        <Button onClick={() => setShowCreateForm(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum usuário encontrado
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.display_name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.username || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role || ""}
                        onValueChange={(val) => handleUpdateRole(user.id, val)}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue>
                            <Badge variant={roleBadgeVariant(user.role)}>
                              {roleLabel(user.role)}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="h-3 w-3" /> Admin
                            </div>
                          </SelectItem>
                          <SelectItem value="operador">Operador</SelectItem>
                          <SelectItem value="visualizador">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(user)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.id, user.display_name)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome completo"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome de usuário</Label>
              <Input
                placeholder="usuario123"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Papel *</Label>
              <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="visualizador">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Criando..." : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome completo"
                value={editData.display_name}
                onChange={(e) => setEditData({ ...editData, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome de usuário</Label>
              <Input
                placeholder="usuario123"
                value={editData.username}
                onChange={(e) => setEditData({ ...editData, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={editData.email}
                onChange={(e) => setEditData({ ...editData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nova Senha (deixe vazio para manter)</Label>
              <Input
                type="password"
                placeholder="Nova senha"
                value={editData.password}
                onChange={(e) => setEditData({ ...editData, password: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
