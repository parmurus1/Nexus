// api/webhook.js
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { type, data } = req.body;

  // Só processar notificações de pagamento
  if (type !== 'payment') return res.status(200).json({ ok: true });

  try {
    const payment = new Payment(mp);
    const pagamento = await payment.get({ id: data.id });

    if (pagamento.status !== 'approved') {
      // Se expirou ou falhou, liberar os bilhetes
      if (pagamento.status === 'cancelled' || pagamento.status === 'rejected') {
        const numeros = pagamento.metadata?.numeros;
        if (numeros && Array.isArray(numeros)) {
          await supabase
            .from('bilhetes')
            .update({
              status: 'disponivel',
              nome_comprador: null,
              email_comprador: null,
              telefone_comprador: null,
              instagram_comprador: null,
              preference_id: null,
              payment_id: null,
              reservado_em: null
            })
            .in('numero', numeros);
        }
      }
      return res.status(200).json({ ok: true });
    }

    // Pagamento aprovado — confirmar bilhetes
    const numeros = pagamento.metadata?.numeros;
    if (!numeros || !Array.isArray(numeros)) {
      console.error('Metadata de números não encontrada no pagamento', pagamento.id);
      return res.status(200).json({ ok: true });
    }

    await supabase
      .from('bilhetes')
      .update({
        status: 'pago',
        payment_id: String(pagamento.id),
        pago_em: new Date().toISOString()
      })
      .in('numero', numeros);

    console.log(`✅ Pagamento confirmado: bilhetes ${numeros.join(', ')} - ${pagamento.payer?.email}`);

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Erro no webhook:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
}
