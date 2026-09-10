// api/criar-pagamento-merch.js — checkout da loja (merch) via Mercado Pago
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { calcularFreteMelhorEnvio } from './frete.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const {
    itens, nome, email, cpf, telefone, instagram,
    cep, uf, cidade, endereco, numero, complemento, bairro,
    frete_servico_id // id da opção de frete escolhida pelo usuário (veio de /api/frete)
  } = req.body;

  if (!itens || !Array.isArray(itens) || itens.length === 0)
    return res.status(400).json({ erro: 'Carrinho vazio' });
  if (!nome || !email)
    return res.status(400).json({ erro: 'Nome e e-mail são obrigatórios' });
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11)
    return res.status(400).json({ erro: 'CPF inválido — é exigido pela transportadora para gerar a etiqueta de envio.' });
  if (!cep || !endereco || !numero)
    return res.status(400).json({ erro: 'Endereço de entrega incompleto' });

  // Cada item precisa ter preço definido (> 0). Produtos "a confirmar" (preco 0)
  // não podem ir pro Mercado Pago — o front-end direciona esses pro WhatsApp.
  const semPreco = itens.some(i => !i.preco || Number(i.preco) <= 0);
  if (semPreco) {
    return res.status(400).json({
      erro: 'Um ou mais itens do carrinho ainda não têm preço definido. Finalize esse pedido via WhatsApp.'
    });
  }

  // ── Frete: NUNCA confiar em um valor vindo do front. Recalcula no servidor
  // chamando a API do Melhor Envio de novo e usa a opção escolhida pelo id. ──
  let frete = { servico: null, transportadora: null, preco: 0, prazo_dias: null };
  try {
    const cepOrigem = process.env.CEP_ORIGEM;
    if (!cepOrigem) throw new Error('CEP_ORIGEM não configurado no servidor');
    const opcoes = await calcularFreteMelhorEnvio({ cepOrigem, cepDestino: cep, itens });
    const escolhida = opcoes.find(o => String(o.id) === String(frete_servico_id));
    if (!escolhida) {
      return res.status(400).json({ erro: 'Opção de frete inválida ou expirada. Recalcule o frete e tente novamente.' });
    }
    frete = escolhida;
  } catch (err) {
    console.error('Erro ao revalidar frete:', err.message);
    return res.status(500).json({ erro: 'Não foi possível confirmar o valor do frete agora. Tente novamente.' });
  }

  const subtotal = itens.reduce((s, i) => s + Number(i.preco) * Number(i.qty || 1), 0);
  const valorTotal = subtotal + frete.preco;

  if (valorTotal < 1.00) {
    return res.status(400).json({
      erro: 'Valor mínimo para pagamento via PIX é R$ 1,00.'
    });
  }

  // Cria o pedido no banco como "pendente"
  const { data: pedido, error: erroPedido } = await supabase
    .from('pedidos_merch')
    .insert({
      itens,
      valor_total: valorTotal,
      nome_comprador: nome,
      email_comprador: email,
      cpf_comprador: cpfLimpo,
      telefone_comprador: telefone || null,
      instagram_comprador: instagram || null,
      cep, uf: uf || null, cidade: cidade || null,
      endereco, numero, complemento: complemento || null, bairro: bairro || null,
      frete_servico: frete.servico,
      frete_transportadora: frete.transportadora,
      frete_prazo_dias: frete.prazo_dias,
      frete_valor: frete.preco,
      frete_service_id: String(frete.id), // necessário para gerar a etiqueta no Melhor Envio após o pagamento
      status: 'pendente'
    })
    .select()
    .single();

  if (erroPedido) {
    console.error('Erro ao criar pedido merch:', erroPedido.message);
    return res.status(500).json({ erro: 'Erro ao registrar pedido' });
  }

  // MODO DEMO: sem token do MP configurado
  const modoDemo = !process.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN === 'SEU_TOKEN_AQUI';
  if (modoDemo) {
    return res.status(200).json({
      modo_demo: true,
      mensagem: `Pedido registrado para ${nome}! O link de pagamento será ativado em breve.`
    });
  }

  const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(mp);

  try {
    const response = await preference.create({
      body: {
        items: [
          ...itens.map(i => ({
            title: `${i.nome}${i.tam && i.tam !== 'único' ? ` (${i.tam})` : ''}`,
            quantity: Number(i.qty || 1),
            currency_id: 'BRL',
            unit_price: Number(i.preco)
          })),
          {
            title: `Frete (${frete.transportadora || 'Transportadora'} - ${frete.servico || ''})`,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: frete.preco
          }
        ],
        payer: { name: nome, email, address: { zip_code: cep } },
        shipments: {
          receiver_address: {
            zip_code: cep,
            street_name: endereco,
            street_number: numero,
            city_name: cidade || '',
            state_name: uf || ''
          }
        },
        payment_methods: {
          installments: 12,
          default_payment_method_id: 'pix'
        },
        back_urls: {
          success: `${process.env.SITE_URL || 'https://nexusband.vercel.app'}/sucesso.html`,
          failure: `${process.env.SITE_URL || 'https://nexusband.vercel.app'}/merch.html`,
          // Pix aprova de forma assíncrona (o Mercado Pago não redireciona
          // sozinho nesse caso) — manda pra uma tela nossa que fica
          // consultando /api/pedido-status e redireciona assim que aprovar.
          pending: `${process.env.SITE_URL || 'https://nexusband.vercel.app'}/pendente.html?pedido=${pedido.id}`
        },
        auto_return: 'approved',
        statement_descriptor: 'NEXUS MERCH',
        external_reference: `merch-${pedido.id}`,
        notification_url: process.env.SITE_URL ? `${process.env.SITE_URL}/api/webhook` : undefined,
        metadata: { tipo: 'merch', pedido_id: pedido.id, nome, email, telefone, instagram, frete_valor: frete.preco }
      }
    });

    await supabase.from('pedidos_merch').update({ preference_id: response.id }).eq('id', pedido.id);

    return res.status(200).json({
      preference_id: response.id,
      init_point: response.init_point,
      valor_total: valorTotal
    });

  } catch (err) {
    await supabase.from('pedidos_merch').update({ status: 'cancelado' }).eq('id', pedido.id);
    console.error('Erro MP (merch):', err);
    console.error('Detalhes:', JSON.stringify(err.response?.data || err.message));
    return res.status(500).json({
      erro: 'Erro ao criar pagamento no Mercado Pago',
      detalhes: err.message
    });
  }
}
