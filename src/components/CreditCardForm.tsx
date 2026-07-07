import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Plus, CreditCard as CreditCardIcon, Wifi } from "lucide-react";
import { BANKS, BRANDS, getBank, brandLabel } from "@/lib/creditCardBanks";
import { CreditCard, CreditCardInput } from "@/hooks/useCreditCards";

interface Props {
  initial?: CreditCard;
  onSave: (input: CreditCardInput) => void | Promise<void>;
  onClose: () => void;
}

export function CreditCardForm({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<CreditCardInput>({
    nickname: initial?.nickname ?? "",
    bank: initial?.bank ?? "nubank",
    brand: initial?.brand ?? "visa",
    lastFour: initial?.lastFour ?? "",
    creditLimit: initial?.creditLimit ?? 0,
    closingDay: initial?.closingDay ?? 1,
    dueDay: initial?.dueDay ?? 10,
    active: initial?.active ?? true,
  });

  useEffect(() => {
    if (initial) {
      setForm({
        nickname: initial.nickname,
        bank: initial.bank,
        brand: initial.brand,
        lastFour: initial.lastFour,
        creditLimit: initial.creditLimit,
        closingDay: initial.closingDay,
        dueDay: initial.dueDay,
        active: initial.active ?? true,
      });
    }
  }, [initial]);

  const update = <K extends keyof CreditCardInput>(k: K, v: CreditCardInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bank) return;
    await onSave({
      ...form,
      lastFour: form.lastFour.replace(/\D/g, "").slice(0, 4),
      creditLimit: Number(form.creditLimit) || 0,
      closingDay: Math.max(1, Math.min(31, Number(form.closingDay) || 1)),
      dueDay: Math.max(1, Math.min(31, Number(form.dueDay) || 1)),
    });
    onClose();
  };

  // Preview ao vivo
  const previewCard: CreditCard = {
    id: "preview",
    nickname: form.nickname,
    bank: form.bank,
    brand: form.brand,
    lastFour: form.lastFour || "0000",
    creditLimit: Number(form.creditLimit) || 0,
    closingDay: Number(form.closingDay) || 1,
    dueDay: Number(form.dueDay) || 1,
    active: form.active ?? true,
  };

  return (
    <div
      className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card no3d onClick={(e) => e.stopPropagation()} className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <div className={`${bank.gradient} ${bank.textClass} relative overflow-hidden`}>
          <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-black/25 blur-3xl" />

          <div className="relative flex items-center justify-between px-5 pt-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
            <div className="flex items-center gap-2">
              <CreditCardIcon className="h-5 w-5 opacity-95" />
              <div>
                <p className="text-[11px] opacity-80 leading-none">
                  {initial ? "Editar cartão" : "Novo cartão"}
                </p>
                <p className="font-bold text-base leading-tight">{bank.name}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Fechar"
              className={`${bank.textClass} hover:bg-white/15`}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="relative px-5 mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-9 rounded-md bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] shadow-inner border border-[hsl(45,90%,80%)]/40" />
              <Wifi className="h-3.5 w-3.5 rotate-90 opacity-80" />
            </div>
            <div className="text-right">
              <p className="font-mono text-xs opacity-95 tracking-[0.2em]">
                •••• {form.lastFour || "••••"}
              </p>
              <p className="text-[10px] italic font-bold tracking-wider opacity-90">
                {brandLabel(form.brand)}
              </p>
            </div>
          </div>

          <div className="relative px-5 pt-4 pb-5">
            <p className="font-medium text-sm opacity-90 truncate">
              {form.nickname || "Sem apelido"}
            </p>
            <p className="text-[11px] opacity-75 mt-0.5">
              Limite R$ {(Number(form.creditLimit) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {" · "}Fecha dia {form.closingDay || "—"} · Vence dia {form.dueDay || "—"}
            </p>
          </div>
        </div>
        <CardContent className="pt-5">

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Banco</Label>
              <Select value={form.bank} onValueChange={(v) => update("bank", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`${b.gradient} ${b.textClass} h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold`}>
                          {b.short}
                        </span>
                        {b.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="nickname">Apelido (opcional)</Label>
              <Input
                id="nickname"
                value={form.nickname}
                onChange={(e) => update("nickname", e.target.value)}
                placeholder="Ex: Roxinho do dia a dia"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bandeira</Label>
                <Select value={form.brand} onValueChange={(v) => update("brand", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRANDS.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="lastFour">Últimos 4 dígitos</Label>
                <Input
                  id="lastFour"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.lastFour}
                  onChange={(e) => update("lastFour", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="1234"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="limit">Limite (R$)</Label>
              <Input
                id="limit"
                type="number"
                step="0.01"
                min="0"
                value={form.creditLimit || ""}
                onChange={(e) => update("creditLimit", Number(e.target.value))}
                placeholder="5000.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="closing">Fecha dia</Label>
                <Input
                  id="closing"
                  type="number"
                  min="1"
                  max="31"
                  value={form.closingDay}
                  onChange={(e) => update("closingDay", Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="due">Vence dia</Label>
                <Input
                  id="due"
                  type="number"
                  min="1"
                  max="31"
                  value={form.dueDay}
                  onChange={(e) => update("dueDay", Number(e.target.value))}
                />
              </div>
            </div>

            {initial && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="active" className="text-sm font-medium">
                    Cartão ativo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cartões inativos ficam ocultos das listagens
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={form.active ?? true}
                  onCheckedChange={(v) => update("active", v)}
                />
              </div>
            )}

            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              {initial ? "Salvar Alterações" : "Cadastrar Cartão"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
