import { useMemo, useState } from "react";
import { Loan, Client } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { calculateInstallment } from "@/hooks/useLoans";
import { AlertTriangle, MessageCircle, Search, Phone, Calendar, DollarSign } from "lucide-react";

interface Props {
  loans: Loan[];
  clients: Client[];
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function getOverdueInstallments(loan: Loan): { number: number; dueDate: string; amount: number }[] {
  const installmentAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const startDate = new Date(loan.startDate + "T00:00:00");
  const now = new Date();
  const overdue: { number: number; dueDate: string; amount: number }[] = [];

  for (let i = loan.paidInstallments; i < loan.installments; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    if (dueDate < now) {
      overdue.push({
        number: i + 1,
        dueDate: dueDate.toISOString().split("T")[0],
        amount: installmentAmount,
      });
    }
  }
  return overdue;
}

function buildWhatsAppMessage(loan: Loan, overdueInstallments: { number: number; dueDate: string; amount: number }[]): string {
  const totalOverdue = overdueInstallments.reduce((s, i) => s + i.amount, 0);
  const lines = [
    `Olá ${loan.borrowerName}, tudo bem?`,
    ``,
    `Gostaria de informar que você possui *${overdueInstallments.length} parcela(s) em atraso* referente ao seu empréstimo.`,
    ``,
    ...overdueInstallments.map(
      (inst) => `• Parcela ${inst.number} — Vencimento: ${new Date(inst.dueDate).toLocaleDateString("pt-BR")} — Valor: ${formatCurrency(inst.amount)}`
    ),
    ``,
    `*Total em atraso: ${formatCurrency(totalOverdue)}*`,
    ``,
    `Por favor, entre em contato para regularizar sua situação.`,
    `Obrigado!`,
  ];
  return lines.join("\n");
}

function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function OverdueLoans({ loans, clients }: Props) {
  const [search, setSearch] = useState("");

  const overdueData = useMemo(() => {
    return loans
      .filter((l) => l.status !== "paid")
      .map((loan) => {
        const overdueInstallments = getOverdueInstallments(loan);
        if (overdueInstallments.length === 0) return null;
        const client = clients.find((c) => c.id === loan.borrowerId);
        const phone = client?.phone || "";
        const daysOverdue = getDaysOverdue(overdueInstallments[0].dueDate);
        const totalOverdue = overdueInstallments.reduce((s, i) => s + i.amount, 0);
        return { loan, client, phone, overdueInstallments, daysOverdue, totalOverdue };
      })
      .filter(Boolean)
      .filter((item) => item!.loan.borrowerName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b!.daysOverdue - a!.daysOverdue) as NonNullable<typeof overdueData[number]>[];
  }, [loans, clients, search]);

  const totalOverdueAmount = overdueData.reduce((s, d) => s + d.totalOverdue, 0);

  const handleSendWhatsApp = (item: (typeof overdueData)[number]) => {
    const message = buildWhatsAppMessage(item.loan, item.overdueInstallments);
    const phone = formatPhone(item.phone);
    if (!phone) {
      alert("Este cliente não possui telefone cadastrado. Vincule um cliente com telefone ao empréstimo.");
      return;
    }
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const handleSendAll = () => {
    const withPhone = overdueData.filter((d) => formatPhone(d.phone));
    if (withPhone.length === 0) {
      alert("Nenhum cliente com telefone cadastrado encontrado.");
      return;
    }
    withPhone.forEach((item, index) => {
      setTimeout(() => handleSendWhatsApp(item), index * 1000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Empréstimos Atrasados
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {overdueData.length} empréstimo(s) em atraso — Total: {formatCurrency(totalOverdueAmount)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
          {overdueData.length > 0 && (
            <Button onClick={handleSendAll} className="bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,38%)] text-white">
              <MessageCircle className="h-4 w-4 mr-1" />
              Notificar Todos
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {overdueData.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground font-medium">Nenhum empréstimo em atraso!</p>
            <p className="text-sm text-muted-foreground mt-1">Todos os pagamentos estão em dia.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {overdueData.map((item) => (
            <Card key={item.loan.id} className="border-destructive/20">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-foreground">{item.loan.borrowerName}</p>
                      <Badge variant="destructive" className="text-xs">
                        {item.daysOverdue} dia(s) atraso
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatCurrency(item.totalOverdue)} em atraso
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {item.overdueInstallments.length} parcela(s)
                      </span>
                      {item.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {item.phone}
                        </span>
                      )}
                    </div>
                    {/* Installment details */}
                    <div className="mt-2 space-y-1">
                      {item.overdueInstallments.map((inst) => (
                        <p key={inst.number} className="text-xs text-muted-foreground">
                          Parcela {inst.number} — Venc. {new Date(inst.dueDate).toLocaleDateString("pt-BR")} — {formatCurrency(inst.amount)}
                        </p>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleSendWhatsApp(item)}
                    disabled={!formatPhone(item.phone)}
                    className="bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,38%)] text-white shrink-0"
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    Enviar WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            💡 Os botões abrem o WhatsApp Web com uma mensagem pré-formatada. Para envio automático diário, conecte o Twilio nas configurações.
            Certifique-se de que os empréstimos estejam vinculados a clientes com telefone cadastrado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
