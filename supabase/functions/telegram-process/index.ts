import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "Alimentação", "Assinaturas", "Cartão de Crédito", "Compras", "Contas",
  "Educação", "Lazer", "Moradia", "Outros", "Pets", "Presentes", "Saúde", "Transporte",
];

// In-memory cache (per-isolate) for chat_id → user_id lookups. TTL 5min.
const linkCache = new Map<number, { userId: string | null; expires: number }>();
const LINK_CACHE_TTL_MS = 5 * 60 * 1000;

async function getLinkedUserId(admin: any, chatId: number): Promise<string | null> {
  const cached = linkCache.get(chatId);
  if (cached && cached.expires > Date.now()) return cached.userId;
  const { data } = await admin.from("telegram_links")
    .select("user_id").eq("chat_id", chatId).maybeSingle();
  const userId = data?.user_id ?? null;
  linkCache.set(chatId, { userId, expires: Date.now() + LINK_CACHE_TTL_MS });
  return userId;
}

function invalidateLinkCache(chatId: number) {
  linkCache.delete(chatId);
}

// Keyword → category mapping for regex pre-parser.
// Order matters only within a category; first matching category wins.
const CATEGORY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: "Transporte", words: ["uber", "99", "99pop", "taxi", "táxi", "cabify", "indrive", "blablacar", "onibus", "ônibus", "metro", "metrô", "trem", "brt", "passagem", "gasolina", "combustivel", "combustível", "etanol", "alcool", "álcool", "diesel", "posto", "ipva", "pedagio", "pedágio", "estacionamento", "zona azul", "lavagem", "lava jato", "lava-jato", "oficina", "mecanico", "mecânico"] },
  { category: "Alimentação", words: ["mercado", "supermercado", "feira", "padaria", "açougue", "acougue", "hortifruti", "sacolao", "sacolão", "ifood", "rappi", "delivery", "lanche", "lanchonete", "restaurante", "almoço", "almoco", "janta", "jantar", "café", "cafe", "cafeteria", "starbucks", "mc donalds", "mcdonalds", "mc", "burger", "bk", "burger king", "subway", "pizza", "pizzaria", "sushi", "japones", "japonês", "churrascaria", "marmita", "quentinha", "açai", "acai"] },
  { category: "Assinaturas", words: ["netflix", "spotify", "disney", "disney+", "hbo", "max", "prime video", "amazon prime", "youtube premium", "apple music", "deezer", "tidal", "globoplay", "paramount", "crunchyroll", "icloud", "google one", "drive", "dropbox", "chatgpt", "claude", "midjourney", "canva", "notion", "office", "microsoft 365"] },
  { category: "Contas", words: ["luz", "energia", "agua", "água", "gas", "gás", "internet", "wifi", "telefone", "celular", "claro", "vivo", "tim", "oi", "net", "iptu", "condominio", "condomínio", "aluguel", "boleto", "fatura", "conta de luz", "conta de agua", "conta de água"] },
  { category: "Saúde", words: ["farmacia", "farmácia", "remedio", "remédio", "medicamento", "drogaria", "drogasil", "pacheco", "raia", "consulta", "medico", "médico", "dentista", "exame", "laboratorio", "laboratório", "hospital", "clinica", "clínica", "psicologo", "psicólogo", "terapia", "fisioterapia", "academia", "gym", "smartfit", "bioritmo"] },
  { category: "Lazer", words: ["cinema", "ingresso", "show", "festa", "balada", "bar", "cerveja", "drink", "bebida", "viagem", "hotel", "airbnb", "passeio", "parque", "teatro", "museu", "jogo", "game", "steam", "playstation", "xbox", "nintendo", "livro", "amazon"] },
  { category: "Compras", words: ["roupa", "calça", "calca", "camisa", "camiseta", "tenis", "tênis", "sapato", "shopping", "magalu", "magazine", "americanas", "shopee", "mercado livre", "mercadolivre", "ml", "aliexpress", "shein"] },
  { category: "Pets", words: ["pet", "petshop", "pet shop", "racao", "ração", "veterinario", "veterinário", "vet", "cocheira", "banho e tosa", "cobasi", "petz"] },
  { category: "Educação", words: ["curso", "faculdade", "mensalidade", "escola", "colegio", "colégio", "livro didatico", "alura", "udemy", "coursera", "pos graduacao", "pós-graduação", "ingles", "inglês"] },
  { category: "Moradia", words: ["material de construção", "material de construcao", "tinta", "reforma", "marceneiro", "pedreiro", "eletricista", "encanador", "leroy", "leroy merlin", "telha norte", "moveis", "móveis", "casa bahia", "decoracao", "decoração"] },
  { category: "Cartão de Crédito", words: ["fatura cartao", "fatura cartão", "fatura do cartao", "fatura do cartão", "cartao", "cartão", "nubank fatura", "itau fatura"] },
  { category: "Presentes", words: ["presente", "aniversario", "aniversário", "natal", "dia das maes", "dia das mães", "dia dos pais"] },
];

function detectCategory(description: string): string {
  const lower = description.toLowerCase();
  for (const { category, words } of CATEGORY_KEYWORDS) {
    for (const w of words) {
      // Word-boundary-ish match: substring with surrounding non-letter or string edges
      const idx = lower.indexOf(w);
      if (idx === -1) continue;
      const before = idx === 0 ? "" : lower[idx - 1];
      const after = idx + w.length >= lower.length ? "" : lower[idx + w.length];
      const isWordChar = (c: string) => /[a-záéíóúâêôãõç0-9]/i.test(c);
      if (!isWordChar(before) && !isWordChar(after)) return category;
    }
  }
  return "Outros";
}

