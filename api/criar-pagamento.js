// api/criar-pagamento.js
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { numeros, nome, email, instagram, telefone } = req.body;

  if (!numeros || !Array.isArray(numeros) || numeros.length === 0)
    return res.status(400).json({ erro: 'Informe os números desejados' });
  if (!nome || !email)
    return res.status(400).json({ erro: 'Nome e e-mail são obrigatórios' });
  if (!instagram)
    return res.status(400).json({ erro: 'Instagram é obrigatório para notificação do prêmio' });

  // Verificar disponibilidade
  const { data: bilhetesExistentes, error: erroBusca } = await supabase
    .from('bilhetes')
    .select('numero, status')
    .in('numero', numeros);

  if (erroBusca) return res.status(500).json({ erro: 'Erro ao verificar bilhetes' });

  const indisponiveis = bilhetesExistentes.filter(b => b.status !== 'disponivel');
  if (indisponiveis.length > 0) {
    return res.status(409).json({
      erro: 'Alguns números já foram reservados',
      numeros: indisponiveis.map(b => b.numero)
    });
  }

  // Buscar valor do bilhete
  const { data: configValor } = await supabase
    .from('config')
    .select('valor')
    .eq('chave', 'valor_bilhete')
    .single();

  const valorUnitario = parseFloat(configValor?.valor || '10.00');
  const valorTotal = valorUnitario * numeros.length;

  // Reservar bilhetes
  const { error: erroReserva } = await supabase
    .from('bilhetes')
    .update({
      status: 'reservado',
      nome_comprador: nome,
      email_comprador: email,
      instagram_comprador: instagram,
      telefone_comprador: telefone || null,
      reservado_em: new Date().toISOString()
    })
    .in('numero', numeros)
    .eq('status', 'disponivel');

  if (erroReserva) return res.status(500).json({ erro: 'Erro ao reservar bilhetes' });

  // MODO DEMO: sem token do MP configurado OU forçado via config no Supabase
  const { data: configDemo } = await supabase.from('config').select('valor').eq('chave', 'modo_demo').single();
  const modoDemo = !process.env.MP_ACCESS_TOKEN
    || process.env.MP_ACCESS_TOKEN === 'SEU_TOKEN_AQUI'
    || configDemo?.valor === 'true';

  if (modoDemo) {
    const numerosStr = numeros.map(n => String(n).padStart(3, '0')).join(', ');
    return res.status(200).json({
      modo_demo: true,
      mensagem: `Bilhetes ${numerosStr} reservados para ${nome}! O link de pagamento será ativado em breve.`
    });
  }

  // PAGAMENTO REAL via Mercado Pago
  const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(mp);
  const numerosStr = numeros.join(', ');

  try {
    const response = await preference.create({
      body: {
        items: [{
          title: `Rifa Nexus — Bilhetes nº ${numerosStr}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valorTotal
        }],
        payer: { name: nome, email: email, phone: telefone ? { number: telefone } : undefined },
        payment_methods: {
          excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }]
        },
        notification_url: `${process.env.SITE_URL}/api/webhook`,
        back_urls: {
          success: `${process.env.SITE_URL}/sucesso.html`,
          failure: `${process.env.SITE_URL}/falha.html`,
          pending: `${process.env.SITE_URL}/pendente.html`
        },
        auto_return: 'approved',
        metadata: { numeros, nome, email, instagram }
      }
    });

    await supabase.from('bilhetes').update({ preference_id: response.id }).in('numero', numeros);

    return res.status(200).json({
      preference_id: response.id,
      init_point: response.init_point,
      valor_total: valorTotal
    });

  } catch (err) {
    await supabase
      .from('bilhetes')
      .update({ status: 'disponivel', nome_comprador: null, email_comprador: null, instagram_comprador: null, reservado_em: null })
      .in('numero', numeros);

    console.error('Erro MP:', err);
    return res.status(500).json({ erro: 'Erro ao criar pagamento' });
  }
}
