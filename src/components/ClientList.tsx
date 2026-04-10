import { useState } from "react";
import { Client } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, User, Phone, Mail, MapPin, Search, Users, Pencil, X, Check, ToggleLeft, ToggleRight } from "lucide-react";

interface Props {
  clients: Client[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => void;
}

export function ClientList({ clients, onDelete, onUpdate }: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", cpf: "", address: "", notes: "" });

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.cpf.includes(search) ||
      c.phone.includes(search)
  );

  const startEdit = (client: Client) => {
    setEditingId(client.id);
    setEditForm({ name: client.name, phone: client.phone, email: client.email, cpf: client.cpf, address: client.address, notes: client.notes || "" });
  };

  const saveEdit = (id: string) => {
    onUpdate(id, editForm);
    setEditingId(null);
  };

  const updateField = (field: string, value: string) => setEditForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum resultado encontrado"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((client) => (
            <Card key={client.id} className={`hover:shadow-md transition-shadow ${!client.active ? "opacity-60" : ""}`}>
              <CardContent className="p-5">
                {editingId === client.id ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={editForm.name} onChange={(e) => updateField("name", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">CPF</Label>
                        <Input value={editForm.cpf} onChange={(e) => updateField("cpf", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Telefone</Label>
                        <Input value={editForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input value={editForm.email} onChange={(e) => updateField("email", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Endereço</Label>
                      <Input value={editForm.address} onChange={(e) => updateField("address", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Observações</Label>
                      <Textarea value={editForm.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(client.id)}>
                        <Check className="h-4 w-4 mr-1" /> Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center">
                          <User className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{client.name}</h3>
                            <Badge variant="outline" className={client.active ? "bg-success/10 text-success border-success/20 text-xs" : "bg-muted text-muted-foreground border-border text-xs"}>
                              {client.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          {client.cpf && <p className="text-xs text-muted-foreground">CPF: {client.cpf}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => onUpdate(client.id, { active: !client.active })}
                          title={client.active ? "Desativar" : "Ativar"}
                        >
                          {client.active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(client)} title="Editar">
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(client.id)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      {client.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /><span>{client.phone}</span></div>}
                      {client.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /><span>{client.email}</span></div>}
                      {client.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /><span>{client.address}</span></div>}
                    </div>
                    {client.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{client.notes}"</p>}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
