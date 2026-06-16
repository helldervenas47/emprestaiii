import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/userClient";
import { supabase as cloudSupabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, AlertCircle, IdCard, Phone } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { validateInviteCode } from "@/hooks/useInviteCodes";
import { toast } from "sonner";

const Cadastro = () => {
  const [searchParams] = useSearchParams();
  const planName = searchParams.get("plan") || "";
  const inviteCode = searchParams.get("invite") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [inviteState, setInviteState] = useState<{ checking: boolean; valid: boolean; owner_id?: string; require_approval?: boolean; reason?: string }>({ checking: !!inviteCode, valid: false });
  const navigate = useNavigate();
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  // Validate invite code on mount
  useEffect(() => {
    if (!inviteCode) {
      setInviteState({ checking: false, valid: false });
      return;
    }
    (async () => {
      const result = await validateInviteCode(inviteCode);
      setInviteState({ checking: false, ...result });
    })();
  }, [inviteCode]);

  const handleGoogleSignup = async () => {
    if (inviteCode && !inviteState.valid) {
      toast.error("Código de convite inválido");
      return;
    }
    setGoogleLoading(true);
    try {
      // Store invite context so we can apply it after OAuth redirect
      if (inviteCode && inviteState.valid) {
        sessionStorage.setItem("pending_invite_code", inviteCode);
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Volta para /cadastro (mesma rota SPA, dentro do escopo do
          // manifest) para preservar o modo standalone do PWA.
          redirectTo: `${window.location.origin}/cadastro`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        toast.error("Erro ao conectar com Google");
        setGoogleLoading(false);
        return;
      }
      // Em sucesso, o browser redireciona para o Google.
    } catch {
      toast.error("Erro ao conectar com Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const applyInviteAfterSignup = async (userId: string) => {
    if (!inviteCode || !inviteState.valid || !inviteState.owner_id) return;

    if (inviteState.require_approval) {
      // Create pending approval entry
      await (supabase as any).from("user_approvals").insert({
        user_id: userId,
        owner_id: inviteState.owner_id,
        status: "pending",
        email,
        display_name: displayName,
        invite_code: inviteCode,
      });

      // Notify admin via Telegram (best-effort, non-blocking)
      supabase.functions
        .invoke("notify-approval-request", {
          body: { owner_id: inviteState.owner_id, display_name: displayName, email },
        })
        .catch(() => {});
    } else {
      // Auto-link as sub-user with default cliente role
      await (supabase as any).from("user_owner").upsert(
        { user_id: userId, owner_id: inviteState.owner_id },
        { onConflict: "user_id" },
      );
      await supabase.from("user_roles").insert({ user_id: userId, role: "cliente" as any });
    }

    // Increment code usage (best-effort, non-blocking)
    await (supabase as any).rpc("noop").catch(() => {});
    const { data: current } = await (supabase as any)
      .from("invite_codes")
      .select("uses_count")
      .eq("code", inviteCode)
      .maybeSingle();
    if (current) {
      await (supabase as any)
        .from("invite_codes")
        .update({ uses_count: (current.uses_count || 0) + 1 })
        .eq("code", inviteCode);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    const cpfDigits = cpfCnpj.replace(/\D/g, "");
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      toast.error("Informe um telefone válido com DDD");
      return;
    }
    if (inviteCode && !inviteState.valid) {
      toast.error("Código de convite inválido");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // Apply invite (approval or direct link) OR assign default owner role for self-signups
    if (data.user) {
      if (inviteCode && inviteState.valid) {
        await applyInviteAfterSignup(data.user.id);
      } else {
        // Self-service signup: todo novo usuário recebe a role 'cliente'.
        // Tentamos via cliente autenticado; se falhar (RLS/policy), chamamos
        // a edge function `ensure-user-role` como fallback garantido.
        const { error: roleErr } = await (supabase as any)
          .from("user_roles")
          .upsert(
            { user_id: data.user.id, role: "cliente" },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );

        if (roleErr) {
          try {
            const token = data.session?.access_token;
            await cloudSupabase.functions.invoke("ensure-user-role", {
              body: { role: "cliente" },
              ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            });
          } catch (e) {
            console.error("[cadastro] ensure-user-role fallback failed", e);
          }
        }

        // Verificação: confirma que a role foi persistida.
        const { data: roleCheck } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);
        if (!roleCheck || roleCheck.length === 0) {
          console.warn("[cadastro] role 'cliente' não foi vinculada ao usuário", data.user.id);
          toast.error("Cadastro criado mas a função padrão não foi atribuída. Faça login novamente para reaplicar.");
        }
      }

      // Salva CPF/CNPJ + telefone e (se aplicável) plano de teste.
      const profileUpdate: Record<string, unknown> = {
        cpf_cnpj: cpfDigits,
        phone: phoneDigits,
      };
      if (planName) {
        profileUpdate.trial_plan_name = planName;
        profileUpdate.trial_started_at = new Date().toISOString();
      }
      await (supabase as any)
        .from("profiles")
        .update(profileUpdate)
        .eq("user_id", data.user.id);
    }



    setLoading(false);
    if (inviteCode && inviteState.require_approval) {
      toast.success("Cadastro enviado para aprovação do administrador!");
    } else {
      toast.success("Conta criada! Verifique seu email para confirmar.");
    }
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center">
            <AppLogo area="auth" alt={brandName} rounded />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
          <p className="text-muted-foreground">
            Crie sua conta{planName ? ` — Plano ${planName}` : ""}
          </p>
        </div>

        {inviteCode && (
          <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
            inviteState.checking ? "border-border bg-muted/50" :
            inviteState.valid ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"
          }`}>
            {inviteState.checking ? (
              <><Loader2 className="h-4 w-4 animate-spin mt-0.5" /><span>Validando convite…</span></>
            ) : inviteState.valid ? (
              <><CheckCircle2 className="h-4 w-4 mt-0.5 text-success" />
                <span>
                  Convite válido. {inviteState.require_approval
                    ? "Seu cadastro ficará pendente até aprovação do administrador."
                    : "Você terá acesso imediato após o cadastro."}
                </span>
              </>
            ) : (
              <><AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
                <span>Convite inválido: {inviteState.reason || "código não aceito"}</span>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input id="name" placeholder="Seu nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-9 h-12 rounded-xl" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 h-12 rounded-xl" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cpfCnpj">CPF ou CNPJ</Label>
            <div className="relative">
              <IdCard className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="cpfCnpj"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                className="pl-9 h-12 rounded-xl"
                maxLength={18}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone (com DDD)</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-9 h-12 rounded-xl"
                maxLength={16}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-9 h-12 rounded-xl"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading || (!!inviteCode && !inviteState.valid)}>
            {loading ? "Aguarde..." : "Criar conta"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full h-12 rounded-xl text-base font-medium gap-3 border-input hover:bg-gradient-to-r hover:from-[#4285F4] hover:via-[#34A853] hover:via-[#FBBC05] hover:to-[#EA4335] hover:text-white hover:border-transparent hover:shadow-lg transition-all duration-300"
          onClick={handleGoogleSignup}
          disabled={googleLoading || (!!inviteCode && !inviteState.valid)}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="currentColor"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
          </svg>
          {googleLoading ? "Conectando..." : "Criar conta com Google"}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <button onClick={() => navigate("/auth")} className="text-primary hover:underline font-medium">
            Entrar
          </button>
        </div>

        <Button
          variant="ghost"
          className="w-full gap-2 text-muted-foreground"
          onClick={() => navigate("/planos")}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos planos
        </Button>
      </div>
    </div>
  );
};

export default Cadastro;