// Regex-first parser for common expense formats.
// Examples: "45 mercado", "R$ 12,50 uber", "uber 25", "1.234,56 conta luz"
function quickParseExpense(text: string): { amount: number; description: string; category: string } | null {
  const t = text.trim();
  if (t.length < 2 || t.startsWith("/")) return null;
  let amountStr: string | null = null;
  let description: string | null = null;
  const mA = t.match(/^R?\$?\s*([\d]+(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s+(.{2,80})$/i);
  if (mA) { amountStr = mA[1]; description = mA[2]; }
  else {
    const mB = t.match(/^(.{2,80}?)\s+R?\$?\s*([\d]+(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)$/i);
    if (mB) { description = mB[1]; amountStr = mB[2]; }
  }
  if (!amountStr || !description) return null;
  const amount = parseAmount(amountStr);
  if (amount === null) return null;
  const desc = description.trim();
  if (desc.length < 2) return null;
  return { amount, description: desc, category: detectCategory(desc) };
}

const HELP_TEXT = `🤖 *Como usar*

Envie uma despesa em texto livre, ex:
• "gastei 45 no uber ontem"
• "mercado 230"
• "netflix 39,90 assinatura"

📸 Ou envie uma *foto de cupom/nota fiscal* — eu leio o comprovante e extraio o valor automaticamente.

🎤 Ou envie um *áudio* falando a despesa — eu transcrevo e cadastro.

Vou interpretar e cadastrar automaticamente.

*Comandos:*
/saldo — gastos do mês por categoria
/mes — resumo completo do mês
/semana — resumo dos últimos 7 dias
/comparar — compara este mês com o anterior
/orcamento — status dos orçamentos do mês
/ultimas — últimas 5 despesas
/apagar — apaga a despesa mais recente
/help — esta mensagem
/start CODIGO — vincular conta`;

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const fmtDayMonth = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function budgetIcon(pct: number | null): string {
  if (pct === null) return "⚪";
  if (pct >= 100) return "🔴";
  if (pct >= 70) return "🟡";
  return "🟢";
}

async function handleSaldo(admin: any, userId: string): Promise<string> {
  const now = new Date();
  const monthPrefix = now.toISOString().slice(0, 7); // YYYY-MM
  const monthName = MONTH_NAMES[now.getMonth()];

  const { data: expenses } = await admin
    .from("expenses")
    .select("amount, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("paid", true);

  const monthExpenses = (expenses ?? []).filter((e: any) => {
    const ref = (e.paid_date || e.due_date || "") as string;
    return ref.startsWith(monthPrefix);
  });

  const byCat = new Map<string, number>();
  let total = 0;
  for (const e of monthExpenses) {
    const amt = Number(e.amount) || 0;
    total += amt;
    byCat.set(e.category || "Outros", (byCat.get(e.category || "Outros") || 0) + amt);
  }

  const { data: budgets } = await admin
    .from("personal_budgets")
    .select("category, amount")
    .eq("user_id", userId);
  const budgetMap = new Map<string, number>();
  for (const b of budgets ?? []) budgetMap.set(b.category, Number(b.amount) || 0);

  let msg = `💰 *Gastos de ${monthName}*\nTotal: ${fmtBRL(total)}\n`;
  if (byCat.size === 0) {
    msg += `\n_Sem despesas neste mês._`;
    return msg;
  }
  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, spent] of sorted) {
    const budget = budgetMap.get(cat);
    if (budget && budget > 0) {
      const pct = (spent / budget) * 100;
      msg += `${budgetIcon(pct)} ${cat}: ${fmtBRL(spent)} / ${fmtBRL(budget)} (${pct.toFixed(0)}%)\n`;
    } else {
      msg += `${budgetIcon(null)} ${cat}: ${fmtBRL(spent)} (sem orçamento)\n`;
    }
  }
  return msg.trimEnd();
}

async function handleUltimas(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("expenses")
    .select("amount, description, category, paid_date, due_date, created_at")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("paid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return "ℹ️ Nenhuma despesa registrada ainda.";

  let msg = "🧾 *Últimas despesas*\n";
  data.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${e.category}) — ${dateStr}\n`;
  });
  return msg.trimEnd();
}

async function handleApagar(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("expenses")
    .select("id, amount, description, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("paid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return "ℹ️ Nenhuma despesa para apagar.";

  const e = data[0];
  const { error } = await admin.from("expenses").delete().eq("id", e.id);
  if (error) return "❌ Erro ao apagar: " + error.message;

  const date = e.paid_date || e.due_date || "";
  const dateStr = date ? fmtDayMonth(date) : "—";
  return `🗑️ *Despesa removida:*\n${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${e.category}) — ${dateStr}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function summarizeRange(
  admin: any,
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<{ total: number; count: number; byCat: Map<string, number>; topItems: any[] }> {
  const { data } = await admin
    .from("expenses")
    .select("amount, category, description, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("paid", true);

  const filtered = (data ?? []).filter((e: any) => {
    const ref = (e.paid_date || e.due_date || "") as string;
    return ref >= fromISO && ref <= toISO;
  });

  const byCat = new Map<string, number>();
  let total = 0;
  for (const e of filtered) {
    const amt = Number(e.amount) || 0;
    total += amt;
    byCat.set(e.category || "Outros", (byCat.get(e.category || "Outros") || 0) + amt);
  }

  const topItems = [...filtered]
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .slice(0, 5);

  return { total, count: filtered.length, byCat, topItems };
}

async function handleMes(admin: any, userId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const monthName = MONTH_NAMES[month];

  const { total, count, byCat, topItems } = await summarizeRange(
    admin, userId, ymd(first), ymd(last),
  );

  if (count === 0) return `📅 *Resumo de ${monthName}*\n\n_Sem despesas neste mês._`;

  const dayOfMonth = now.getDate();
  const avgPerDay = total / dayOfMonth;

  let msg = `📅 *Resumo de ${monthName}*\n`;
  msg += `Total: ${fmtBRL(total)} (${count} ${count === 1 ? "despesa" : "despesas"})\n`;
  msg += `Média/dia: ${fmtBRL(avgPerDay)}\n`;

  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, spent] of sorted) {
    const pct = total > 0 ? (spent / total) * 100 : 0;
    msg += `• ${cat}: ${fmtBRL(spent)} (${pct.toFixed(0)}%)\n`;
  }

  msg += `\n🔝 *Maiores despesas:*\n`;
  topItems.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${dateStr})\n`;
  });

  return msg.trimEnd();
}

async function handleSemana(admin: any, userId: string): Promise<string> {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 6);

  const { total, count, byCat, topItems } = await summarizeRange(
    admin, userId, ymd(from), ymd(to),
  );

  const fromStr = `${String(from.getDate()).padStart(2, "0")}/${String(from.getMonth() + 1).padStart(2, "0")}`;
  const toStr = `${String(to.getDate()).padStart(2, "0")}/${String(to.getMonth() + 1).padStart(2, "0")}`;

  if (count === 0) return `🗓️ *Resumo da semana* (${fromStr} – ${toStr})\n\n_Sem despesas nos últimos 7 dias._`;

  const avgPerDay = total / 7;

  let msg = `🗓️ *Resumo da semana* (${fromStr} – ${toStr})\n`;
  msg += `Total: ${fmtBRL(total)} (${count} ${count === 1 ? "despesa" : "despesas"})\n`;
  msg += `Média/dia: ${fmtBRL(avgPerDay)}\n`;

  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, spent] of sorted) {
    const pct = total > 0 ? (spent / total) * 100 : 0;
    msg += `• ${cat}: ${fmtBRL(spent)} (${pct.toFixed(0)}%)\n`;
  }

  msg += `\n🔝 *Maiores despesas:*\n`;
  topItems.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${dateStr})\n`;
  });

  return msg.trimEnd();
}

