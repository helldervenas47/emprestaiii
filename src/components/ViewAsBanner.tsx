import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewAsUser } from "@/hooks/useViewAsUser";

export function ViewAsBanner() {
  const { session, isViewingAs, stopViewing } = useViewAsUser();

  if (!isViewingAs || !session) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-warning text-warning-foreground border-b border-warning/50 shadow-md">
      <div className="container mx-auto px-3 py-2 flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-medium truncate">
            Modo visualização: <strong>{session.target_name}</strong>
          </span>
          <span className="hidden sm:inline text-xs opacity-80">(somente leitura)</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 bg-background/20 border-warning-foreground/30 hover:bg-background/30"
          onClick={stopViewing}
        >
          <X className="h-3.5 w-3.5" /> Sair
        </Button>
      </div>
    </div>
  );
}
