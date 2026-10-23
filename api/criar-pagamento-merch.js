// api/criar-pagamento-merch.js — checkout da loja (merch) via Mercado Pago
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { calcularFreteMelhorEnvio } from './frete.js';
import { montarItensSeguros } from './_lib/pedidos.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const {
    itens: itensCliente, nome, email, cpf, telefone,
    cep, uf, cidade, endereco, numero, complemento, bairro,
    frete_servico_id // id da opção de frete escolhida pelo usuário (veio de /api/frete)
  } = req.body || {};

  if (!nome || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)))
    return res.status(400).json({ erro: 'Nome e e-mail válidos são obrigatórios' });
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11)
    return res.status(400).json({ erro: 'CPF inválido — é exigido pela transportadora para gerar a etiqueta de envio.' });
  const telLimpo = String(telefone || '').replace(/\D/g, '');
  if (telLimpo.length < 10)
    return res.status(400).json({ erro: 'Telefone é obrigatório.' });
  if (!cep || !endereco || !numero)
    return res.status(400).json({ erro: 'Endereço de entrega incompleto' });

  // ── Itens: NUNCA confiar em preço/nome vindos do navegador. O carrinho só
  // informa id + tamanho + quantidade; preço, nome, medidas e estoque vêm do banco.
  const { itens, erro: erroItens, status: statusItens } = await montarItensSeguros(supabase, itensCliente);
  if (erroItens) return res.status(statusItens || 400).json({ erro: erroItens });

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
      itens, // preço, nome e medidas vindos do banco (as medidas são usadas na etiqueta)
      valor_total: valorTotal,
      nome_comprador: nome,
      email_comprador: email,
      cpf_comprador: cpfLimpo,
      telefone_comprador: telefone || null,
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

  // MODO DEMO: sem token do MP configurado OU forçado pelo painel admin (igual à rifa)
  const { data: configDemo } = await supabase.from('config').select('valor').eq('chave', 'modo_demo').maybeSingle();
  const modoDemo = !process.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN === 'SEU_TOKEN_AQUI' || configDemo?.valor === 'true';
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
          success: `${process.env.SITE_URL || 'https://nexusband.com.br'}/sucesso?origem=merch`,
          failure: `${process.env.SITE_URL || 'https://nexusband.com.br'}/falha?origem=merch`,
          // Pix aprova de forma assíncrona (o Mercado Pago não redireciona
          // sozinho nesse caso) — manda pra uma tela nossa que fica
          // consultando /api/pedido-status e redireciona assim que aprovar.
          pending: `${process.env.SITE_URL || 'https://nexusband.com.br'}/pendente?origem=merch&pedido=${pedido.id}`
        },
        auto_return: 'approved',
        // Link de pagamento vale 1h; depois disso o pedido fica como pendente/cancelado
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        date_of_expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        statement_descriptor: 'NEXUS MERCH',
        external_reference: `merch-${pedido.id}`,
        notification_url: process.env.SITE_URL ? `${process.env.SITE_URL}/api/webhook` : undefined,
        metadata: { tipo: 'merch', pedido_id: pedido.id, nome, email, telefone, frete_valor: frete.preco }
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
    return res.status(500).json({ erro: 'Erro ao criar pagamento no Mercado Pago. Tente novamente em instantes.' });
  }
}
