// api/test-mp.js - Teste de integração com Mercado Pago
// DELETE ESTE ARQUIVO APÓS RESOLVER O PROBLEMA!

import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Verificar se o token está configurado
  if (!process.env.MP_ACCESS_TOKEN) {
    return res.status(200).json({
      erro: 'MP_ACCESS_TOKEN não configurado',
      modo_demo: true
    });
  }

  if (process.env.MP_ACCESS_TOKEN === 'SEU_TOKEN_AQUI') {
    return res.status(200).json({
      erro: 'MP_ACCESS_TOKEN ainda está com valor de exemplo',
      modo_demo: true
    });
  }

  // Verificar se SITE_URL está configurado
  if (!process.env.SITE_URL) {
    return res.status(200).json({
      erro: 'SITE_URL não configurado',
      site_url_necessario: true
    });
  }

  // Tentar criar uma preferência de teste
  try {
    const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(mp);

    const response = await preference.create({
      body: {
        items: [{
          title: 'TESTE - Rifa Nexus',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: 10.00
        }],
        payer: { 
          name: 'Teste', 
          email: 'teste@teste.com'
        },
        back_urls: {
          success: `${process.env.SITE_URL}/sucesso.html`,
          failure: `${process.env.SITE_URL}/rifa.html`,
          pending: `${process.env.SITE_URL}/rifa.html`
        },
        auto_return: 'approved',
        external_reference: 'teste-123'
      }
    });

    return res.status(200).json({
      sucesso: true,
      preference_id: response.id,
      init_point: response.init_point,
      mensagem: 'Preferência de teste criada com sucesso!',
      token_prefix: process.env.MP_ACCESS_TOKEN.slice(0, 15) + '...'
    });

  } catch (err) {
    return res.status(200).json({
      erro: 'Erro ao criar preferência',
      mensagem: err.message,
      detalhes: err.response?.data || null,
      status_code: err.status || null
    });
  }
}
