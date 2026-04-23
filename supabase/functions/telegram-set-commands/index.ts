const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const COMMANDS = [
  { command: 'saldo', description: 'Gastos do mês por categoria' },
  { command: 'mes', description: 'Resumo completo do mês atual' },
  { command: 'semana', description: 'Resumo dos últimos 7 dias' },
  { command: 'comparar', description: 'Compara este mês com o anterior' },
  { command: 'orcamento', description: 'Status dos orçamentos do mês' },
  { command: 'ultimas', description: 'Últimas 5 despesas' },
  { command: 'apagar', description: 'Apaga a despesa mais recente' },
  { command: 'aporte', description: 'Fazer aporte em uma caixinha (cofrinho)' },
  { command: 'meus_aportes', description: 'Últimos 10 aportes nas caixinhas' },
  { command: 'help', description: 'Mostra ajuda' },
  { command: 'start', description: 'Vincular conta com código' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY_2');

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing LOVABLE_API_KEY or TELEGRAM_API_KEY_2' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const headers = {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': TELEGRAM_API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const setCmdRes = await fetch(`${GATEWAY_URL}/setMyCommands`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ commands: COMMANDS }),
    });
    const setCmdData = await setCmdRes.json();
    if (!setCmdRes.ok) {
      throw new Error(`setMyCommands failed [${setCmdRes.status}]: ${JSON.stringify(setCmdData)}`);
    }

    const setBtnRes = await fetch(`${GATEWAY_URL}/setChatMenuButton`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ menu_button: { type: 'commands' } }),
    });
    const setBtnData = await setBtnRes.json();
    if (!setBtnRes.ok) {
      throw new Error(`setChatMenuButton failed [${setBtnRes.status}]: ${JSON.stringify(setBtnData)}`);
    }

    return new Response(
      JSON.stringify({ ok: true, commands: COMMANDS, setMyCommands: setCmdData, setChatMenuButton: setBtnData }),
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
