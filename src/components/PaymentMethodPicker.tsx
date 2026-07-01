import { lazy, Suspense, useMemo } from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { Banknote, CreditCard } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePaymentMethods, type PaymentMethod } from "@/hooks/usePaymentMethods";

interface Props {
  value: string | null | undefined;
  onChange: (id: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
  /** Quando true, mostra um aviso de "obrigatório" se vazio. */
  showError?: boolean;
}

// Converte "CreditCard" (PascalCase) -> "credit-card" (kebab-case) usado por dynamicIconImports
function toKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const iconCache = new Map<string, React.LazyExoticComponent<React.ComponentType<{ className?: string }>>>();

function DynamicIcon({ name, className }: { name: string | null; className?: string }) {
  if (!name) return <CreditCard className={className} />;
  const key = toKebab(name);
  const loader = (dynamicIconImports as Record<string, () => Promise<{ default: React.ComponentType<{ className?: string }> }>>)[key];
  if (!loader) return <CreditCard className={className} />;
  let Comp = iconCache.get(key);
  if (!Comp) {
    Comp = lazy(loader);
    iconCache.set(key, Comp);
  }
  return (
    <Suspense fallback={<CreditCard className={className} />}>
      <Comp className={className} />
    </Suspense>
  );
}

export function PaymentMethodPicker({ value, onChange, required, label = "Forma de pagamento", className, showError }: Props) {
  const { activeMethods } = usePaymentMethods();
  const methods = useMemo(
    () => [...activeMethods].sort((a, b) => a.sortOrder - b.sortOrder),
    [activeMethods],
  );
  const isInvalid = required && showError && !value;

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="flex items-center gap-2">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => {
          const selected = m.id === value;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-all touch-manipulation min-h-[40px]",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-input bg-background hover:bg-accent",
              )}
            >
              <DynamicIcon name={m.icon} className="h-4 w-4" />
              <span>{m.name}</span>
              {m.kind === "cash" ? (
                <Banknote className={cn("h-3.5 w-3.5", selected ? "opacity-90" : "text-success")} />
              ) : null}
            </button>
          );
        })}
      </div>
      {isInvalid && (
        <p className="text-xs text-destructive">Selecione a forma de pagamento</p>
      )}
    </div>
  );
}

export function paymentMethodKind(method?: PaymentMethod | null): "account" | "cash" {
  return method?.kind === "cash" ? "cash" : "account";
}
