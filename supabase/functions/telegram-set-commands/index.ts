const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://api.telegram.org';

// Comandos do bot de DESPESAS (TELEGRAM_API_KEY)
const EXPENSES_COMMANDS = [
  { command: 'saldo', description: 'Gastos do mês por categoria' },
  { command: 'mes', description: 'Resumo completo do mês atual' },
  { command: 'semana', description: 'Resumo dos últimos 7 dias' },
  { command: 'comparar', description: 'Compara este mês com o anterior' },
  { command: 'orcamento', description: 'Status dos orçamentos do mês' },
  { command: 'ultimas', description: 'Últimas 5 despesas' },
  { command: 'apagar', description: 'Apaga a despesa mais recente' },
  { command: 'aporte', description: 'Fazer aporte em uma caixinha (cofrinho)' },
  { command: 'meus_aportes', description: 'Últimos 10 aportes nas caixinhas' },
  { command: 'resgatar', description: 'Resgatar saldo da caixinha para a conta' },
  { command: 'code', description: 'Gerar código para vincular este bot ao app' },
  { command: 'help', description: 'Mostra ajuda' },
  { command: 'start', description: 'Vincular conta com código' },
];

// Comandos do bot de RELATÓRIOS (TELEGRAM_API_KEY_1)
const REPORTS_COMMANDS = [
  { command: 'code', description: 'Gerar código para vincular este bot ao app' },
  { command: 'start', description: 'Vincular bot de relatórios com código' },
  { command: 'help', description: 'Mostra ajuda' },
];

async function publishCommands(
  lovableKey: string,
  telegramKey: string,
  commands: { command: string; description: string }[],
) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const setCmdRes = await fetch(`${GATEWAY_URL}/bot${telegramKey}/setMyCommands`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ commands }),
  });
  const setCmdData = await setCmdRes.json();
  if (!setCmdRes.ok) {
    throw new Error(`setMyCommands failed [${setCmdRes.status}]: ${JSON.stringify(setCmdData)}`);
  }

  const setBtnRes = await fetch(`${GATEWAY_URL}/bot${telegramKey}/setChatMenuButton`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ menu_button: { type: 'commands' } }),
  });
  const setBtnData = await setBtnRes.json();
  if (!setBtnRes.ok) {
    throw new Error(`setChatMenuButton failed [${setBtnRes.status}]: ${JSON.stringify(setBtnData)}`);
  }

  return { setMyCommands: setCmdData, setChatMenuButton: setBtnData };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const EXPENSES_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const REPORTS_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS");

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const result: Record<string, any> = {};

    if (EXPENSES_KEY) {
      result.expenses = await publishCommands(LOVABLE_API_KEY, EXPENSES_KEY, EXPENSES_COMMANDS);
    } else {
      result.expenses = { skipped: 'missing TELEGRAM_API_KEY' };
    }

    if (REPORTS_KEY) {
      result.reports = await publishCommands(LOVABLE_API_KEY, REPORTS_KEY, REPORTS_COMMANDS);
    } else {
      result.reports = { skipped: 'missing TELEGRAM_API_KEY_1' };
    }

    return new Response(
      JSON.stringify({ ok: true, expenses_commands: EXPENSES_COMMANDS, reports_commands: REPORTS_COMMANDS, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('telegram-set-commands error:', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
