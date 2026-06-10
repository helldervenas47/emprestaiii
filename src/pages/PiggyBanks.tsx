import { useNavigate } from "react-router-dom";
import { ArrowLeft, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PiggyBankList } from "@/components/PiggyBankList";

export default function PiggyBanksPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" /> Cofrinhos
          </h1>
        </div>
        <PiggyBankList />
      </div>
    </div>
  );
}
