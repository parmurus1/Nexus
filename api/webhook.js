// api/webhook.js — notificações de pagamento do Mercado Pago (rifa e loja)
//
// O Mercado Pago pode mandar o MESMO aviso várias vezes. Por isso cada ação
// (marcar como pago, baixar estoque, gerar etiqueta, mandar e-mail) só roda
// na primeira vez em que o status realmente muda para "pago".
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { gerarEtiquetaESalvar, baixarEstoque } from './_lib/pedidos.js';
import { etiquetaAutomatica } from './_lib/melhorenvio.js';
import { processarPagamentoRifa } from './_lib/rifa.js';
import { enviarEmail, emailPedidoConfirmado, emailAvisoBandaPedido } from './_lib/email.js';

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function processarMerch(pagamento) {
  const pedidoId = pagamento.metadata?.pedido_id;
  if (!pedidoId) {
    console.error('Metadata de pedido_id não encontrada no pagamento', pagamento.id);
    return;
  }

  if (pagamento.status === 'approved') {
    // Só muda para "pago" se ainda não estava — se nenhuma linha mudou, é aviso repetido.
    const { data: atualizados, error } = await supabase
      .from('pedidos_merch')
      .update({ status: 'pago', payment_id: String(pagamento.id), pago_em: new Date().toISOString() })
      .eq('id', pedidoId)
      .neq('status', 'pago')
      .select('*');
    if (error) throw new Error('Erro ao confirmar pedido: ' + error.message);
    const pedido = atualizados && atualizados[0];
    if (!pedido) {
      console.log(`[webhook] aviso repetido para o pedido ${pedidoId} — ignorado`);
      return;
    }
    console.log(`[ok] Pedido merch confirmado: ${pedidoId}`);

    await baixarEstoque(supabase, pedido.itens);

    const confirmacao = emailPedidoConfirmado(pedido);
    await enviarEmail({ para: pedido.email_comprador, ...confirmacao });
    if (process.env.EMAIL_BANDA) {
      await enviarEmail({ para: process.env.EMAIL_BANDA, ...emailAvisoBandaPedido(pedido), responderPara: pedido.email_comprador });
    }

    // Etiqueta automática no Melhor Envio (só com ETIQUETA_AUTOMATICA=true; o padrão é
    // gerar pelo admin quando o produto estiver pronto). Nunca impede a confirmação acima.
    if (!etiquetaAutomatica()) return;
    try {
      const resultado = await gerarEtiquetaESalvar(supabase, pedido);
      if (resultado.ok) console.log(`[etiqueta] gerada para o pedido ${pedidoId}: ${resultado.rastreio || 'sem rastreio ainda'}`);
      else console.error(`${resultado.status === 'falha_saldo' ? '[aviso]' : '[erro]'} Etiqueta não gerada (pedido ${pedidoId}): ${resultado.erro}`);
    } catch (erroEtiqueta) {
      console.error(`[erro] Erro inesperado ao gerar etiqueta do pedido ${pedidoId}:`, erroEtiqueta.message);
      await supabase.from('pedidos_merch').update({ me_status: 'falha', me_erro: erroEtiqueta.message }).eq('id', pedidoId);
    }
    return;
  }

  if (pagamento.status === 'cancelled' || pagamento.status === 'rejected') {
    await supabase.from('pedidos_merch').update({ status: 'cancelado' }).eq('id', pedidoId).eq('status', 'pendente');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { type, data } = req.body || {};
  // Só processa notificações de pagamento
  if (type !== 'payment' || !data?.id) return res.status(200).json({ ok: true });

  try {
    // Busca o pagamento direto no Mercado Pago (o corpo do aviso não é confiável)
    const pagamento = await new Payment(mp).get({ id: data.id });
    if (pagamento.metadata?.tipo === 'merch') await processarMerch(pagamento);
    else await processarPagamentoRifa(supabase, pagamento);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro no webhook:', err);
    // 500 faz o Mercado Pago tentar de novo mais tarde
    return res.status(500).json({ erro: 'Erro interno' });
  }
}
