// Auto-pays personal expenses tagged [Débito automático] when due_date <= today.
// Mirrors the logic of useExpenses.payExpense for parcelada vs simple expenses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTO_DEBIT_RE = /\[\s*D[ée]bito autom[áa]tico\s*\]/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().split("T")[0];

  // Fetch all unpaid personal expenses past or due today
  const { data: candidates, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("paid", false)
    .eq("scope", "personal")
    .lte("due_date", today);

  if (error) {
    console.error("[auto-debit] fetch error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets = (candidates ?? []).filter((e: any) => AUTO_DEBIT_RE.test(e.notes ?? ""));
  console.log(`[auto-debit] candidates=${candidates?.length ?? 0} targets=${targets.length}`);

  let paidCount = 0;
  for (const exp of targets) {
    const isParcelada = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    try {
      if (isParcelada) {
        const installmentAmount = Number(exp.amount) / exp.installments;
        const newPaid = (exp.paid_installments || 0) + 1;
        const fullyPaid = newPaid >= exp.installments;
        const currentDue = new Date(exp.due_date + "T00:00:00");
        currentDue.setMonth(currentDue.getMonth() + 1);
        const nextDueDate = currentDue.toISOString().split("T")[0];

        await supabase.from("expenses").insert({
          user_id: exp.user_id,
          description: `${exp.description} (${newPaid}/${exp.installments})`,
          amount: installmentAmount,
          type: "fixa",
          category: exp.category,
          installments: null,
          paid_installments: null,
          due_date: exp.due_date,
          paid: true,
          paid_date: today,
          notes: exp.notes,
          parent_expense_id: exp.id,
          scope: "personal",
        });

        await supabase.from("expenses").update({
          paid_installments: newPaid,
          paid: fullyPaid,
          due_date: fullyPaid ? exp.due_date : nextDueDate,
          paid_date: fullyPaid ? today : null,
        }).eq("id", exp.id);
      } else {
        await supabase.from("expenses").update({
          paid: true,
          paid_date: today,
        }).eq("id", exp.id);
      }
      paidCount++;
    } catch (e) {
      console.error("[auto-debit] failed for", exp.id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: paidCount, scanned: targets.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
