import { Sale } from "@/types/loan";
import { format, addMonths, addWeeks, addDays } from "date-fns";

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}

function formatCurrencyBR(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function generateContract(sale: Sale) {
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const defaultValorParcela = sale.installments > 0
    ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments
    : sale.total;

  const parcelas = Array.from({ length: sale.installments }, (_, i) => {
    const instBaseDate = new Date(sale.date + "T00:00:00");
    const customDate = sale.installmentDates && sale.installmentDates[i];
    const dueDate = customDate
      ? new Date(customDate + "T00:00:00")
      : isRecorrente
        ? addByFrequency(instBaseDate, sale.frequency || "Mensal", i)
        : instBaseDate;
    const amounts = sale.installmentAmounts;
    const value = amounts && amounts[i] != null ? amounts[i] : defaultValorParcela;
    return { number: i + 1, date: format(dueDate, "dd/MM/yyyy"), value };
  });

  const today = format(new Date(), "dd/MM/yyyy");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato - ${sale.customerName || sale.description}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .subtitle { text-align: center; font-size: 13px; color: #666; margin-bottom: 32px; }
  h2 { font-size: 15px; margin: 24px 0 12px; padding-bottom: 4px; border-bottom: 2px solid #333; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
  .info-item { font-size: 14px; }
  .info-item strong { color: #333; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
  td.currency { text-align: right; font-family: 'Courier New', monospace; }
  .terms { font-size: 13px; margin: 16px 0; }
  .terms p { margin-bottom: 8px; }
  .signatures { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 8px; font-size: 13px; }
  .sig-name { font-weight: 600; }
  .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <h1>Contrato de ${sale.businessType === "aluguel_veiculo" ? "Aluguel de Veículo" : sale.businessType === "streaming" ? "Serviço de Streaming" : "Venda"}</h1>
  <p class="subtitle">Data de emissão: ${today}</p>

  <h2>Dados do Cliente</h2>
  <div class="info-grid">
    <div class="info-item"><strong>Nome:</strong> ${sale.customerName || "—"}</div>
    <div class="info-item"><strong>Data do Contrato:</strong> ${format(new Date(sale.date + "T00:00:00"), "dd/MM/yyyy")}</div>
  </div>

  <h2>Dados do Serviço / Produto</h2>
  <div class="info-grid">
    <div class="info-item"><strong>Descrição:</strong> ${sale.description || sale.productName || "—"}</div>
    <div class="info-item"><strong>Quantidade:</strong> ${sale.quantity}</div>
    <div class="info-item"><strong>Valor Total:</strong> ${formatCurrencyBR(sale.total)}</div>
    <div class="info-item"><strong>Forma de Pagamento:</strong> ${isRecorrente ? `${sale.installments}x ${sale.frequency || "Mensal"}` : "À Vista"}</div>
    ${sale.downPayment ? `<div class="info-item"><strong>Entrada:</strong> ${formatCurrencyBR(sale.downPayment)}</div>` : ""}
  </div>

  ${parcelas.length > 1 ? `
  <h2>Plano de Parcelas</h2>
  <table>
    <thead>
      <tr>
        <th>Parcela</th>
        <th>Vencimento</th>
        <th>Valor</th>
      </tr>
    </thead>
    <tbody>
      ${parcelas.map(p => `
      <tr>
        <td>${p.number}ª</td>
        <td>${p.date}</td>
        <td class="currency">${formatCurrencyBR(p.value)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
  ` : ""}

  ${sale.notes ? `
  <h2>Observações</h2>
  <div class="terms"><p>${sale.notes}</p></div>
  ` : ""}

  <h2>Termos e Condições</h2>
  <div class="terms">
    <p>1. O presente contrato é celebrado entre as partes acima identificadas, regido pelas condições aqui estabelecidas.</p>
    <p>2. O pagamento deverá ser realizado conforme o plano de parcelas descrito, nas datas de vencimento estipuladas.</p>
    <p>3. O atraso no pagamento poderá acarretar a aplicação de multa e juros conforme legislação vigente.</p>
    <p>4. Ambas as partes declaram ter lido e concordado com todas as cláusulas deste contrato.</p>
  </div>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line">
        <p class="sig-name">Contratante</p>
        <p>${sale.customerName || "___________________"}</p>
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-line">
        <p class="sig-name">Contratado</p>
        <p>___________________</p>
      </div>
    </div>
  </div>

  <p class="footer">Documento gerado em ${today}</p>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
