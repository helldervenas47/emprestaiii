import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personalIconMap, personalCategoryColors } from "@/lib/personalExpenseCategories";
import { cn } from "@/lib/utils";
import { Check, Plus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (cat: { id: string; name: string; icon: string; color: string }) => void;
  createCategory: (input: { name: string; icon: string; color: string }) => Promise<{ id: string; name: string; icon: string; color: string } | null>;
}

const iconNames = Object.keys(personalIconMap);

export function PersonalCategoryCreator({ open, onOpenChange, onCreated, createCategory }: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("Package");
  const [color, setColor] = useState<string>(personalCategoryColors[0]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const created = await createCategory({ name: name.trim(), icon, color });
    setSaving(false);
    if (created) {
      onCreated(created);
      setName("");
      setIcon("Package");
      setColor(personalCategoryColors[0]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cat-name">Nome</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Academia, Streaming, Viagem..."
              maxLength={40}
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-2 block">Cor</Label>
            <div className="flex flex-wrap gap-2">
              {personalCategoryColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform",
                    color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: `hsl(${c})` }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Ícone</Label>
            <div className="grid grid-cols-8 gap-2 rounded-md border border-border p-2 max-h-[180px] overflow-y-auto">
              {iconNames.map((n) => {
                const Ico = personalIconMap[n];
                const selected = icon === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIcon(n)}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted",
                    )}
                    title={n}
                  >
                    <Ico className="h-4 w-4" style={{ color: `hsl(${color})` }} />
                    {selected && (
                      <Check className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary text-primary-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md"
              style={{ backgroundColor: `hsl(${color} / 0.15)` }}
            >
              {(() => {
                const Ico = personalIconMap[icon] ?? personalIconMap.Package;
                return <Ico className="h-4 w-4" style={{ color: `hsl(${color})` }} />;
              })()}
            </div>
            <span className="text-sm font-medium">{name.trim() || "Pré-visualização"}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || saving}>
            <Plus className="mr-2 h-4 w-4" />
            Criar categoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
