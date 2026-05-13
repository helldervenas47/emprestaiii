import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function evaluateStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const map: Record<number, Strength> = {
    0: { score: 0, label: "Muito fraca", color: "bg-destructive" },
    1: { score: 1, label: "Fraca", color: "bg-destructive" },
    2: { score: 2, label: "Razoável", color: "bg-amber-500" },
    3: { score: 3, label: "Forte", color: "bg-emerald-500" },
    4: { score: 4, label: "Excelente", color: "bg-emerald-500" },
  };
  return map[Math.min(score, 4) as 0 | 1 | 2 | 3 | 4];
}

const MIN_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;

export function ChangePasswordCard() {
  const { user, signOut } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);

  const strength = useMemo(() => evaluateStrength(next), [next]);

  const sameAsCurrent = next.length > 0 && next === current;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const locked = lockUntil !== null && Date.now() < lockUntil;

  const canSubmit =
    !loading &&
    !locked &&
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    !sameAsCurrent &&
    !mismatch &&
    confirm === next;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user?.email) return;
    setLoading(true);
    try {
      // 1) Validate current password by re-authenticating
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInErr) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= MAX_ATTEMPTS) {
          setLockUntil(Date.now() + COOLDOWN_MS);
          toast.error("Muitas tentativas inválidas. Aguarde 1 minuto e tente novamente.");
        } else {
          toast.error("Senha atual incorreta.");
        }
        return;
      }

      // 2) Update password (Supabase hashes server-side)
      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        toast.error(updateErr.message || "Erro ao atualizar senha.");
        return;
      }

      // 3) Optionally revoke other sessions
      if (revokeOthers) {
        try {
          await supabase.auth.signOut({ scope: "others" });
        } catch {
          /* não bloqueia o sucesso */
        }
      }

      toast.success("Senha alterada com sucesso!", {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setAttempts(0);
      setLockUntil(null);
    } catch (err: any) {
      toast.error(err?.message || "Falha inesperada ao alterar senha.");
    } finally {
      setLoading(false);
    }
  };

  const PwInput = ({
    id,
    label,
    value,
    onChange,
    show,
    setShow,
    autoComplete,
    error,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    setShow: (v: boolean) => void;
    autoComplete: string;
    error?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <div className="relative group">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={cn(
            "pr-10 transition-all duration-200",
            error && "border-destructive focus-visible:ring-destructive/40",
          )}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          tabIndex={-1}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-primary" /> Alteração de senha
        </CardTitle>
        <CardDescription>
          Atualize sua senha de acesso. Recomendamos uma senha forte e única.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PwInput
            id="cp-current"
            label="Senha atual"
            value={current}
            onChange={setCurrent}
            show={showCurrent}
            setShow={setShowCurrent}
            autoComplete="current-password"
          />
          <PwInput
            id="cp-next"
            label="Nova senha"
            value={next}
            onChange={setNext}
            show={showNext}
            setShow={setShowNext}
            autoComplete="new-password"
            error={
              tooShort
                ? `Mínimo de ${MIN_LENGTH} caracteres`
                : sameAsCurrent
                  ? "A nova senha deve ser diferente da atual"
                  : undefined
            }
          />

          {next.length > 0 && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
              <div className="flex h-1.5 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 rounded-full transition-all duration-300",
                      i < strength.score ? strength.color : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Força: <span className="font-medium text-foreground">{strength.label}</span>
              </p>
            </div>
          )}

          <PwInput
            id="cp-confirm"
            label="Confirmar nova senha"
            value={confirm}
            onChange={setConfirm}
            show={showConfirm}
            setShow={setShowConfirm}
            autoComplete="new-password"
            error={mismatch ? "As senhas não coincidem" : undefined}
          />

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium">Encerrar outras sessões</p>
                <p className="text-[11px] text-muted-foreground">
                  Desconecta esta conta dos outros dispositivos após salvar.
                </p>
              </div>
            </div>
            <Switch checked={revokeOthers} onCheckedChange={setRevokeOthers} />
          </div>

          {locked && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> Bloqueado temporariamente. Tente novamente em alguns segundos.
            </p>
          )}

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
              </>
            ) : (
              "Salvar nova senha"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
