// Recebe áudio (base64) gravado pelo usuário, transcreve e extrai os campos
// de uma despesa (descrição, valor, categoria, vencimento, observações)
// usando o Lovable AI Gateway (Gemini). Retorna JSON pronto para preencher
// o formulário de despesa.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = [
  "Aluguel", "Energia", "Água", "Internet", "Telefone",
  "Alimentação", "Transporte", "Salários", "Impostos", "Outros",
];

function todayBR(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return new Response(JSON.stringify({ error: "audioBase64 obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = todayBR();
    const systemPrompt = `Você recebe um áudio em português brasileiro com uma despesa ditada pelo usuário.
Transcreva e extraia os campos. Hoje é ${today}. Responda APENAS um JSON válido (sem markdown) com:
{
  "description": string,                 // descrição curta (ex: "Conta de luz")
  "amount": number,                      // valor em reais, ponto decimal (ex: 123.45)
  "category": string,                    // OBRIGATORIAMENTE uma de: ${CATEGORIES.join(", ")}
  "dueDate": string,                     // YYYY-MM-DD, padrão hoje se não dito
  "notes": string,                       // observações ou "" se não houver
  "scope": "business" | "personal",     // "personal" se for despesa pessoal, senão "business"
  "transcript": string                   // transcrição literal do áudio
}
Se não conseguir identificar valor ou descrição, retorne {"error":"motivo"}.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia a despesa deste áudio." },
              { type: "input_audio", input_audio: { data: audioBase64, format: (mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      const msg = resp.status === 429 ? "Limite de requisições atingido."
        : resp.status === 402 ? "Créditos da IA esgotados."
        : "Falha na IA.";
      return new Response(JSON.stringify({ error: msg, detail: t }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch { parsed = { error: "Resposta inválida da IA", raw }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
