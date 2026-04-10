import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { Client } from "@/types/loan";

interface Props {
  onAdd: (client: Omit<Client, "id" | "createdAt">) => void;
  onClose: () => void;
}

export function ClientForm({ onAdd, onClose }: Props) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: "",
    cnpj: "",
    rg: "",
    address: "",
    city: "",
    state: "",
    score: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd({ ...form, active: true });
    onClose();
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Novo Cliente</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome Completo</Label>
              <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: João Silva" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" value={form.cpf} onChange={(e) => update("cpf", e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rg">RG</Label>
                <Input id="rg" value={form.rg} onChange={(e) => update("rg", e.target.value)} placeholder="00.000.000-0" />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="joao@email.com" />
            </div>
            <div>
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Rua, número, bairro" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="São Paulo" />
              </div>
              <div>
                <Label htmlFor="state">Estado</Label>
                <Input id="state" value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="SP" />
              </div>
              <div>
                <Label htmlFor="score">Score</Label>
                <Input id="score" value={form.score} onChange={(e) => update("score", e.target.value)} placeholder="0-1000" />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas sobre o cliente..." rows={2} />
            </div>
            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Cliente
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
