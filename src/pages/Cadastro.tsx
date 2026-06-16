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
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [inviteState, setInviteState] = useState<{ checking: boolean; valid: boolean; owner_id?: string; require_approval?: boolean; reason?: string }>({ checking: !!inviteCode, valid: false });
  const navigate = useNavigate();
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  const ensureDefaultClienteRole = async (userId: string, userEmail?: string | null, accessToken?: string | null) => {
    const { data: ensuredRole, error: ensureError } = await cloudSupabase.functions.invoke("ensure-user-role", {
      body: { userId, email: userEmail, role: "cliente" },
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    });

    if (ensureError || ensuredRole?.error) {
      console.error("[cadastro] ensure-user-role failed", ensureError ?? ensuredRole?.error);
      toast.error("Cadastro criado, mas a função padrão não foi atribuída. Faça login novamente para reaplicar.");
      return false;
    }

    return ensuredRole?.role === "cliente";
  };

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

  useEffect(() => {
    const ensureOAuthSignupRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await ensureDefaultClienteRole(session.user.id, session.user.email, session.access_token);
    };

    ensureOAuthSignupRole();
  }, []);

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

      await ensureDefaultClienteRole(userId, email);
    } else {
      // Auto-link as sub-user with default cliente role
      await (supabase as any).from("user_owner").upsert(
        { user_id: userId, owner_id: inviteState.owner_id },
        { onConflict: "user_id" },
      );
      await ensureDefaultClienteRole(userId, email);
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
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(normalizedUsername)) {
      toast.error("Usuário deve ter 3-30 caracteres (letras, números, _ ou .)");
      return;
    }
    // Verify uniqueness
    const { data: existingUser } = await (supabase as any)
      .from("profiles")
      .select("user_id")
      .ilike("username", normalizedUsername)
      .maybeSingle();
    if (existingUser) {
      setUsernameError("Esse usuário já está em uso");
      toast.error("Esse usuário já está em uso");
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
    if (!acceptTerms) {
      toast.error("Você precisa aceitar os termos de uso para continuar");
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
        await ensureDefaultClienteRole(data.user.id, data.user.email ?? email, data.session?.access_token);
      }

      // Salva CPF/CNPJ + telefone e (se aplicável) plano de teste.
      const profileUpdate: Record<string, unknown> = {
        cpf_cnpj: cpfDigits,
        phone: phoneDigits,
        username: normalizedUsername,
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
            <Label htmlFor="username">Usuário</Label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="username"
                placeholder="usuario_login"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.replace(/\s+/g, "").toLowerCase());
                  setUsernameError(null);
                }}
                className="pl-9 h-12 rounded-xl"
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={30}
                required
              />
            </div>
            <p className={`text-xs ${usernameError ? "text-destructive" : "text-muted-foreground"}`}>
              {usernameError ?? "Você poderá usar esse nome para fazer login no app."}
            </p>
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
          <div className="flex items-start gap-2">
            <input
              id="acceptTerms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input accent-primary cursor-pointer"
            />
            <Label htmlFor="acceptTerms" className="text-sm font-normal text-muted-foreground cursor-pointer leading-snug">
              Li e aceito os{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">termos de uso</a>
              {" "}e a{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">política de privacidade</a>.
            </Label>
          </div>
          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading || !acceptTerms || (!!inviteCode && !inviteState.valid)}>
            {loading ? "Aguarde..." : "Criar conta"}
          </Button>
        </form>

        {/* Cadastro com Google temporariamente desativado */}

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
