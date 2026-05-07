import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { toast } from "@/lib/appToast";

const Auth = () => {
  const [isForgot, setIsForgot] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  // Check if a Google OAuth user was just auto-created (no prior account)
  useEffect(() => {
    const checkNewOAuthUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const user = session.user;
      const isOAuth = user.app_metadata?.provider === "google";
      if (!isOAuth) return;

      // If created_at is within the last 60 seconds, this is a new account
      const createdAt = new Date(user.created_at).getTime();
      const now = Date.now();
      if (now - createdAt < 60_000) {
        // New user via Google on login page — block and sign out
        await supabase.auth.signOut();
        toast.error("Você ainda não tem uma conta. Crie uma conta primeiro escolhendo um plano.");
        window.location.assign("/planos");
      }
    };

    // Listen for OAuth callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        checkNewOAuthUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Erro ao conectar com Google");
      }
    } catch {
      toast.error("Erro ao conectar com Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let emailToUse = loginId;
    if (!isEmail(loginId)) {
      const { data, error } = await supabase.functions.invoke("login-with-username", {
        body: { username: loginId, password },
      });
      if (error || data?.error) {
        setLoading(false);
        toast.error(data?.error || "Usuário não encontrado");
        return;
      }
      emailToUse = data.email;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
    setLoading(false);
    if (error) {
      if (error.message === "Invalid login credentials") {
        toast.error("Email/usuário ou senha incorretos");
      } else if (error.message.toLowerCase().includes("banned") || error.message.toLowerCase().includes("ban")) {
        toast.error("Usuário inativo. Contate o administrador.");
      } else {
        toast.error(error.message);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Digite seu email");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
      setIsForgot(false);
    }
  };

  if (isForgot) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center -mb-2">
              <AppLogo area="auth" alt={brandName} rounded />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
            <p className="text-muted-foreground">Digite seu email para receber o link de recuperação</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 h-12 rounded-xl" required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setIsForgot(false)}>
              Voltar ao login
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8 pt-safe">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center -mb-2">
            <AppLogo area="auth" alt={brandName} rounded />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
          <p className="text-muted-foreground">Entre na sua conta</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="loginId">Email ou Usuário</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input id="loginId" type="text" placeholder="email ou nome de usuário" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="pl-9 h-12 rounded-xl" required />
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
          <button type="button" onClick={() => setIsForgot(true)} className="text-sm text-primary hover:underline">
            Esqueceu a senha?
          </button>
          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
            {loading ? "Aguarde..." : "Entrar"}
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
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="currentColor"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
          </svg>
          {googleLoading ? "Conectando..." : "Entrar com Google"}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <button onClick={() => window.location.assign("/planos")} className="text-primary hover:underline font-medium">
            Criar conta
          </button>
        </div>
        <div className="text-center">
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl text-sm font-semibold border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => window.location.assign("/planos")}
          >
            Ver planos e preços
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
