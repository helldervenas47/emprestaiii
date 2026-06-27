import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { ArrowUp, Loader2, Plus, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const HELP_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-chat`;
const HELP_CHAT_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SUGGESTIONS = [
  { title: "Cadastrar empréstimo", subtitle: "Como criar um contrato parcelado" },
  { title: "Criar um cofrinho", subtitle: "Reservar dinheiro para uma meta" },
  { title: "Dar acesso a outro usuário", subtitle: "Convidar e gerenciar permissões" },
  { title: "Conectar bot do Telegram", subtitle: "Receber relatórios automáticos" },
];

export default function HelpChat() {
  const { branding } = useAppBranding();
  const brandName = branding.brand_name;

  const greeting = useMemo<Msg>(
    () => ({
      role: "assistant",
      content: `Olá! 👋 Sou o assistente do **${brandName}**. Posso ajudar com cadastros, cofrinhos, relatórios, integrações, permissões e qualquer dúvida sobre o app. Como posso ajudar hoje?`,
    }),
    [brandName],
  );

  const [messages, setMessages] = useState<Msg[]>([greeting]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isEmpty = messages.length <= 1 && !sending;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(HELP_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: HELP_CHAT_KEY,
          Authorization: `Bearer ${HELP_CHAT_KEY}`,
        },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });

      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!response.ok || data?.error || !data?.reply) {
        const msg = data?.error || `Falha ao chamar o assistente (${response.status}).`;
        toast.error(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede.";
      toast.error(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setSending(false);
    }
  };

  const newConversation = () => {
    if (sending) return;
    setMessages([greeting]);
    setInput("");
  };

  return (
    <div className="relative flex flex-col rounded-3xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden shadow-sm h-[calc(100dvh-200px)] min-h-[520px]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border/40 bg-background/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl overflow-hidden flex items-center justify-center bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
            <AppLogo area="auth" alt={brandName} rounded />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight truncate">Assistente {brandName}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Powered by IA · respostas em tempo real</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={newConversation}
          disabled={sending || messages.length <= 1}
          className="text-xs gap-1.5 h-8"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nova conversa</span>
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState brandName={brandName} onPick={send} />
        ) : (
          <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
            {messages.map((m, i) => (
              <MessageRow key={i} msg={m} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm pl-1">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                </span>
                <span>Pensando…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/40 bg-background/80 backdrop-blur px-3 sm:px-6 py-3">
        <form
          className="max-w-3xl mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="relative flex items-end rounded-2xl border border-border/60 bg-background shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Pergunte algo sobre o ${brandName}…`}
              className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3.5 pr-14 text-sm leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={sending}
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2 h-9 w-9 rounded-xl flex-shrink-0 disabled:opacity-40"
              disabled={sending || !input.trim()}
              aria-label="Enviar"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            O assistente pode cometer erros. Verifique informações importantes.
          </p>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ brandName, onPick }: { brandName: string; onPick: (q: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6 py-10 text-center">
      <div className="h-14 w-14 rounded-2xl overflow-hidden flex items-center justify-center bg-primary/10 ring-1 ring-primary/20 mb-4">
        <AppLogo area="auth" alt={brandName} rounded />
      </div>
      <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">Como posso ajudar você hoje?</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
        Sou o assistente do <span className="font-medium text-foreground">{brandName}</span>. Pergunte sobre qualquer
        recurso do app.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-8 w-full max-w-2xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.title + "?")}
            className="group text-left rounded-2xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm px-4 py-3 transition-all"
          >
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{s.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Plus className="h-3.5 w-3.5 text-primary rotate-45" />
      </div>
      <div className="flex-1 min-w-0 text-sm leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-foreground prose-a:text-primary">
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>
    </div>
  );
}
