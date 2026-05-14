import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
    isVehicleRental: false,
    nacionalidade: "",
    estadoCivil: "",
    profissao: "",
    bairro: "",
    isManager: false,
    defaultInterestRate: "",
    autoBillingEnabled: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    const { defaultInterestRate, ...rest } = form;
    const parsedRate = defaultInterestRate.trim() === "" ? null : parseFloat(defaultInterestRate);
    onAdd({
      ...rest,
      active: true,
      defaultInterestRate: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null,
    });
    onClose();
  };

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Shared classes: full-width inputs, slightly smaller on mobile, comfortable on desktop
  const inputCls = "w-full max-w-full text-sm sm:text-base h-10 sm:h-11";
  const labelCls = "text-xs sm:text-sm font-medium";
  const fieldCls = "space-y-1.5 min-w-0";

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <Card className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Novo Cliente</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
            <div className={fieldCls}>
              <Label htmlFor="name" className={labelCls}>Nome completo</Label>
              <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: João Silva" required className={inputCls} autoComplete="name" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className={fieldCls}>
                <Label htmlFor="cpf" className={labelCls}>CPF</Label>
                <Input id="cpf" value={form.cpf} onChange={(e) => update("cpf", e.target.value)} placeholder="000.000.000-00" className={inputCls} inputMode="numeric" />
              </div>
              <div className={fieldCls}>
                <Label htmlFor="cnpj" className={labelCls}>CNPJ</Label>
                <Input id="cnpj" value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0000-00" className={inputCls} inputMode="numeric" />
              </div>
            </div>

            <div className={fieldCls}>
              <Label htmlFor="phone" className={labelCls}>Telefone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(00) 00000-0000" className={inputCls} inputMode="tel" autoComplete="tel" />
            </div>

            <div className={fieldCls}>
              <Label htmlFor="email" className={labelCls}>E-mail</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="joao@email.com" className={inputCls} inputMode="email" autoComplete="email" />
            </div>

            <div className={fieldCls}>
              <Label htmlFor="address" className={labelCls}>Endereço</Label>
              <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Rua, número, bairro" className={inputCls} autoComplete="street-address" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className={fieldCls}>
                <Label htmlFor="state" className={labelCls}>Estado</Label>
                <Input id="state" value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="SP" className={inputCls} maxLength={2} />
              </div>
              <div className={fieldCls}>
                <Label htmlFor="score" className={labelCls}>Score</Label>
                <Input id="score" value={form.score} onChange={(e) => update("score", e.target.value)} placeholder="0-1000" className={inputCls} inputMode="numeric" />
              </div>
            </div>

            <div className={fieldCls}>
              <Label htmlFor="defaultInterestRate" className={labelCls}>Taxa de juros padrão (% ao mês)</Label>
              <Input
                id="defaultInterestRate"
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={form.defaultInterestRate}
                onChange={(e) => update("defaultInterestRate", e.target.value)}
                placeholder="30"
                className={inputCls}
              />
              <p className="text-[11px] sm:text-xs text-muted-foreground break-words">
                Se vazio, será usado 30% ao criar novos empréstimos para este cliente.
              </p>
            </div>

            <div className={fieldCls}>
              <Label htmlFor="notes" className={labelCls}>Observações</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas sobre o cliente..." rows={2} className="w-full max-w-full text-sm sm:text-base resize-none" />
            </div>

            {/* Manager flag */}
            <div className="border border-border rounded-lg p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="isManager"
                  checked={form.isManager}
                  onCheckedChange={(checked) => update("isManager", !!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="isManager" className="font-medium cursor-pointer text-sm leading-tight">
                  Cliente é Gerente
                </Label>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1.5 ml-6 break-words">
                Habilita receber 10% de comissão sobre empréstimos atrelados.
              </p>
            </div>

            {/* Vehicle Rental Section */}
            <div className="border border-border rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="isVehicleRental"
                  checked={form.isVehicleRental}
                  onCheckedChange={(checked) => update("isVehicleRental", !!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="isVehicleRental" className="font-medium cursor-pointer text-sm leading-tight">
                  Aluguel de Veículos
                </Label>
              </div>

              {form.isVehicleRental && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className={fieldCls}>
                      <Label htmlFor="rg" className={labelCls}>RG</Label>
                      <Input id="rg" value={form.rg} onChange={(e) => update("rg", e.target.value)} placeholder="00.000.000-0" className={inputCls} inputMode="numeric" />
                    </div>
                    <div className={fieldCls}>
                      <Label htmlFor="city" className={labelCls}>Cidade</Label>
                      <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="São Paulo" className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className={fieldCls}>
                      <Label htmlFor="nacionalidade" className={labelCls}>Nacionalidade</Label>
                      <Input id="nacionalidade" value={form.nacionalidade} onChange={(e) => update("nacionalidade", e.target.value)} placeholder="Brasileiro(a)" className={inputCls} />
                    </div>
                    <div className={fieldCls}>
                      <Label htmlFor="estadoCivil" className={labelCls}>Estado civil</Label>
                      <Input id="estadoCivil" value={form.estadoCivil} onChange={(e) => update("estadoCivil", e.target.value)} placeholder="Solteiro(a)" className={inputCls} />
                    </div>
                  </div>
                  <div className={fieldCls}>
                    <Label htmlFor="profissao" className={labelCls}>Profissão</Label>
                    <Input id="profissao" value={form.profissao} onChange={(e) => update("profissao", e.target.value)} placeholder="Ex: Motorista" className={inputCls} />
                  </div>
                  <div className={fieldCls}>
                    <Label htmlFor="bairro" className={labelCls}>Bairro</Label>
                    <Input id="bairro" value={form.bairro} onChange={(e) => update("bairro", e.target.value)} placeholder="Centro" className={inputCls} />
                  </div>
                </div>
              )}
            </div>

            {/* Auto Billing Section */}
            <div className="border border-border rounded-lg p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="autoBillingEnabled"
                  checked={form.autoBillingEnabled}
                  onCheckedChange={(checked) => update("autoBillingEnabled", !!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="autoBillingEnabled" className="font-medium cursor-pointer text-sm leading-tight">
                  Receber cobrança automática por WhatsApp
                </Label>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1.5 ml-6 break-words">
                Se desmarcado, nenhum contrato deste cliente será cobrado automaticamente.
              </p>
            </div>

            <Button type="submit" className="w-full h-11 sm:h-11">
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Cliente
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