async function handleComparar(admin: any, userId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Current month range
  const curFirst = new Date(year, month, 1);
  const curLast = new Date(year, month + 1, 0);

  // Previous month range
  const prevFirst = new Date(year, month - 1, 1);
  const prevLast = new Date(year, month, 0);

  const [cur, prev] = await Promise.all([
    summarizeRange(admin, userId, ymd(curFirst), ymd(curLast)),
    summarizeRange(admin, userId, ymd(prevFirst), ymd(prevLast)),
  ]);

  const curMonthName = MONTH_NAMES[curFirst.getMonth()];
  const prevMonthName = MONTH_NAMES[prevFirst.getMonth()];

  if (cur.count === 0 && prev.count === 0) {
    return `📊 *Comparativo ${prevMonthName} → ${curMonthName}*\n\n_Sem despesas em nenhum dos dois meses._`;
  }

  const fmtVar = (curVal: number, prevVal: number): string => {
    if (prevVal === 0 && curVal === 0) return "—";
    if (prevVal === 0) return "🆕 novo";
    if (curVal === 0) return "✅ -100%";
    const diff = curVal - prevVal;
    const pct = (diff / prevVal) * 100;
    const arrow = diff > 0 ? "🔺" : diff < 0 ? "🔻" : "➖";
    const sign = diff > 0 ? "+" : "";
    return `${arrow} ${sign}${pct.toFixed(0)}%`;
  };

  let msg = `📊 *Comparativo ${prevMonthName} → ${curMonthName}*\n\n`;

  // Total
  msg += `💰 *Total*\n`;
  msg += `${prevMonthName}: ${fmtBRL(prev.total)}\n`;
  msg += `${curMonthName}: ${fmtBRL(cur.total)}\n`;
  msg += `Variação: ${fmtVar(cur.total, prev.total)}`;
  if (prev.total > 0 && cur.total > 0) {
    const diff = cur.total - prev.total;
    msg += ` (${diff >= 0 ? "+" : ""}${fmtBRL(diff)})`;
  }
  msg += `\n\n`;

  // Por categoria — união das categorias dos dois meses
  msg += `📂 *Por categoria:*\n`;
  const allCats = new Set<string>([...cur.byCat.keys(), ...prev.byCat.keys()]);
  const rows = [...allCats].map((cat) => ({
    cat,
    curVal: cur.byCat.get(cat) || 0,
    prevVal: prev.byCat.get(cat) || 0,
  }));
  // Ordena pelo gasto atual (depois anterior) decrescente
  rows.sort((a, b) => (b.curVal + b.prevVal) - (a.curVal + a.prevVal));

  for (const r of rows) {
    msg += `\n*${r.cat}*\n`;
    msg += `${prevMonthName}: ${fmtBRL(r.prevVal)} → ${curMonthName}: ${fmtBRL(r.curVal)}\n`;
    msg += `${fmtVar(r.curVal, r.prevVal)}\n`;
  }

  return msg.trimEnd();
}

