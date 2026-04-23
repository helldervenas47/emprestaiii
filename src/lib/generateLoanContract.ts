import { Loan, Payment, InstallmentSchedule, Client } from "@/types/loan";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { LocadorInfo } from "@/hooks/useLocadorInfo";

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  if (frequency === "Diário") return addDays(date, n);
  return addMonths(date, n);
}

function formatCurrencyBR(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function escapeHtml(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const e = escapeHtml;

function numberToWords(n: number): string {
  const units = ["", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove"];
  const teens = ["Dez", "Onze", "Doze", "Treze", "Quatorze", "Quinze", "Dezesseis", "Dezessete", "Dezoito", "Dezenove"];
  const tens = ["", "", "Vinte", "Trinta", "Quarenta", "Cinquenta", "Sessenta", "Setenta", "Oitenta", "Noventa"];
  const hundreds = ["", "Cento", "Duzentos", "Trezentos", "Quatrocentos", "Quinhentos", "Seiscentos", "Setecentos", "Oitocentos", "Novecentos"];

  if (!isFinite(n) || n < 0) return "";
  if (n === 0) return "Zero Reais";
  if (n === 100) return "Cem Reais";

  const parts: string[] = [];
  const intPart = Math.floor(n);
  const centsPart = Math.round((n - intPart) * 100);

  if (intPart >= 1000) {
    const thousands = Math.floor(intPart / 1000);
    if (thousands === 1) parts.push("Mil");
    else if (thousands < 10) parts.push(units[thousands] + " Mil");
    else parts.push(String(thousands) + " Mil");
  }

  const remainder = intPart % 1000;
  if (remainder >= 100) {
    if (remainder === 100) parts.push("Cem");
    else parts.push(hundreds[Math.floor(remainder / 100)]);
  }
  const lastTwo = remainder % 100;
  if (lastTwo >= 10 && lastTwo < 20) {
    parts.push(teens[lastTwo - 10]);
  } else {
    if (lastTwo >= 20) parts.push(tens[Math.floor(lastTwo / 10)]);
    if (lastTwo % 10 > 0) parts.push(units[lastTwo % 10]);
  }

  let result = parts.join(" e ") + " Reais";
  if (centsPart > 0) {
    if (centsPart < 10) result += " e " + units[centsPart] + " Centavos";
    else if (centsPart < 20) result += " e " + teens[centsPart - 10] + " Centavos";
    else {
      const t = tens[Math.floor(centsPart / 10)];
      const u = centsPart % 10 > 0 ? " e " + units[centsPart % 10] : "";
      result += " e " + t + u + " Centavos";
    }
  }
  return result;
}

function frequencyLabel(interestType: string): { period: string; periodPlural: string } {
  if (interestType === "Semanal") return { period: "semana", periodPlural: "semanas" };
  if (interestType === "Quinzenal") return { period: "quinzena", periodPlural: "quinzenas" };
  if (interestType === "Diário") return { period: "dia", periodPlural: "dias" };
  return { period: "mês", periodPlural: "meses" };
}

export async function generateLoanContract(
  loan: Loan,
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  client?: Client,
  locador?: LocadorInfo,
) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Não foi possível abrir o contrato. Permita pop-ups para este site e tente novamente.");
    return;
  }
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Gerando contrato...</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;">Gerando contrato...</body></html>');

  const principal = Number(loan.amount) || 0;
  const rate = Number(loan.interestRate) || 0;
  const installmentsCount = Math.max(1, Number(loan.installments) || 1);
  const interestPerPeriod = principal * (rate / 100);
  const totalCalc = principal + interestPerPeriod * installmentsCount;

  // Pagamentos efetivamente realizados (parcelas com installmentNumber > 0)
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const principalPaid = loanPayments
    .filter((p) => p.installmentNumber > 0)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // Restante a receber: usa o campo do empréstimo como fonte de verdade
  const remainingFromLoan = loan.remainingAmount != null && loan.remainingAmount > 0
    ? Number(loan.remainingAmount)
    : Math.max(0, totalCalc - principalPaid);
  const totalReceberContrato = totalCalc;

  // Datas/valores das parcelas (usa cronograma salvo se houver)
  const sortedSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const baseDate = new Date(loan.startDate + "T00:00:00");
  const defaultInstallment = installmentsCount > 0 ? totalCalc / installmentsCount : totalCalc;

  const parcelas = Array.from({ length: installmentsCount }, (_, i) => {
    const scheduled = sortedSchedules.find((s) => s.installmentNumber === i + 1);
    let dueDate: Date;
    if (scheduled?.dueDate) {
      dueDate = new Date(scheduled.dueDate + "T00:00:00");
    } else if (i === 0 && loan.dueDate) {
      dueDate = new Date(loan.dueDate + "T00:00:00");
    } else {
      const anchor = loan.dueDate ? new Date(loan.dueDate + "T00:00:00") : baseDate;
      dueDate = addByFrequency(anchor, loan.interestType, i);
    }
    const value = scheduled?.amount && scheduled.amount > 0
      ? Number(scheduled.amount)
      : (loan.customInstallmentValue != null && loan.customInstallmentValue > 0
        ? Number(loan.customInstallmentValue)
        : defaultInstallment);
    return { number: i + 1, date: format(dueDate, "dd/MM/yyyy"), value };
  });

  const today = format(new Date(), "dd/MM/yyyy");
  const startDate = format(new Date(loan.startDate + "T00:00:00"), "dd/MM/yyyy");
  const lastParcelaDate = parcelas.length > 0
    ? new Date(parcelas[parcelas.length - 1].date.split("/").reverse().join("-") + "T00:00:00")
    : new Date(loan.startDate + "T00:00:00");
  const endDate = format(lastParcelaDate, "dd/MM/yyyy");

  const { period, periodPlural } = frequencyLabel(loan.interestType);
  const valorPrincipalFmt = formatCurrencyBR(principal);
  const valorPrincipalExtenso = numberToWords(principal);
  const valorTotalFmt = formatCurrencyBR(totalReceberContrato);
  const valorTotalExtenso = numberToWords(totalReceberContrato);
  const valorRestanteFmt = formatCurrencyBR(remainingFromLoan);
  const valorRestanteExtenso = numberToWords(remainingFromLoan);
  const valorParcelaFmt = formatCurrencyBR(parcelas[0]?.value || 0);

  const parcelasRows = parcelas
    .map((p) => `<tr><td>${p.number}</td><td>${p.date}</td><td class="right">${formatCurrencyBR(p.value)}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato de Empréstimo - ${e(loan.borrowerName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 50px 60px; max-width: 800px; margin: 0 auto; line-height: 1.7; font-size: 14px; }
  h1 { text-align: center; font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 28px; letter-spacing: 1px; }
  p { margin-bottom: 12px; text-align: justify; }
  .party { margin-bottom: 6px; }
  h2 { font-size: 14px; font-weight: bold; margin: 22px 0 8px; text-transform: uppercase; }
  ul { margin: 8px 0 12px 20px; list-style: none; }
  ul li { margin-bottom: 4px; }
  ul li::before { content: "- "; }
  .clause-list p { margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 13px; }
  th, td { border: 1px solid #666; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: bold; font-size: 12px; text-transform: uppercase; }
  td.right, th.right { text-align: right; }
  .signatures { margin-top: 50px; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 50px; gap: 40px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #000; padding-top: 6px; font-size: 13px; }
  .witness-row { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; }
  .witness-block { flex: 1; }
  .witness-line { border-top: 1px solid #000; padding-top: 6px; font-size: 13px; }
  .location-date { margin-top: 30px; font-size: 14px; }
  .action-bar { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 9999; }
  .action-btn { color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .pdf-btn { background: #2563eb; } .pdf-btn:hover { background: #1d4ed8; } .pdf-btn:disabled { background: #94a3b8; cursor: wait; }
  .print-btn { background: #16a34a; } .print-btn:hover { background: #15803d; }
  .close-btn { background: #e53e3e; } .close-btn:hover { background: #c53030; }
  @media print { .action-bar { display: none; } body { padding: 30px 40px; } @page { margin: 1.5cm; } }
</style>
</head>
<body>

<div class="action-bar">
  <button class="action-btn pdf-btn" id="downloadPdfBtn">⬇ Baixar PDF</button>
  <button class="action-btn print-btn" onclick="window.print()">🖨 Imprimir</button>
  <button class="action-btn close-btn" onclick="window.close()">✕ Fechar</button>
</div>

<div id="contractContent">

<h1>Contrato de Mútuo (Empréstimo)</h1>

<p>Pelo presente instrumento particular, de um lado:</p>

<p class="party"><strong>MUTUANTE (CREDOR):</strong> ${e(locador?.nome) || "____________________________________________"}, ${e(locador?.nacionalidade) || "Brasileiro(a)"}, ${e(locador?.profissao) || "________________"}, portador(a) do RG nº ${e(locador?.rg) || "__________________"}, CPF nº ${e(locador?.cpf) || "__________________"}, residente e domiciliado(a) à ${locador?.endereco ? `${e(locador.endereco)}${locador.cidade ? `, ${e(locador.cidade)}` : ""}` : "____________________________________________"}.</p>

<p class="party"><strong>MUTUÁRIO (DEVEDOR):</strong> ${e(loan.borrowerName) || "____________________________________________"}, ${e(client?.nacionalidade) || "Brasileiro(a)"}, ${e(client?.estadoCivil) || "________________"}, ${e(client?.profissao) || "________________"}, portador(a) do RG nº ${e(client?.rg) || e(loan.borrowerId) || "__________________"}, CPF nº ${e(client?.cpf) || "__________________"}, residente e domiciliado(a) à ${client?.address ? `${e(client.address)}${client.bairro ? `, ${e(client.bairro)}` : ""}${client.city ? `, ${e(client.city)}` : ""}` : "____________________________________________"}.</p>

<p>As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Mútuo, que será regido pelas cláusulas seguintes:</p>

<h2>CLÁUSULA 1ª – DO OBJETO</h2>
<p>O MUTUANTE empresta ao MUTUÁRIO, a título de mútuo, a quantia de <strong>${valorPrincipalFmt}</strong> (${valorPrincipalExtenso}), entregue nesta data em moeda corrente nacional, da qual o MUTUÁRIO se declara recebedor.</p>

<h2>CLÁUSULA 2ª – DOS JUROS</h2>
<p>Sobre o valor mutuado incidirão juros remuneratórios à taxa de <strong>${rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% (${numberToWords(rate).replace(" Reais", "")}por cento) por ${period}</strong>, calculados sobre o saldo devedor.</p>

<h2>CLÁUSULA 3ª – DO PRAZO E FORMA DE PAGAMENTO</h2>
<p>O MUTUÁRIO obriga-se a restituir ao MUTUANTE o valor total de <strong>${valorTotalFmt}</strong> (${valorTotalExtenso}), em <strong>${installmentsCount} (${numberToWords(installmentsCount).replace(" Reais", "").trim()}) parcela${installmentsCount > 1 ? "s" : ""}</strong> ${installmentsCount > 1 ? `${period === "mês" ? "mensais" : period === "semana" ? "semanais" : period === "quinzena" ? "quinzenais" : "diárias"}` : ""}, com vencimento da primeira parcela em <strong>${parcelas[0]?.date || startDate}</strong> e da última em <strong>${endDate}</strong>.</p>

<p>Cada parcela terá o valor de <strong>${valorParcelaFmt}</strong>, conforme cronograma abaixo:</p>

<table>
  <thead>
    <tr><th>Parcela</th><th>Vencimento</th><th class="right">Valor</th></tr>
  </thead>
  <tbody>
    ${parcelasRows}
  </tbody>
</table>

<h2>CLÁUSULA 4ª – DO SALDO DEVEDOR</h2>
<p>Na presente data, considerando os pagamentos já realizados (${loan.paidInstallments || 0} de ${installmentsCount} parcela${installmentsCount > 1 ? "s" : ""}), o saldo restante a ser pago pelo MUTUÁRIO ao MUTUANTE é de <strong>${valorRestanteFmt}</strong>${valorRestanteExtenso ? ` (${valorRestanteExtenso})` : ""}.</p>

<h2>CLÁUSULA 5ª – DA MORA</h2>
<p>O atraso no pagamento de qualquer parcela acarretará${loan.lateInterestValue ? ` juros moratórios de ${loan.lateInterestType === "fixed" ? `${formatCurrencyBR(Number(loan.lateInterestValue))} por dia` : `${Number(loan.lateInterestValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% ao dia`}` : " a incidência de juros moratórios"}${loan.penaltyValue ? ` e multa de ${formatCurrencyBR(Number(loan.penaltyValue))} por parcela em atraso` : ""}, sem prejuízo da exigibilidade imediata do saldo devedor.</p>

<h2>CLÁUSULA 6ª – DAS OBRIGAÇÕES DO MUTUÁRIO</h2>
<div class="clause-list">
  <p>a) Restituir integralmente o valor mutuado, acrescido dos juros pactuados, nos prazos e condições estabelecidos;</p>
  <p>b) Comunicar ao MUTUANTE qualquer alteração em seus dados cadastrais ou impossibilidade de cumprir o pagamento;</p>
  <p>c) Arcar com eventuais despesas de cobrança, judiciais ou extrajudiciais, em caso de inadimplemento.</p>
</div>

<h2>CLÁUSULA 7ª – DO VENCIMENTO ANTECIPADO</h2>
<p>Em caso de inadimplemento de qualquer parcela por prazo superior a 30 (trinta) dias, ou de descumprimento de quaisquer cláusulas deste contrato, o MUTUANTE poderá considerar antecipadamente vencida toda a dívida, exigindo o saldo devedor de imediato.</p>

<h2>CLÁUSULA 8ª – DO FORO</h2>
<p>Fica eleito o foro da comarca de São Gonçalo dos Campos-BA para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

${loan.notes ? `<h2>OBSERVAÇÕES</h2><p>${e(loan.notes).replace(/\n/g, "<br>")}</p>` : ""}

<p class="location-date">São Gonçalo dos Campos - BA, ${today}.</p>

<div class="signatures">
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line"><strong>MUTUANTE:</strong> ___________________________<br>${e(locador?.nome) || ""}</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"><strong>MUTUÁRIO:</strong> ___________________________<br>${e(loan.borrowerName) || ""}</div>
    </div>
  </div>

  <div class="witness-row">
    <div class="witness-block">
      <div class="witness-line"><strong>TESTEMUNHA 1:</strong> ___________________________ CPF: _______________</div>
    </div>
    <div class="witness-block">
      <div class="witness-line"><strong>TESTEMUNHA 2:</strong> ___________________________ CPF: _______________</div>
    </div>
  </div>
</div>

</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  (function() {
    var btn = document.getElementById('downloadPdfBtn');
    var safeName = ${JSON.stringify((loan.borrowerName || "contrato").replace(/[^\w\-]+/g, "_"))};
    btn.addEventListener('click', function() {
      if (typeof html2pdf === 'undefined') {
        alert('Biblioteca de PDF ainda não carregou. Tente novamente em instantes.');
        return;
      }
      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = 'Gerando...';
      var element = document.getElementById('contractContent');
      var opt = {
        margin: [10, 12, 10, 12],
        filename: 'Contrato_Emprestimo_' + safeName + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };
      html2pdf().set(opt).from(element).save().then(function() {
        btn.disabled = false;
        btn.textContent = originalText;
      }).catch(function(err) {
        console.error(err);
        alert('Erro ao gerar PDF: ' + (err && err.message ? err.message : 'desconhecido'));
        btn.disabled = false;
        btn.textContent = originalText;
      });
    });
  })();
</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
