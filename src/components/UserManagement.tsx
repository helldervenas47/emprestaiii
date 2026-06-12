import { useState, useEffect } from "react";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/userClient";
import { useClients } from "@/hooks/useClients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Shield, UserPlus, Pencil, ChevronDown, Settings2, Link2, CreditCard, Eye } from "lucide-react";
import { toast } from "sonner";
import { useViewAsUser } from "@/hooks/useViewAsUser";
import { useAuth } from "@/hooks/useAuth";
import { APP_TABS, APP_TAB_IDS, sanitizeAllowedTabs } from "@/lib/appTabs";

interface ManagedUser {
  id: string;
  email: string;
  display_name: string;
  username: string | null;
  role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_active: boolean;
  allowed_tabs: string[] | null;
  linked_client_ids: string[];
  plan_id?: string;
  owner_id?: string | null;
}

const ALL_TABS = APP_TABS;

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"mine" | "subscribers">("mine");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<ManagedUser | null>(null);
  const [permTabs, setPermTabs] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [clientLinkUser, setClientLinkUser] = useState<ManagedUser | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [savingClientLinks, setSavingClientLinks] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const { clients } = useClients();
  const [creating, setCreating] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const isMobile = useIsMobileOrTablet();
  const [saving, setSaving] = useState(false);
  const { user: currentUser, role: currentRole } = useAuth();
  const isAdmin = currentRole === "admin";
  const { startViewing } = useViewAsUser();

  const handleViewAs = async (target: ManagedUser) => {
    if (target.id === currentUser?.id) {
      toast.info("Você já está logado nesta conta");
      return;
    }
    if (!confirm(`Entrar em modo visualização (somente leitura) como "${target.display_name}"?\n\nVocê poderá ver todos os dados desta conta, mas não poderá alterar nada.`)) return;
    const { error } = await startViewing(target.id);
    if (error) toast.error(error);
  };

  // Plan selection for admins
  const [planUser, setPlanUser] = useState<ManagedUser | null>(null);
  const [planProductId, setPlanProductId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<{ id: string; name: string; product_id: string }[]>([]);
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
    if (!session) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "list" },
    });

    if (error || data?.error) {
      const errMsg = data?.error || "Erro ao carregar usuários";
      if (errMsg === "Não autorizado") {
        toast.error("Sessão expirada. Faça login novamente.");
        await supabase.auth.signOut();
      } else {
        toast.error(errMsg);
      }
    } else {
      const usersList = data.users || [];
      // Fetch plans for each user
      if (usersList.length > 0) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("user_id, product_id")
          .eq("environment", "sandbox")
          .in("user_id", usersList.map((u: ManagedUser) => u.id));
        
        const planMap = new Map(subs?.map((s) => [s.user_id, s.product_id]) || []);
        
        usersList.forEach((u: ManagedUser) => {
          u.plan_id = planMap.get(u.id) || "free_plan";
        });
      }
      setUsers(usersList);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.password || !formData.role) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
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

  const openClientLinks = (user: ManagedUser) => {
    setClientLinkUser(user);
    setSelectedClientIds(user.linked_client_ids || []);
    setClientSearch("");
  };

  const handleToggleClient = (clientId: string) => {
    setSelectedClientIds(prev =>
      prev.includes(clientId) ? prev.filter(c => c !== clientId) : [...prev, clientId]
    );
  };

  const handleSaveClientLinks = async () => {
    if (!clientLinkUser) return;
    setSavingClientLinks(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "update_client_links", user_id: clientLinkUser.id, client_ids: selectedClientIds },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao salvar vínculos");
    } else {
      toast.success("Vínculos de clientes atualizados!");
      setClientLinkUser(null);
      fetchUsers();
    }
    setSavingClientLinks(false);
  };

  const openPermissions = (user: ManagedUser) => {
    setPermissionsUser(user);
    // Sanitize: drop tab ids that no longer exist in the app, default to all current tabs.
    setPermTabs(user.allowed_tabs ? sanitizeAllowedTabs(user.allowed_tabs) : APP_TAB_IDS.slice());
  };

  const handleToggleTab = (tabId: string) => {
    setPermTabs(prev =>
      prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId]
    );
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setSavingPerms(true);
    const cleaned = sanitizeAllowedTabs(permTabs);
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "update_permissions", user_id: permissionsUser.id, allowed_tabs: cleaned },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao salvar permissões");
    } else {
      toast.success("Permissões atualizadas!");
      setPermissionsUser(null);
      fetchUsers();
    }
    setSavingPerms(false);
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

  const handleToggleActive = async (userId: string, active: boolean) => {
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "toggle_active", user_id: userId, active },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao alterar status");
    } else {
      toast.success(active ? "Usuário ativado!" : "Usuário desativado!");
      fetchUsers();
    }
  };

  const PRODUCT_ID_MAP: Record<string, string> = {
    free_plan: "Free",
    basico_plan: "Básico",
    profissional_plan: "Profissional",
    empresarial_plan: "Empresarial",
  };

  const openPlanSelector = async (user: ManagedUser) => {
    setPlanUser(user);
    // Fetch current subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("product_id")
      .eq("user_id", user.id)
      .maybeSingle();
    setPlanProductId(sub?.product_id || "free_plan");
  };

  const handleSavePlan = async () => {
    if (!planUser) return;
    setSavingPlan(true);

    // FIX: Only update the selected user. Previously this would cascade to all
    // non-admin users in the visible list, which leaks plan changes across tenants.
    const allUserIds = [planUser.id];

    // Update both environments for all users
    let hasError = false;
    for (const uid of allUserIds) {
      const { error: e1 } = await supabase
        .from("subscriptions")
        .update({ product_id: planProductId })
        .eq("user_id", uid)
        .eq("environment", "sandbox");
      const { error: e2 } = await supabase
        .from("subscriptions")
        .update({ product_id: planProductId })
        .eq("user_id", uid)
        .eq("environment", "live");
      if (e1 || e2) hasError = true;
    }

    // Sync tab permissions based on plan for all users
    const planNameMap: Record<string, string> = {
      free_plan: "Free",
      basico_plan: "Básico",
      profissional_plan: "Profissional",
      empresarial_plan: "Empresarial",
    };
    const planName = planNameMap[planProductId];
    if (planName) {
      const { data: plan } = await supabase
        .from("plans")
        .select("allowed_tabs")
        .eq("name", planName)
        .eq("active", true)
        .maybeSingle();

      if (plan?.allowed_tabs) {
        for (const uid of allUserIds) {
          const { data: existing } = await supabase
            .from("user_tab_permissions" as any)
            .select("id")
            .eq("user_id", uid)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("user_tab_permissions" as any)
              .update({ allowed_tabs: plan.allowed_tabs, updated_at: new Date().toISOString() })
              .eq("user_id", uid);
          } else {
            await supabase
              .from("user_tab_permissions" as any)
              .insert({ user_id: uid, allowed_tabs: plan.allowed_tabs });
          }
        }
      }
    }

    if (hasError) {
      toast.error("Erro ao atualizar plano");
    } else {
      toast.success("Plano atualizado para todos os usuários!");
      setPlanUser(null);
      fetchUsers();
    }
    setSavingPlan(false);
  };

  const roleBadgeVariant = (role: string | null) => {
    if (role === "admin") return "default";
    if (role === "cliente") return "secondary";
    if (role === "gerente") return "secondary";
    return "outline";
  };

  const roleLabel = (role: string | null) => {
    if (role === "admin") return "Admin";
    if (role === "cliente") return "Cliente";
    if (role === "gerente") return "Gerente";
    if (role === "visualizador") return "Visualizador";
    return "Sem papel";
  };

  const planBadgeVariant = (planId: string | undefined) => {
    if (planId === "empresarial_plan") return "default";
    if (planId === "profissional_plan") return "secondary";
    if (planId === "basico_plan") return "outline";
    return "outline";
  };

  const planLabel = (planId: string | undefined) => {
    if (planId === "empresarial_plan") return "Empresarial";
    if (planId === "profissional_plan") return "Profissional";
    if (planId === "basico_plan") return "Básico";
    return "Free";
  };

  const normalizeUserText = (value: string | null | undefined) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const isLegacyUserCreatedByMe = (user: ManagedUser) => {
    const text = normalizeUserText(`${user.display_name} ${user.username || ""} ${user.email || ""}`);
    return (
      (text.includes("renan") && text.includes("mota")) ||
      (text.includes("thiago") && text.includes("ferraz")) ||
      (text.includes("helder") && text.includes("venas"))
    );
  };

  const isCreatedByCurrentUser = (user: ManagedUser) =>
    (user.owner_id && currentUser?.id && user.owner_id === currentUser.id) || isLegacyUserCreatedByMe(user);

  const mineUsers = users.filter(isCreatedByCurrentUser);
  const subscriberUsers = users.filter((u) => !isCreatedByCurrentUser(u) && (!u.owner_id || u.owner_id === u.id));
  const displayedUsers = activeTab === "mine" ? mineUsers : subscriberUsers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Usuários ({displayedUsers.length})
        </h2>
        <Button onClick={() => setShowCreateForm(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <div className="inline-flex rounded-md border border-border bg-muted/30 p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("mine")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Criados por mim ({mineUsers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("subscribers")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === "subscribers" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Assinantes ({subscriberUsers.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : displayedUsers.length === 0 ? (
        <Card no3d>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum usuário encontrado
          </CardContent>
        </Card>
      ) : (
        isMobile ? (
          <div className="space-y-2">
            {displayedUsers.map((user) => {
              const isExpanded = expandedUserId === user.id;
              return (
                <Card no3d key={user.id} className="overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-3 text-left"
                    onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{user.display_name}</p>
                        <Badge variant={planBadgeVariant(user.plan_id)} className="text-[10px] px-1.5 py-0 shrink-0">
                          {planLabel(user.plan_id)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{user.username || "—"}</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
                      <div className="space-y-1 text-sm">
                        <p className="text-muted-foreground"><span className="font-medium text-foreground">Email:</span> {user.email}</p>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Status:</span>
                          <div className="flex items-center gap-1.5">
                            <Switch
                              checked={user.is_active}
                              onCheckedChange={(checked) => handleToggleActive(user.id, checked)}
                            />
                            <span className={`text-xs ${user.is_active ? "text-success" : "text-destructive"}`}>
                              {user.is_active ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Papel:</span>
                          <Select value={user.role || ""} onValueChange={(val) => handleUpdateRole(user.id, val)}>
                            <SelectTrigger className="w-[130px] h-7 text-xs">
                              <SelectValue>
                                <Badge variant={roleBadgeVariant(user.role)}>{roleLabel(user.role)}</Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-3 w-3" /> Admin</div></SelectItem>
                              <SelectItem value="cliente">Cliente</SelectItem>
                              <SelectItem value="gerente">Gerente</SelectItem>
                              <SelectItem value="visualizador">Visualizador</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {user.role === "admin" && isAdmin && (
                          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openPlanSelector(user)}>
                            <CreditCard className="h-3.5 w-3.5" /> Plano
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openClientLinks(user)}>
                          <Link2 className="h-3.5 w-3.5" /> Clientes
                          {user.linked_client_ids?.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{user.linked_client_ids.length}</Badge>}
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => handleViewAs(user)} title="Visualizar como (somente leitura)">
                          <Eye className="h-3.5 w-3.5" /> Ver como
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(user.id, user.display_name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
        <Card no3d>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {displayedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {user.display_name}
                        <Badge variant={planBadgeVariant(user.plan_id)} className="text-[10px] px-1.5 py-0">
                          {planLabel(user.plan_id)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.username || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={user.is_active}
                          onCheckedChange={(checked) => handleToggleActive(user.id, checked)}
                        />
                        <span className={`text-xs ${user.is_active ? "text-success" : "text-destructive"}`}>
                          {user.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
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
                          <SelectItem value="cliente">Cliente</SelectItem>
                          <SelectItem value="gerente">Gerente</SelectItem>
                          <SelectItem value="visualizador">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {user.role === "admin" && isAdmin ? (
                          <Button variant="ghost" size="icon" onClick={() => openPlanSelector(user)} className="h-8 w-8" title="Definir plano">
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="h-8 w-8" />
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openClientLinks(user)} className="h-8 w-8" title="Vincular clientes">
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleViewAs(user)} className="h-8 w-8" title="Visualizar como (somente leitura)">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="h-8 w-8">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id, user.display_name)} className="h-8 w-8 text-destructive hover:text-destructive">
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
        )
      )}

      {/* Create user dialog */}
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
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com (opcional)"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
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

      {/* Edit user dialog */}
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

      {/* Tab permissions dialog */}
      <Dialog open={!!permissionsUser} onOpenChange={(open) => !open && setPermissionsUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permissões de Abas — {permissionsUser?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ative ou desative as abas que este usuário pode visualizar.
            </p>
            <div className="space-y-3">
              {ALL_TABS.map((tab) => (
                <div key={tab.id} className="flex items-center justify-between py-1">
                  <Label className="text-sm font-medium">{tab.label}</Label>
                  <Switch
                    checked={permTabs.includes(tab.id)}
                    onCheckedChange={() => handleToggleTab(tab.id)}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setPermissionsUser(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePermissions} disabled={savingPerms}>
                {savingPerms ? "Salvando..." : "Salvar Permissões"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client links dialog */}
      <Dialog open={!!clientLinkUser} onOpenChange={(open) => !open && setClientLinkUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Clientes — {clientLinkUser?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione os clientes que este usuário poderá visualizar. Sem vínculo = acesso a todos.
            </p>
            <Input
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <ScrollArea className="h-[300px] border rounded-md p-2">
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {clients
                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                    .map((client) => (
                      <div key={client.id} className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-muted/50">
                        <Checkbox
                          checked={selectedClientIds.includes(client.id)}
                          onCheckedChange={() => handleToggleClient(client.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{client.name}</p>
                          {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{selectedClientIds.length} selecionado(s)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedClientIds([])}>Limpar</Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedClientIds(clients.map(c => c.id))}>Todos</Button>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setClientLinkUser(null)}>Cancelar</Button>
              <Button onClick={handleSaveClientLinks} disabled={savingClientLinks}>
                {savingClientLinks ? "Salvando..." : "Salvar Vínculos"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan selector dialog (admin only) */}
      <Dialog open={!!planUser} onOpenChange={(open) => !open && setPlanUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Definir Plano — {planUser?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o plano deste administrador. Sub-usuários herdarão o mesmo plano.
            </p>
            <Select value={planProductId} onValueChange={setPlanProductId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRODUCT_ID_MAP).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPlanUser(null)}>Cancelar</Button>
              <Button onClick={handleSavePlan} disabled={savingPlan}>
                {savingPlan ? "Salvando..." : "Salvar Plano"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