async function handleOrcamento(admin: any, userId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthPrefix = now.toISOString().slice(0, 7); // YYYY-MM
  const monthName = MONTH_NAMES[month];
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const daysLeft = lastDay - today;

  const [{ data: budgets }, { data: expenses }] = await Promise.all([
    admin.from("personal_budgets").select("category, amount").eq("user_id", userId),
    admin
      .from("expenses")
      .select("amount, category, paid_date, due_date")
      .eq("user_id", userId)
      .eq("scope", "personal")
      .eq("paid", true),
  ]);

  if (!budgets || budgets.length === 0) {
    return `🎯 *Orçamentos de ${monthName}*\n\n_Nenhum orçamento cadastrado._\n\nDefina orçamentos por categoria no app para acompanhar aqui.`;
  }

  // Spent per category in current month
  const spentByCat = new Map<string, number>();
  for (const e of expenses ?? []) {
    const ref = (e.paid_date || e.due_date || "") as string;
    if (!ref.startsWith(monthPrefix)) continue;
    const cat = e.category || "Outros";
    spentByCat.set(cat, (spentByCat.get(cat) || 0) + (Number(e.amount) || 0));
  }

  // Build rows with computed metrics, sorted by % consumed desc
  const rows = (budgets ?? []).map((b: any) => {
    const budget = Number(b.amount) || 0;
    const spent = spentByCat.get(b.category) || 0;
    const remaining = budget - spent;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    const dailyAllowance = daysLeft > 0 && remaining > 0 ? remaining / (daysLeft + 1) : 0;
    return { category: b.category, budget, spent, remaining, pct, dailyAllowance };
  });
  rows.sort((a, b) => b.pct - a.pct);

  let totalBudget = 0, totalSpent = 0;
  for (const r of rows) { totalBudget += r.budget; totalSpent += r.spent; }
  const totalRemaining = totalBudget - totalSpent;
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  let msg = `🎯 *Orçamentos de ${monthName}*\n`;
  msg += `📅 Faltam *${daysLeft}* ${daysLeft === 1 ? "dia" : "dias"} para fim do mês\n\n`;

  msg += `💰 *Total*\n`;
  msg += `${budgetIcon(totalPct)} ${fmtBRL(totalSpent)} / ${fmtBRL(totalBudget)} (${totalPct.toFixed(0)}%)\n`;
  if (totalRemaining >= 0) {
    msg += `Restante: ${fmtBRL(totalRemaining)}\n\n`;
  } else {
    msg += `🚨 Estouro: ${fmtBRL(Math.abs(totalRemaining))}\n\n`;
  }

  msg += `📂 *Por categoria:*\n`;
  for (const r of rows) {
    msg += `\n${budgetIcon(r.pct)} *${r.category}* — ${r.pct.toFixed(0)}%\n`;
    msg += `${fmtBRL(r.spent)} / ${fmtBRL(r.budget)}\n`;
    if (r.remaining >= 0) {
      msg += `Restante: ${fmtBRL(r.remaining)}`;
      if (r.dailyAllowance > 0) {
        msg += ` (~${fmtBRL(r.dailyAllowance)}/dia)`;
      }
      msg += `\n`;
    } else {
      msg += `🚨 Estouro: ${fmtBRL(Math.abs(r.remaining))}\n`;
    }
  }

  return msg.trimEnd();
}

async function checkBudgetAndAlert(
  admin: any,
  userId: string,
  chatId: number,
  category: string,
  lovableKey: string,
  telegramKey: string,
) {
  try {
    const { data: budgetRow } = await admin
      .from("personal_budgets")
      .select("amount")
      .eq("user_id", userId)
      .eq("category", category)
      .maybeSingle();
    const budget = Number(budgetRow?.amount) || 0;
    if (budget <= 0) return;

    const month = new Date().toISOString().slice(0, 7);

    const { data: expenses } = await admin
      .from("expenses")
      .select("amount, paid_date, due_date")
      .eq("user_id", userId)
      .eq("scope", "personal")
      .eq("category", category)
      .eq("paid", true);

    const total = (expenses || []).reduce((sum: number, e: any) => {
      const d = (e.paid_date || e.due_date || "").slice(0, 7);
      return d === month ? sum + (Number(e.amount) || 0) : sum;
    }, 0);

    if (total < budget) return;

    const { data: existingAlert } = await admin
      .from("personal_budget_alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("category", category)
      .eq("month", month)
      .eq("alert_type", "exceeded")
      .maybeSingle();

    if (existingAlert) return;

    await admin.from("personal_budget_alerts").insert({
      user_id: userId,
      category,
      month,
      alert_type: "exceeded",
    });

    const pct = Math.round((total / budget) * 100);
    const fmtTotal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total);
    const fmtBudget = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budget);

    await tgSend(
      chatId,
      `🚨 *Orçamento estourado!*\n\n📂 ${category}\n💸 Gasto: ${fmtTotal} / ${fmtBudget} (${pct}%)\n\nVocê ultrapassou o limite mensal desta categoria.`,
      lovableKey,
      telegramKey,
    );
  } catch (e) {
    console.error("checkBudgetAndAlert error", e);
  }
}

async function tgSend(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  }).catch((e) => console.error("sendMessage err", e));
}

async function tgSendWithKeyboard(chatId: number, text: string, keyboard: any, lovableKey: string, telegramKey: string) {
  await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    }),
  }).catch((e) => console.error("sendMessage kb err", e));
}

