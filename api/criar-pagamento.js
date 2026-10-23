// api/criar-pagamento.js — reserva bilhetes da rifa e gera o pagamento (Pix) no Mercado Pago
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { liberarExpirados, normalizarNumeros, LIMPAR_COMPRADOR, PAGAMENTO_EXPIRA_MINUTOS, MAX_BILHETES_POR_COMPRA } from './_lib/rifa.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const limpar = (v, max) => String(v || '').trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const body = req.body || {};
  const numeros = normalizarNumeros(body.numeros);
  const nome = limpar(body.nome, 120);
  const email = limpar(body.email, 160).toLowerCase();
  const instagram = limpar(body.instagram, 60);
  const telefone = limpar(body.telefone, 30);

  if (!numeros)
    return res.status(400).json({ erro: `Escolha de 1 a ${MAX_BILHETES_POR_COMPRA} números válidos` });
  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ erro: 'Nome e e-mail válidos são obrigatórios' });
  if (!instagram || instagram === '@')
    return res.status(400).json({ erro: 'Instagram é obrigatório para notificação do prêmio' });

  // Reservas vencidas voltam a ficar disponíveis antes de checar
  await liberarExpirados(supabase);

  // Valor do bilhete sempre vem do banco
  const { data: configValor } = await supabase.from('config').select('valor').eq('chave', 'valor_bilhete').maybeSingle();
  const valorUnitario = parseFloat(configValor?.valor || '10.00');
  const valorTotal = Math.round(valorUnitario * numeros.length * 100) / 100;
  if (!(valorTotal >= 1)) {
    return res.status(400).json({ erro: 'Valor mínimo para pagamento via Pix é R$ 1,00. Configure o valor do bilhete no painel admin.' });
  }

  // Reserva atômica: o UPDATE só pega números que AINDA estão disponíveis e
  // devolve quais conseguiu. Se dois compradores clicarem ao mesmo tempo, só um
  // fica com cada número — o outro recebe erro em vez de um link de pagamento.
  const reservadoEm = new Date().toISOString();
  const { data: reservados, error: erroReserva } = await supabase
    .from('bilhetes')
    .update({
      status: 'reservado',
      nome_comprador: nome,
      email_comprador: email,
      instagram_comprador: instagram,
      telefone_comprador: telefone || null,
      reservado_em: reservadoEm
    })
    .in('numero', numeros)
    .eq('status', 'disponivel')
    .select('numero');

  if (erroReserva) return res.status(500).json({ erro: 'Erro ao reservar bilhetes' });

  const pegos = (reservados || []).map(b => b.numero);
  if (pegos.length !== numeros.length) {
    // Desfaz só o que ESTA requisição reservou
    if (pegos.length) {
      await supabase.from('bilhetes')
        .update({ status: 'disponivel', ...LIMPAR_COMPRADOR })
        .in('numero', pegos).eq('status', 'reservado').eq('reservado_em', reservadoEm);
    }
    const indisponiveis = numeros.filter(n => !pegos.includes(n));
    return res.status(409).json({
      erro: `Os números ${indisponiveis.map(n => String(n).padStart(3, '0')).join(', ')} acabaram de ser reservados por outra pessoa. Escolha outros.`,
      numeros: indisponiveis
    });
  }

  // MODO DEMO: sem token do MP configurado OU forçado pelo painel admin
  const { data: configDemo } = await supabase.from('config').select('valor').eq('chave', 'modo_demo').maybeSingle();
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

  const SITE = process.env.SITE_URL || 'https://nexusband.vercel.app';
  const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(mp);
  const expira = new Date(Date.now() + PAGAMENTO_EXPIRA_MINUTOS * 60 * 1000).toISOString();

  try {
    const response = await preference.create({
      body: {
        items: [{
          title: `Rifa Nexus — Bilhetes nº ${numeros.join(', ')}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valorTotal
        }],
        payer: { name: nome, email },
        payment_methods: {
          installments: 12,
          default_payment_method_id: 'pix'
        },
        back_urls: {
          success: `${SITE}/sucesso?origem=rifa`,
          failure: `${SITE}/falha?origem=rifa`,
          pending: `${SITE}/pendente?origem=rifa`
        },
        auto_return: 'approved',
        // O pagamento expira ANTES da reserva (25 x 30 min): ninguém paga por
        // um número que já voltou a ficar disponível para outra pessoa.
        expires: true,
        expiration_date_from: reservadoEm,
        expiration_date_to: expira,
        date_of_expiration: expira,
        statement_descriptor: 'RIFA NEXUS',
        external_reference: `rifa-${Date.now()}-${numeros.join('-')}`,
        notification_url: process.env.SITE_URL ? `${process.env.SITE_URL}/api/webhook` : undefined,
        metadata: { tipo: 'rifa', numeros, nome, email, instagram, telefone, valor_total: valorTotal }
      }
    });

    await supabase.from('bilhetes').update({ preference_id: response.id }).in('numero', numeros).eq('reservado_em', reservadoEm);

    return res.status(200).json({
      preference_id: response.id,
      init_point: response.init_point,
      valor_total: valorTotal
    });

  } catch (err) {
    await supabase
      .from('bilhetes')
      .update({ status: 'disponivel', ...LIMPAR_COMPRADOR })
      .in('numero', numeros).eq('status', 'reservado').eq('reservado_em', reservadoEm);

    console.error('Erro MP:', err);
    console.error('Detalhes:', JSON.stringify(err.response?.data || err.message));
    return res.status(500).json({ erro: 'Erro ao criar pagamento no Mercado Pago. Tente novamente em instantes.' });
  }
}
