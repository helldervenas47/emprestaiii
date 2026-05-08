import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, PiggyBank } from "lucide-react";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import { useHideValues } from "@/contexts/HideValuesContext";
import { PiggyBankList } from "./PiggyBankList";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  readOnly?: boolean;
}

export function PiggyBanksSummaryCard({ readOnly = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { piggyBanks, balances } = usePiggyBanks();
  const { mask } = useHideValues();

  const total = useMemo(() => {
    let sum = 0;
    for (const pb of piggyBanks) {
      const b = balances.get(pb.id);
      if (b) sum += b.balance;
    }
    return sum;
  }, [piggyBanks, balances]);

  return (
    <Card no3d className="animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PiggyBank className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">
              Cofrinhos
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · {piggyBanks.length} {piggyBanks.length === 1 ? "cofrinho" : "cofrinhos"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase leading-none">Saldo total</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{mask(fmt(total))}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="h-8 gap-1 text-xs"
            >
              {expanded ? (
                <><ChevronUp className="h-3.5 w-3.5" /> Recolher</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> Expandir</>
              )}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4">
            <PiggyBankList readOnly={readOnly} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