async function tgEditMessage(chatId: number, messageId: number, text: string, keyboard: any | null, lovableKey: string, telegramKey: string) {
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`${GATEWAY_URL}/editMessageText`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((e) => console.error("editMessage err", e));
}

async function tgEditReplyMarkup(chatId: number, messageId: number, keyboard: any, lovableKey: string, telegramKey: string) {
  await fetch(`${GATEWAY_URL}/editMessageReplyMarkup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard },
    }),
  }).catch((e) => console.error("editReplyMarkup err", e));
}

async function tgAnswerCallback(callbackId: string, text: string | undefined, lovableKey: string, telegramKey: string) {
  const body: any = { callback_query_id: callbackId };
  if (text) body.text = text;
  await fetch(`${GATEWAY_URL}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((e) => console.error("answerCb err", e));
}

function buildExpenseKeyboard(expenseId: string) {
  return [
    [{ text: "✏️ Editar valor", callback_data: `edit:${expenseId}` }],
    [
      { text: "📂 Mudar categoria", callback_data: `cat:${expenseId}` },
      { text: "🗑️ Apagar", callback_data: `del:${expenseId}` },
    ],
  ];
}

function parseAmount(input: string): number | null {
  const m = input.trim().match(/^R?\$?\s*([\d.,]+)\s*$/i);
  if (!m) return null;
  let raw = m[1];
  // pt-BR: "." milhar, "," decimal. Se houver vírgula, ponto é milhar.
  if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if ((raw.match(/\./g) || []).length > 1) {
    // múltiplos pontos = separadores de milhar
    raw = raw.replace(/\./g, "");
  }
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function buildCategoryKeyboard(expenseId: string) {
  const rows: any[] = [];
  for (let i = 0; i < CATEGORIES.length; i += 2) {
    const row = [{ text: CATEGORIES[i], callback_data: `setcat:${expenseId}:${CATEGORIES[i]}` }];
    if (CATEGORIES[i + 1]) {
      row.push({ text: CATEGORIES[i + 1], callback_data: `setcat:${expenseId}:${CATEGORIES[i + 1]}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Cancelar", callback_data: `canc:${expenseId}` }]);
  return rows;
}

async function extractExpense(text: string, lovableKey: string) {
  const today = new Date().toISOString().slice(0, 10);
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `Você extrai despesas pessoais de mensagens em português brasileiro. Hoje é ${today}. Categorias permitidas: ${CATEGORIES.join(", ")}. Se faltar valor numérico, retorne confidence baixo.`,
        },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_expense",
          description: "Registra uma despesa pessoal extraída da mensagem",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Descrição curta (sem o valor)" },
              amount: { type: "number", description: "Valor em reais" },
              category: { type: "string", enum: CATEGORIES },
              date: { type: "string", description: "Data YYYY-MM-DD; default hoje" },
              confidence: { type: "number", description: "0 a 1" },
            },
            required: ["description", "amount", "category", "date", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_expense" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI err", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

async function downloadTelegramFile(fileId: string, lovableKey: string, telegramKey: string): Promise<{ base64: string; filePath: string } | null> {
  try {
    const fileResp = await fetch(`${GATEWAY_URL}/getFile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileResp.json();
    if (!fileResp.ok) {
      console.error("getFile failed", fileData);
      return null;
    }
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const dl = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
      },
    });
    if (!dl.ok) {
      console.error("file download failed", dl.status);
      return null;
    }
    const buf = new Uint8Array(await dl.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { base64: btoa(binary), filePath };
  } catch (e) {
    console.error("downloadTelegramFile err", e);
    return null;
  }
}

async function downloadTelegramPhoto(fileId: string, lovableKey: string, telegramKey: string): Promise<string | null> {
  const f = await downloadTelegramFile(fileId, lovableKey, telegramKey);
  if (!f) return null;
  const ext = f.filePath.split(".").pop()?.toLowerCase() || "jpg";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${f.base64}`;
}

async function transcribeAudio(fileId: string, mimeHint: string, lovableKey: string, telegramKey: string): Promise<string | null> {
  const f = await downloadTelegramFile(fileId, lovableKey, telegramKey);
  if (!f) return null;
  const ext = f.filePath.split(".").pop()?.toLowerCase() || "";
  let mime = mimeHint;
  if (!mime) {
    if (ext === "oga" || ext === "ogg") mime = "audio/ogg";
    else if (ext === "mp3") mime = "audio/mpeg";
    else if (ext === "m4a" || ext === "mp4") mime = "audio/mp4";
    else if (ext === "wav") mime = "audio/wav";
    else if (ext === "webm") mime = "audio/webm";
    else mime = "audio/ogg";
  }
  const dataUrl = `data:${mime};base64,${f.base64}`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Transcreva o áudio em português brasileiro. Retorne apenas o texto transcrito, sem comentários ou formatação adicional." },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva este áudio:" },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    console.error("transcribe err", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  return text.trim();
}

async function extractExpenseFromImage(imageDataUrl: string, caption: string, lovableKey: string) {
  const today = new Date().toISOString().slice(0, 10);
  const sysPrompt = `Você extrai despesas pessoais de imagens de cupons fiscais, notas fiscais ou comprovantes em português brasileiro. Hoje é ${today}. Categorias permitidas: ${CATEGORIES.join(", ")}. Some o valor TOTAL do comprovante (não item por item). Se a imagem não for um comprovante legível, retorne confidence baixo.${caption ? ` Contexto adicional do usuário: "${caption}"` : ""}`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sysPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: caption || "Extraia a despesa total deste comprovante." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_expense",
          description: "Registra uma despesa pessoal extraída do comprovante",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Nome do estabelecimento ou descrição curta" },
              amount: { type: "number", description: "Valor TOTAL do comprovante em reais" },
              category: { type: "string", enum: CATEGORIES },
              date: { type: "string", description: "Data YYYY-MM-DD; use a data do comprovante ou hoje" },
              confidence: { type: "number", description: "0 a 1" },
            },
            required: ["description", "amount", "category", "date", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_expense" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI image err", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: messages, error } = await admin
    .from("telegram_messages")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let processed = 0;

  for (const msg of messages ?? []) {
    const chatId = msg.chat_id as number;
    const text = (msg.text as string | null)?.trim() ?? "";
    const photos = (msg.raw_update as any)?.message?.photo as any[] | undefined;
    const caption = ((msg.raw_update as any)?.message?.caption as string | null)?.trim() ?? "";
    const callback = (msg.raw_update as any)?.callback_query;

    try {
      // 🎛️ Callback query (inline button press)
      if (callback) {
        const cbId = callback.id as string;
        const data = (callback.data as string) ?? "";
        const messageId = callback.message?.message_id as number | undefined;

        const userId = await getLinkedUserId(admin, chatId);
        const link = userId ? { user_id: userId } : null;
        if (!link || !messageId) {
          await tgAnswerCallback(cbId, "Conta não vinculada", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (data.startsWith("del:")) {
          const expenseId = data.slice(4);
          const { error: delErr } = await admin.from("expenses")
            .delete().eq("id", expenseId).eq("user_id", link.user_id);
          if (delErr) {
            await tgAnswerCallback(cbId, "Erro ao apagar", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            await tgAnswerCallback(cbId, "Despesa removida", LOVABLE_API_KEY, TELEGRAM_API_KEY);
            await tgEditMessage(chatId, messageId, "🗑️ *Despesa removida.*", null, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          }
        } else if (data.startsWith("cat:")) {
          const expenseId = data.slice(4);
          await tgAnswerCallback(cbId, undefined, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          await tgEditReplyMarkup(chatId, messageId, buildCategoryKeyboard(expenseId), LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (data.startsWith("setcat:")) {
          const rest = data.slice(7);
          const sep = rest.indexOf(":");
          const expenseId = rest.slice(0, sep);
          const newCat = rest.slice(sep + 1);
          if (!CATEGORIES.includes(newCat)) {
            await tgAnswerCallback(cbId, "Categoria inválida", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            const { data: exp, error: updErr } = await admin.from("expenses")
              .update({ category: newCat })
              .eq("id", expenseId).eq("user_id", link.user_id)
              .select("amount, description, paid_date, due_date").maybeSingle();
            if (updErr || !exp) {
              await tgAnswerCallback(cbId, "Erro ao atualizar", LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else {
              await tgAnswerCallback(cbId, "Categoria atualizada", LOVABLE_API_KEY, TELEGRAM_API_KEY);
              const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(exp.amount) || 0);
              const date = exp.paid_date || exp.due_date || "";
              await tgEditMessage(
                chatId, messageId,
                `✏️ *Despesa atualizada*\n\n💰 ${fmt}\n📂 ${newCat}\n📝 ${exp.description}\n📅 ${date}`,
                buildExpenseKeyboard(expenseId),
                LOVABLE_API_KEY, TELEGRAM_API_KEY,
              );
              await checkBudgetAndAlert(admin, link.user_id, chatId, newCat, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            }
          }
        } else if (data.startsWith("canc:")) {
          const expenseId = data.slice(5);
          await tgAnswerCallback(cbId, undefined, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          await tgEditReplyMarkup(chatId, messageId, buildExpenseKeyboard(expenseId), LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (data.startsWith("edit:")) {
          const expenseId = data.slice(5);
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          const { error: upErr } = await admin.from("telegram_pending_edits").upsert({
            chat_id: chatId,
            expense_id: expenseId,
            user_id: link.user_id,
            message_id: messageId,
            expires_at: expiresAt,
          }, { onConflict: "chat_id" });
          if (upErr) {
            await tgAnswerCallback(cbId, "Erro ao iniciar edição", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            await tgAnswerCallback(cbId, "Envie o novo valor", LOVABLE_API_KEY, TELEGRAM_API_KEY);
            await tgEditReplyMarkup(chatId, messageId, [], LOVABLE_API_KEY, TELEGRAM_API_KEY);
            await tgSend(chatId, "✏️ *Editar valor*\nEnvie o novo valor (ex: `45,90`) ou `/cancelar`.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          }
        } else {
          await tgAnswerCallback(cbId, undefined, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        }

        await admin.from("telegram_messages")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      // 📸 Photo handling
      if (photos && photos.length > 0) {
        const userId = await getLinkedUserId(admin, chatId);
        const link = userId ? { user_id: userId } : null;
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Use o app para gerar um código e envie `/start CODIGO`.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else {
          const largest = photos[photos.length - 1];
          const dataUrl = await downloadTelegramPhoto(largest.file_id, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          if (!dataUrl) {
            await tgSend(chatId, "❌ Não consegui baixar a imagem. Tente novamente.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            const extracted = await extractExpenseFromImage(dataUrl, caption, LOVABLE_API_KEY);
            if (!extracted || !extracted.amount || extracted.confidence < 0.5) {
              await tgSend(chatId, "🤔 Não consegui ler o comprovante. Tente uma foto mais nítida ou envie por texto.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else {
              const { data: ins, error: insErr } = await admin.from("expenses").insert({
                user_id: link.user_id,
                description: extracted.description || "Comprovante",
                amount: extracted.amount,
                category: CATEGORIES.includes(extracted.category) ? extracted.category : "Outros",
                due_date: extracted.date || new Date().toISOString().slice(0, 10),
                type: "fixa",
                scope: "personal",
                paid: true,
                paid_date: extracted.date || new Date().toISOString().slice(0, 10),
              }).select("id").single();
              if (insErr || !ins) {
                await tgSend(chatId, "❌ Erro ao salvar: " + (insErr?.message ?? "desconhecido"), LOVABLE_API_KEY, TELEGRAM_API_KEY);
              } else {
                const finalCategory = CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
                const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                await tgSendWithKeyboard(chatId,
                  `📸 *Despesa extraída do comprovante*\n\n💰 ${fmt}\n📂 ${finalCategory}\n📝 ${extracted.description}\n📅 ${extracted.date}`,
                  buildExpenseKeyboard(ins.id),
                  LOVABLE_API_KEY, TELEGRAM_API_KEY);
                await checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, LOVABLE_API_KEY, TELEGRAM_API_KEY);
              }
            }
          }
        }
        await admin.from("telegram_messages")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      // 🎤 Voice / Audio handling
      const voice = (msg.raw_update as any)?.message?.voice;
      const audio = (msg.raw_update as any)?.message?.audio;
      const audioMsg = voice || audio;
      if (audioMsg) {
        const userId = await getLinkedUserId(admin, chatId);
        const link = userId ? { user_id: userId } : null;
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Use o app para gerar um código e envie `/start CODIGO`.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else {
          const transcript = await transcribeAudio(
            audioMsg.file_id,
            audioMsg.mime_type || "",
            LOVABLE_API_KEY,
            TELEGRAM_API_KEY,
          );
          if (!transcript) {
            await tgSend(chatId, "🤔 Não consegui transcrever o áudio. Tente novamente ou envie por texto.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            const extracted = await extractExpense(transcript, LOVABLE_API_KEY);
            if (!extracted || !extracted.amount || extracted.confidence < 0.6) {
              await tgSend(chatId, `🎤 Transcrevi: _"${transcript}"_\n\n🤔 Mas não consegui identificar a despesa. Tente reformular.`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else {
              const { data: ins, error: insErr } = await admin.from("expenses").insert({
                user_id: link.user_id,
                description: extracted.description || transcript.slice(0, 80),
                amount: extracted.amount,
                category: CATEGORIES.includes(extracted.category) ? extracted.category : "Outros",
                due_date: extracted.date || new Date().toISOString().slice(0, 10),
                type: "fixa",
                scope: "personal",
                paid: true,
                paid_date: extracted.date || new Date().toISOString().slice(0, 10),
              }).select("id").single();
              if (insErr || !ins) {
                await tgSend(chatId, "❌ Erro ao salvar: " + (insErr?.message ?? "desconhecido"), LOVABLE_API_KEY, TELEGRAM_API_KEY);
              } else {
                const finalCategory = CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
                const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                await tgSendWithKeyboard(chatId,
                  `🎤 *Despesa registrada por áudio*\n\n_"${transcript}"_\n\n💰 ${fmt}\n📂 ${finalCategory}\n📝 ${extracted.description}\n📅 ${extracted.date}`,
                  buildExpenseKeyboard(ins.id),
                  LOVABLE_API_KEY, TELEGRAM_API_KEY);
                await checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, LOVABLE_API_KEY, TELEGRAM_API_KEY);
              }
            }
          }
        }
        await admin.from("telegram_messages")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      // /start CODE → link account
      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})/i);
      if (startMatch) {
        const code = startMatch[1];
        const { data: codeRow } = await admin.from("telegram_link_codes")
          .select("*").eq("code", code).maybeSingle();
        if (!codeRow) {
          await tgSend(chatId, "❌ Código inválido ou expirado. Gere um novo no app.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (new Date(codeRow.expires_at).getTime() < Date.now()) {
          await admin.from("telegram_link_codes").delete().eq("id", codeRow.id);
          await tgSend(chatId, "⏰ Código expirado. Gere um novo no app.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else {
          // Remove any prior link for this chat or user
          await admin.from("telegram_links").delete().or(`chat_id.eq.${chatId},user_id.eq.${codeRow.user_id}`);
          invalidateLinkCache(chatId);
          const { error: linkErr } = await admin.from("telegram_links")
            .insert({ user_id: codeRow.user_id, chat_id: chatId });
          if (linkErr) {
            await tgSend(chatId, "❌ Erro ao vincular: " + linkErr.message, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            await admin.from("telegram_link_codes").delete().eq("id", codeRow.id);
            invalidateLinkCache(chatId);
            await tgSend(chatId, "✅ *Conta vinculada!*\n\n" + HELP_TEXT, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          }
        }
      } else if (/^\/start\b/i.test(text)) {
        await tgSend(chatId, "👋 Para vincular sua conta, gere um código de 6 dígitos no app e envie:\n`/start 123456`", LOVABLE_API_KEY, TELEGRAM_API_KEY);
      } else if (/^\/help\b/i.test(text)) {
        await tgSend(chatId, HELP_TEXT, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      } else if (text) {
        // Resolve user (cached)
        const userId = await getLinkedUserId(admin, chatId);
        const link = userId ? { user_id: userId } : null;
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Use o app para gerar um código e envie `/start CODIGO`.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else {
          // ✏️ Pending edit interception (before any other text handling)
          const { data: pending } = await admin.from("telegram_pending_edits")
            .select("*").eq("chat_id", chatId).maybeSingle();

          let pendingHandled = false;
          if (pending) {
            const expired = new Date(pending.expires_at).getTime() < Date.now();
            if (expired) {
              await admin.from("telegram_pending_edits").delete().eq("chat_id", chatId);
            } else if (/^\/cancelar\b/i.test(text)) {
              await admin.from("telegram_pending_edits").delete().eq("chat_id", chatId);
              await tgEditReplyMarkup(chatId, pending.message_id, buildExpenseKeyboard(pending.expense_id), LOVABLE_API_KEY, TELEGRAM_API_KEY);
              await tgSend(chatId, "✏️ Edição cancelada.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
              pendingHandled = true;
            } else {
              const newAmount = parseAmount(text);
              if (newAmount === null) {
                await tgSend(chatId, "❌ Não entendi o valor. Envie só o número (ex: `45,90`) ou `/cancelar` para sair.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
                pendingHandled = true;
              } else {
                const { data: exp, error: updErr } = await admin.from("expenses")
                  .update({ amount: newAmount })
                  .eq("id", pending.expense_id).eq("user_id", link.user_id)
                  .select("description, category, paid_date, due_date").maybeSingle();
                await admin.from("telegram_pending_edits").delete().eq("chat_id", chatId);
                if (updErr || !exp) {
                  await tgSend(chatId, "❌ Erro ao atualizar valor.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
                } else {
                  const fmt = fmtBRL(newAmount);
                  const date = exp.paid_date || exp.due_date || "";
                  await tgEditMessage(
                    chatId, pending.message_id,
                    `✏️ *Despesa atualizada*\n\n💰 ${fmt}\n📂 ${exp.category}\n📝 ${exp.description}\n📅 ${date}`,
                    buildExpenseKeyboard(pending.expense_id),
                    LOVABLE_API_KEY, TELEGRAM_API_KEY,
                  );
                  await tgSend(chatId, `✅ Valor atualizado para *${fmt}*`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
                  await checkBudgetAndAlert(admin, link.user_id, chatId, exp.category, LOVABLE_API_KEY, TELEGRAM_API_KEY);
                }
                pendingHandled = true;
              }
            }
          }

          if (!pendingHandled) {
            if (/^\/saldo(?:@\w+)?\b/i.test(text)) {
              const reply = await handleSaldo(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else if (/^\/mes(?:@\w+)?\b/i.test(text)) {
              const reply = await handleMes(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else if (/^\/semana(?:@\w+)?\b/i.test(text)) {
              const reply = await handleSemana(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else if (/^\/comparar(?:@\w+)?\b/i.test(text)) {
              const reply = await handleComparar(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else if (/^\/orcamento(?:s)?(?:@\w+)?\b/i.test(text)) {
              const reply = await handleOrcamento(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else if (/^\/ultimas(?:@\w+)?\b/i.test(text)) {
              const reply = await handleUltimas(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else if (/^\/apagar(?:@\w+)?\b/i.test(text)) {
              const reply = await handleApagar(admin, link.user_id);
              await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else {
              // Regex-first: skip AI for clear "<amount> <description>" or "<description> <amount>" inputs.
              const quick = quickParseExpense(text);
              const today = new Date().toISOString().slice(0, 10);
              let extracted: any = null;
              if (quick) {
                extracted = {
                  description: quick.description,
                  amount: quick.amount,
                  category: quick.category,
                  date: today,
                  confidence: 1,
                };
              } else {
                extracted = await extractExpense(text, LOVABLE_API_KEY);
              }
              if (!extracted || !extracted.amount || extracted.confidence < 0.6) {
                await tgSend(chatId, "🤔 Não consegui entender. Tente algo como:\n_\"mercado 80 alimentação\"_ ou _\"uber 25 ontem\"_", LOVABLE_API_KEY, TELEGRAM_API_KEY);
              } else {
                const { data: ins, error: insErr } = await admin.from("expenses").insert({
                  user_id: link.user_id,
                  description: extracted.description || text.slice(0, 80),
                  amount: extracted.amount,
                  category: CATEGORIES.includes(extracted.category) ? extracted.category : "Outros",
                  due_date: extracted.date || today,
                  type: "fixa",
                  scope: "personal",
                  paid: true,
                  paid_date: extracted.date || today,
                }).select("id").single();
                if (insErr || !ins) {
                  await tgSend(chatId, "❌ Erro ao salvar: " + (insErr?.message ?? "desconhecido"), LOVABLE_API_KEY, TELEGRAM_API_KEY);
                } else {
                  const finalCategory = CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
                  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                  await tgSendWithKeyboard(chatId,
                    `✅ *Despesa registrada*\n\n💰 ${fmt}\n📂 ${finalCategory}\n📝 ${extracted.description}\n📅 ${extracted.date}`,
                    buildExpenseKeyboard(ins.id),
                    LOVABLE_API_KEY, TELEGRAM_API_KEY);
                  await checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, LOVABLE_API_KEY, TELEGRAM_API_KEY);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("processing error", e);
    }

    await admin.from("telegram_messages")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("update_id", msg.update_id);
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
