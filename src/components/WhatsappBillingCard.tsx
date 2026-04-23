import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { DEFAULT_WHATSAPP_MESSAGES, type WhatsappBillingMessages } from "@/lib/whatsappBilling";

export function WhatsappBillingCard() {
  const { messages, loading, save } = useWhatsappBillingMessages();
  const [draft, setDraft] = useState<WhatsappBillingMessages>(messages);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(messages);
  }, [messages]);

  const dirty =
    draft.message_upcoming !== messages.message_upcoming ||
    draft.message_due_today !== messages.message_due_today ||
    draft.message_overdue !== messages.message_overdue;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(draft);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar as mensagens");
    else toast.success("Mensagens de cobrança salvas");
  };

  const resetDefaults = () => {
    setDraft(DEFAULT_WHATSAPP_MESSAGES);
  };

  return (
    <div className="space-y-4">
      <Card no3d>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Cobrança via WhatsApp</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure as mensagens enviadas ao clicar no botão <strong>WhatsApp</strong> nos cartões de
            empréstimo. Use as variáveis abaixo — elas serão preenchidas automaticamente:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="outline" className="text-[10px] font-mono">{"{nome}"}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{"{valor}"}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{"{data_vencimento}"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <MessageField
            label="A vencer"
            description="Enviada quando a parcela ainda não venceu."
            badgeClass="bg-muted text-muted-foreground border-border"
            value={draft.message_upcoming}
            onChange={(v) => setDraft((d) => ({ ...d, message_upcoming: v }))}
            disabled={loading}
          />
          <MessageField
            label="Vence hoje"
            description="Enviada quando a parcela vence no dia atual."
            badgeClass="bg-warning/10 text-warning border-warning/30"
            value={draft.message_due_today}
            onChange={(v) => setDraft((d) => ({ ...d, message_due_today: v }))}
            disabled={loading}
          />
          <MessageField
            label="Vencida"
            description="Enviada quando a parcela já está em atraso."
            badgeClass="bg-destructive/10 text-destructive border-destructive/20"
            value={draft.message_overdue}
            onChange={(v) => setDraft((d) => ({ ...d, message_overdue: v }))}
            disabled={loading}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={loading || saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> Restaurar padrão
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || loading || saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando…" : "Salvar mensagens"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageField({
  label,
  description,
  badgeClass,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  badgeClass: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-xs ${badgeClass}`}>{label}</Badge>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        disabled={disabled}
        className="text-sm"
      />
      <Label className="text-[10px] text-muted-foreground">
        {value.length} caracteres
      </Label>
    </div>
  );
}
