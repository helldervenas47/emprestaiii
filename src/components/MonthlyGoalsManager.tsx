import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Pencil, Trash2, Plus, Percent, TrendingUp } from "lucide-react";
import { useMonthlyGoals, GoalType, currentMonthKey, formatMonthLabel } from "@/hooks/useMonthlyGoals";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: string; color: string }> = {
  interest_rate: { label: "Taxa de Juros Mensal", icon: Percent, unit: "%", color: "text-warning" },
  profit: { label: "Lucro no Período (% do Previsto)", icon: TrendingUp, unit: "%", color: "text-success" },
};

export function MonthlyGoalsManager() {
  const { goals, upsertGoal, deleteGoal, loading } = useMonthlyGoals();
  const [goalType, setGoalType] = useState<GoalType>("interest_rate");
  const [month, setMonth] = useState(currentMonthKey());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reset = () => {
    setEditId(null);
    setGoalType("interest_rate");
    setMonth(currentMonthKey());
    setValue("");
    setNotes("");
  };

  const handleSave = async () => {
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    await upsertGoal(goalType, month, num, notes);
    reset();
  };

  const handleEdit = (g: typeof goals[number]) => {
    setEditId(g.id);
    setGoalType(g.goalType);
    setMonth(g.month);
    setValue(String(g.targetValue));
    setNotes(g.notes || "");
  };

  return (
    <div className="space-y-4">
      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">{editId ? "Editar Meta" : "Nova Meta"}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)} disabled={!!editId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interest_rate">Taxa de Juros Mensal (%)</SelectItem>
                  <SelectItem value="profit">Lucro no Período (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mês/Ano</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={!!editId} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da meta ({GOAL_TYPE_META[goalType].unit})</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={goalType === "interest_rate" ? "Ex: 15" : "Ex: 5000"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!value}>
              <Plus className="h-4 w-4" /> {editId ? "Salvar" : "Criar Meta"}
            </Button>
            {editId && <Button variant="outline" onClick={reset}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>

      <Card no3d>
        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Metas cadastradas</h3>
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && goals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma meta cadastrada ainda.</p>
          )}
          <div className="space-y-2">
            {goals.map((g) => {
              const meta = GOAL_TYPE_META[g.goalType];
              const Icon = meta.icon;
              const formatted = g.goalType === "profit"
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(g.targetValue)
                : `${g.targetValue.toFixed(2)}%`;
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 bg-muted/20">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{meta.label}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">{formatMonthLabel(g.month)}</Badge>
                        <span className={`text-sm font-bold ${meta.color}`}>{formatted}</span>
                      </div>
                      {g.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.notes}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(g)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(g.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteGoal(deleteId); setDeleteId(null); } }}
        title="Excluir meta"
        description="Tem certeza que deseja excluir esta meta?"
      />
    </div>
  );
}
