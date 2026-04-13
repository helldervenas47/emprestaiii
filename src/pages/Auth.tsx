import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HandCoins, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta criada! Verifique seu email para confirmar o cadastro.");
      setIsLogin(true);
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-2xl gradient-primary glow-primary flex items-center justify-center">
              <HandCoins className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">HVCred</h1>
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl gradient-primary glow-primary flex items-center justify-center">
            <HandCoins className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">HVCred</h1>
          <p className="text-muted-foreground">
            {isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>
        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-5">
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input id="name" placeholder="Seu nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-9 h-12 rounded-xl" required />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="loginId">{isLogin ? "Email ou Usuário" : "Email"}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              {isLogin ? (
                <Input id="loginId" type="text" placeholder="email ou nome de usuário" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="pl-9 h-12 rounded-xl" required />
              ) : (
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 h-12 rounded-xl" required />
              )}
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
          {isLogin && (
            <button type="button" onClick={() => setIsForgot(true)} className="text-sm text-primary hover:underline">
              Esqueceu a senha?
            </button>
          )}
          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
            {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <div className="text-center text-sm text-muted-foreground">
          {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium">
            {isLogin ? "Criar conta" : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
