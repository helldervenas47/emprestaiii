import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Search } from "lucide-react";

const BoletoSearchTab = lazy(() =>
  import("./BoletoSearchTab").then((m) => ({ default: m.BoletoSearchTab })),
);
const MyBoletosSection = lazy(() =>
  import("./MyBoletosSection").then((m) => ({ default: m.MyBoletosSection })),
);

interface Props { readOnly?: boolean }

export function BoletosTab({ readOnly }: Props) {
  return (
    <Tabs defaultValue="meus" className="w-full">
      <TabsList className="w-full grid grid-cols-2 h-auto">
        <TabsTrigger value="meus" className="gap-2">
          <Wallet className="h-4 w-4" /> Meus boletos
        </TabsTrigger>
        <TabsTrigger value="consultar" className="gap-2">
          <Search className="h-4 w-4" /> Consultar
        </TabsTrigger>
      </TabsList>
      <TabsContent value="meus" className="mt-3">
        <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Carregando…</div>}>
          <MyBoletosSection readOnly={readOnly} />
        </Suspense>
      </TabsContent>
      <TabsContent value="consultar" className="mt-3">
        <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Carregando…</div>}>
          <BoletoSearchTab readOnly={readOnly} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
