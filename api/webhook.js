// api/webhook.js
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { gerarEtiquetaParaPedido } from './frete.js';

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

    // Pagamento aprovado ou não — identificar se é rifa ou merch pela metadata
    const tipo = pagamento.metadata?.tipo === 'merch' ? 'merch' : 'rifa';

    if (tipo === 'merch') {
      const pedidoId = pagamento.metadata?.pedido_id;
      if (!pedidoId) {
        console.error('Metadata de pedido_id não encontrada no pagamento', pagamento.id);
        return res.status(200).json({ ok: true });
      }

      if (pagamento.status === 'approved') {
        await supabase
          .from('pedidos_merch')
          .update({ status: 'pago', payment_id: String(pagamento.id), pago_em: new Date().toISOString() })
          .eq('id', pedidoId);
        console.log(`✅ Pedido merch confirmado: ${pedidoId} - ${pagamento.payer?.email}`);

        // Gera a etiqueta de envio automaticamente no Melhor Envio.
        // IMPORTANTE: isso nunca deve impedir a confirmação do pagamento acima —
        // por isso está isolado num try/catch próprio e só atualiza colunas de
        // rastreio/status da etiqueta, nunca o status do pedido em si.
        try {
          const { data: pedidoCompleto } = await supabase
            .from('pedidos_merch')
            .select('*')
            .eq('id', pedidoId)
            .single();

          if (pedidoCompleto) {
            const resultado = await gerarEtiquetaParaPedido(pedidoCompleto);

            if (resultado.ok) {
              await supabase
                .from('pedidos_merch')
                .update({
                  me_status: 'gerada',
                  me_etiqueta_id: String(resultado.etiqueta_id),
                  me_rastreio: resultado.rastreio,
                  me_link_etiqueta: resultado.link_etiqueta,
                  me_etiqueta_gerada_em: new Date().toISOString(),
                  me_erro: null
                })
                .eq('id', pedidoId);
              console.log(`📦 Etiqueta gerada automaticamente para pedido ${pedidoId}: ${resultado.rastreio || 'sem rastreio ainda'}`);
            } else {
              await supabase
                .from('pedidos_merch')
                .update({ me_status: resultado.status, me_erro: resultado.erro })
                .eq('id', pedidoId);
              // falha_saldo é esperada de vez em quando — loga como aviso, não erro grave
              const nivel = resultado.status === 'falha_saldo' ? '⚠️' : '❌';
              console.error(`${nivel} Etiqueta não gerada automaticamente (pedido ${pedidoId}): ${resultado.erro}`);
            }
          }
        } catch (erroEtiqueta) {
          console.error(`❌ Erro inesperado ao tentar gerar etiqueta do pedido ${pedidoId}:`, erroEtiqueta.message);
          await supabase
            .from('pedidos_merch')
            .update({ me_status: 'falha', me_erro: erroEtiqueta.message })
            .eq('id', pedidoId)
            .catch(() => {}); // se até essa atualização falhar, não deixa quebrar o webhook
        }

      } else if (pagamento.status === 'cancelled' || pagamento.status === 'rejected') {
        await supabase.from('pedidos_merch').update({ status: 'cancelado' }).eq('id', pedidoId);
      }
      return res.status(200).json({ ok: true });
    }

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
