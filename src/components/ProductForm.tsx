import { useState } from "react";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { Product } from "@/types/loan";

interface Props {
  onAdd: (product: Omit<Product, "id" | "createdAt">) => void | Promise<unknown>;
  onClose: () => void;
}

export function ProductForm({ onAdd, onClose }: Props) {
  const [form, setForm] = useState({ name: "", description: "", price: "", stock: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await onAdd({
        name: form.name,
        description: form.description,
        price: parseFloat(form.price) || 0,
        stock: parseInt(form.stock) || 0,
        active: true,
      });
      setShowSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Produto cadastrado!" />
      <Card className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Novo Produto</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome do Produto</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: Celular Samsung" required />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Descrição do produto..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Preço (R$)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => update("price", e.target.value)} placeholder="199.90" required />
              </div>
              <div>
                <Label>Estoque</Label>
                <Input type="number" value={form.stock} onChange={(e) => update("stock", e.target.value)} placeholder="10" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <Plus className="h-4 w-4 mr-2" /> Cadastrar Produto
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
