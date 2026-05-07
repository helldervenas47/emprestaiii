import { useState } from "react";
import { Bell, Check, X, Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApprovalRequests, type ApprovalRequest } from "@/hooks/useApprovalRequests";
import { toast } from "@/lib/appToast";

const ALL_TABS = [
  { id: "overview", label: "Dashboard" },
  { id: "dashboard", label: "Empréstimos" },
  { id: "calendar", label: "Calendário" },
  { id: "clients", label: "Clientes" },
  { id: "products", label: "Vendas" },
  { id: "vehicles", label: "Veículos" },
  { id: "expenses", label: "Despesas" },
  { id: "overdue", label: "Relatório" },
];

type Filter = "pending" | "approved" | "rejected";

export function ApprovalRequestsButton() {
  const { requests, pendingCount, approve, reject } = useApprovalRequests();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [approving, setApproving] = useState<ApprovalRequest | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selRole, setSelRole] = useState<"admin" | "operador" | "visualizador">("visualizador");
  const [selTabs, setSelTabs] = useState<string[]>(ALL_TABS.map((t) => t.id));
  const [busy, setBusy] = useState(false);

  const filtered = requests.filter((r) => r.status === filter);

  const handleApprove = async () => {
    if (!approving) return;
    setBusy(true);
    const res = await approve(approving, { role: selRole, allowedTabs: selTabs });
    setBusy(false);
    if (res.ok) {
      toast.success("Usuário aprovado!");
      setApproving(null);
    } else {
      toast.error(res.error || "Erro ao aprovar");
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setBusy(true);
    const res = await reject(rejecting, rejectReason || undefined);
    setBusy(false);
    if (res.ok) {
      toast.success("Cadastro rejeitado");
      setRejecting(null);
      setRejectReason("");
    } else {
      toast.error(res.error || "Erro ao rejeitar");
    }
  };

  const toggleTab = (id: string) =>
    setSelTabs((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9" title="Solicitações de acesso">
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" /> Solicitações de acesso
            </SheetTitle>
          </SheetHeader>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="pending">
                Pendentes
                {pendingCount > 0 && <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">{pendingCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="approved">Aprovados</TabsTrigger>
              <TabsTrigger value="rejected">Rejeitados</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-4 space-y-2">
            {filtered.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum registro</CardContent></Card>
            ) : (
              filtered.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-3 space-y-2">
                    <div>
                      <p className="font-medium text-sm text-foreground">{r.display_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.email || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1">Cadastro: {formatDate(r.created_at)}</p>
                      {r.rejection_reason && (
                        <p className="text-xs text-destructive mt-1">Motivo: {r.rejection_reason}</p>
                      )}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          className="flex-1"
                          onClick={() => {
                            setApproving(r);
                            setSelRole("visualizador");
                            setSelTabs(ALL_TABS.map((t) => t.id));
                          }}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => setRejecting(r)}>
                          <X className="h-3.5 w-3.5 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Approve dialog with permissions */}
      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar usuário</DialogTitle>
            <DialogDescription>
              Defina o papel e as abas que <strong>{approving?.display_name || approving?.email}</strong> poderá acessar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={selRole} onValueChange={(v) => setSelRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="visualizador">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Abas permitidas</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border/50 rounded-md p-2">
                {ALL_TABS.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selTabs.includes(t.id)} onCheckedChange={() => toggleTab(t.id)} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)} disabled={busy}>Cancelar</Button>
            <Button variant="success" onClick={handleApprove} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar cadastro</DialogTitle>
            <DialogDescription>
              Deseja rejeitar o cadastro de <strong>{rejecting?.display_name || rejecting?.email}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ex: dados incompletos" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
