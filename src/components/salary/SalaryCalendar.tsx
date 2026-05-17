import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Wallet, CalendarClock, Cake } from "lucide-react";
import { addMonths, endOfMonth, format, isSameDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEmployees } from "@/hooks/useEmployees";
import { usePayrolls } from "@/hooks/usePayrolls";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SalaryCalendar() {
  const { employees } = useEmployees();
  const { payrolls } = usePayrolls();
  const [cursor, setCursor] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const arr: Date[] = [];
    const startDay = start.getDay();
    for (let i = 0; i < startDay; i++) arr.push(null as any);
    for (let d = 1; d <= end.getDate(); d++) arr.push(new Date(start.getFullYear(), start.getMonth(), d));
    return arr;
  }, [cursor]);

  const monthCompetence = format(cursor, "yyyy-MM");
  const monthPayrolls = payrolls.filter((p) => p.competence === monthCompetence);

  const eventsForDay = (date: Date) => {
    const items: { type: "pagamento" | "vencimento" | "aniversario"; label: string; amount?: number }[] = [];
    // pagamentos efetuados
    monthPayrolls.forEach((p) => {
      if (p.paidDate && isSameDay(parseISO(p.paidDate), date)) {
        const emp = employees.find((e) => e.id === p.employeeId);
        items.push({ type: "pagamento", label: emp?.name ?? "Funcionário", amount: p.paidAmount });
      } else if (p.dueDate && isSameDay(parseISO(p.dueDate), date)) {
        const emp = employees.find((e) => e.id === p.employeeId);
        items.push({ type: "vencimento", label: emp?.name ?? "Funcionário", amount: p.netSalary });
      }
    });
    // aniversários (mês/dia)
    employees.forEach((e) => {
      if (!e.hireDate) return;
      const hd = parseISO(e.hireDate);
      if (hd.getDate() === date.getDate() && hd.getMonth() === date.getMonth()) {
        items.push({ type: "aniversario", label: `${e.name} (admissão)` });
      }
    });
    return items;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="font-semibold capitalize">{format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}</div>
        <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <Card><CardContent className="p-3">
        <div className="grid grid-cols-7 text-center text-[10px] uppercase text-muted-foreground mb-1">
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square" />;
            const events = eventsForDay(d);
            return (
              <div key={i} className="aspect-square rounded-md border border-border/40 p-1 text-[10px] overflow-hidden">
                <div className="font-semibold">{d.getDate()}</div>
                <div className="space-y-0.5">
                  {events.slice(0, 2).map((e, idx) => (
                    <div key={idx} className={`truncate flex items-center gap-0.5 ${
                      e.type === "pagamento" ? "text-emerald-600"
                      : e.type === "vencimento" ? "text-amber-600"
                      : "text-pink-500"
                    }`}>
                      {e.type === "pagamento" ? <Wallet className="h-2.5 w-2.5 shrink-0" />
                        : e.type === "vencimento" ? <CalendarClock className="h-2.5 w-2.5 shrink-0" />
                        : <Cake className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{e.label}</span>
                    </div>
                  ))}
                  {events.length > 2 && <div className="text-muted-foreground">+{events.length - 2}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>
    </div>
  );
}
