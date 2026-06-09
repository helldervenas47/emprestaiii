// Recebe áudio (base64) gravado pelo usuário, transcreve e extrai os campos
// de uma despesa (descrição, valor, categoria, vencimento, observações)
// usando a API nativa do Gemini (suporta audio/webm inline).

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

function extractJson(raw: string): any {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.search(/[\{\[]/);
  const isArr = a !== -1 && s[a] === "[";
  const b = s.lastIndexOf(isArr ? "]" : "}");
  if (a === -1 || b === -1) throw new Error("JSON não encontrado");
  s = s.substring(a, b + 1);
  try { return JSON.parse(s); }
  catch {
    s = s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(s);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY ausente" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return new Response(JSON.stringify({ error: "audioBase64 obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalizar mimeType para algo que o Gemini aceita
    let mt = (mimeType || "audio/webm").split(";")[0].trim();
    const allowed = ["audio/webm", "audio/mp3", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp4"];
    if (!allowed.includes(mt)) mt = "audio/webm";

    const today = todayBR();
    const prompt = `Você recebe um áudio em português brasileiro com uma despesa ditada pelo usuário.
Transcreva e extraia os campos. Hoje é ${today}.
Responda APENAS um JSON válido (sem markdown, sem texto extra) com:
{
  "description": string,
  "amount": number,
  "category": string,  // OBRIGATORIAMENTE uma de: ${CATEGORIES.join(", ")}
  "dueDate": string,   // YYYY-MM-DD, padrão hoje
  "notes": string,
  "scope": "business" | "personal",
  "transcript": string
}
Se não conseguir identificar valor ou descrição, retorne {"error":"motivo"}.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mt, data: audioBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    const body = await resp.text();
    if (!resp.ok) {
      console.error("Gemini error", resp.status, body);
      return new Response(JSON.stringify({ error: `Gemini ${resp.status}`, detail: body }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: any;
    try { data = JSON.parse(body); } catch { data = {}; }
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ?? "";
    if (!text) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA", raw: data }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try { parsed = extractJson(text); }
    catch (e) {
      return new Response(JSON.stringify({ error: "Resposta inválida da IA", raw: text }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
