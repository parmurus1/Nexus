// api/_lib/email.js — envio de e-mails transacionais via Resend (https://resend.com).
// Pastas com "_" não viram Serverless Functions na Vercel (não contam no limite).
//
// Variáveis de ambiente:
//   RESEND_API_KEY   -> chave da API do Resend (plano gratuito: 3.000 e-mails/mês)
//   EMAIL_REMETENTE  -> ex.: "Nexus Band <contato@seudominio.com.br>" (domínio verificado no Resend)
//   EMAIL_BANDA      -> e-mail que recebe avisos de novos pedidos e orçamentos
//
// Sem RESEND_API_KEY nada é enviado (e nada quebra): as funções só registram no log.

const SITE = () => process.env.SITE_URL || 'https://nexusband.com.br';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const moeda = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

// Layout simples, compatível com clientes de e-mail (tabelas e estilos inline)
function layout(titulo, corpoHtml) {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#ede9e3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;">
<tr><td style="padding:28px 32px 8px;font-size:12px;letter-spacing:4px;color:#e8220a;text-transform:uppercase;">Nexus Band</td></tr>
<tr><td style="padding:0 32px;font-size:26px;font-weight:bold;color:#ffffff;">${esc(titulo)}</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:15px;line-height:1.6;color:#cfcac4;">${corpoHtml}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #2a2a2a;font-size:12px;color:#8c8883;">
<a href="${SITE()}" style="color:#e8220a;text-decoration:none;">${esc(SITE().replace(/^https?:\/\//, ''))}</a> · Instagram @nexus.bandbr</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailConfigurado() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_REMETENTE;
}

// Nunca lança: e-mail é um "extra" e não pode derrubar pagamento/pedido.
export async function enviarEmail({ para, assunto, html, responderPara }) {
  if (!para) return { ok: false, erro: 'sem destinatário' };
  if (!emailConfigurado()) {
    console.log(`[email] não configurado (RESEND_API_KEY/EMAIL_REMETENTE) — "${assunto}" para ${para} não enviado`);
    return { ok: false, erro: 'não configurado' };
  }
  // Sem reply_to explícito, respostas do cliente vão para o e-mail da banda
  // (o remetente costuma ser um endereço que ninguém lê, tipo contato@).
  const replyTo = responderPara || process.env.EMAIL_BANDA;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE,
        to: Array.isArray(para) ? para : [para],
        subject: assunto,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
    if (!resp.ok) {
      const texto = await resp.text().catch(() => '');
      console.error(`[email] Resend respondeu ${resp.status}: ${texto.slice(0, 300)}`);
      return { ok: false, erro: `HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] erro ao enviar:', e.message);
    return { ok: false, erro: e.message };
  }
}

// ── Modelos ───────────────────────────────────────────────────────────────

export function emailRifaConfirmada({ nome, numeros, valor }) {
  const nums = numeros.map(n => String(n).padStart(3, '0')).join(', ');
  return {
    assunto: 'Seus bilhetes da Rifa Nexus estão confirmados',
    html: layout('Pagamento confirmado', `
      <p>Olá, ${esc(nome)}!</p>
      <p>Recebemos o seu pagamento e os seus números já estão garantidos no sorteio:</p>
      <p style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:1px;">${esc(nums)}</p>
      <p>Valor pago: <strong style="color:#ffffff;">${moeda(valor)}</strong></p>
      <p>O resultado será divulgado no nosso Instagram. Obrigado por apoiar a nossa música!</p>
      <p><a href="${SITE()}/rifa" style="display:inline-block;background:#e8220a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">Ver a rifa</a></p>`)
  };
}

export function emailPedidoConfirmado(pedido) {
  const itens = (pedido.itens || []).map(i =>
    `<tr><td style="padding:6px 0;color:#ffffff;">${esc(i.nome)}${i.tam && i.tam !== 'único' ? ` (${esc(i.tam)})` : ''} × ${esc(i.qty)}</td>
     <td style="padding:6px 0;text-align:right;">${moeda(Number(i.preco) * Number(i.qty))}</td></tr>`).join('');
  const prazo = pedido.frete_prazo_dias ? ` — prazo de entrega estimado de ${esc(pedido.frete_prazo_dias)} dia(s) úteis a partir do envio do produto` : '';
  return {
    assunto: 'Pedido confirmado — Loja Nexus',
    html: layout('Pedido confirmado', `
      <p>Olá, ${esc(pedido.nome_comprador)}!</p>
      <p>O pagamento do seu pedido foi aprovado. Agora ele entra em produção e, assim que estiver pronto, a gente envia.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#cfcac4;border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a;margin:8px 0 14px;">
        ${itens}
        <tr><td style="padding:6px 0;">Frete (${esc(pedido.frete_transportadora || '')} ${esc(pedido.frete_servico || '')})</td><td style="padding:6px 0;text-align:right;">${moeda(pedido.frete_valor)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold;color:#ffffff;">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#ffffff;">${moeda(pedido.valor_total)}</td></tr>
      </table>
      <p>Entrega em: ${esc(pedido.endereco)}, ${esc(pedido.numero)}${pedido.complemento ? ' - ' + esc(pedido.complemento) : ''} — ${esc(pedido.cidade || '')}/${esc(pedido.uf || '')}${prazo}.</p>
      <p>Você vai receber o código de rastreio assim que o pacote for postado.</p>`)
  };
}

export function emailAvisoBandaPedido(pedido) {
  const itens = (pedido.itens || []).map(i => `${esc(i.nome)}${i.tam && i.tam !== 'único' ? ` (${esc(i.tam)})` : ''} × ${esc(i.qty)}`).join('<br/>');
  return {
    assunto: `Novo pedido pago na loja — ${moeda(pedido.valor_total)}`,
    html: layout('Novo pedido pago', `
      <p><strong style="color:#ffffff;">${esc(pedido.nome_comprador)}</strong> · ${esc(pedido.telefone_comprador || '')}</p>
      <p>${itens}</p>
      <p>Total: ${moeda(pedido.valor_total)} · Destino: ${esc(pedido.cidade || '')}/${esc(pedido.uf || '')}</p>
      <p><a href="${SITE()}/admin#merch-pedidos" style="color:#e8220a;">Abrir no painel</a></p>`)
  };
}

export function emailEtiquetaGerada(pedido, rastreio) {
  return {
    assunto: 'Seu pedido da Loja Nexus está a caminho',
    html: layout('Pedido a caminho', `
      <p>Olá, ${esc(pedido.nome_comprador)}!</p>
      <p>A etiqueta de envio do seu pedido foi gerada${rastreio ? ' e o código de rastreio é:' : '.'}</p>
      ${rastreio ? `<p style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:1px;">${esc(rastreio)}</p>
      <p><a href="https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(rastreio)}" style="color:#e8220a;">Acompanhar a entrega</a></p>` : ''}
      <p>O rastreio pode levar até 24h para começar a atualizar depois da postagem.</p>`)
  };
}

export function emailNovoOrcamento(o) {
  const linha = (rotulo, valor) => valor ? `<tr><td style="padding:4px 12px 4px 0;color:#8c8883;">${rotulo}</td><td style="padding:4px 0;color:#ffffff;">${esc(valor)}</td></tr>` : '';
  return {
    assunto: `Pedido de orçamento: ${o.tipo_evento || 'show'}${o.cidade ? ' em ' + o.cidade : ''}`,
    html: layout('Novo pedido de orçamento', `
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${linha('Nome', o.nome)}${linha('E-mail', o.email)}${linha('Telefone', o.telefone)}
        ${linha('Data do evento', o.data_evento)}${linha('Cidade', o.cidade)}${linha('Tipo de evento', o.tipo_evento)}
      </table>
      ${o.mensagem ? `<p style="white-space:pre-line;border-left:3px solid #e8220a;padding-left:12px;">${esc(o.mensagem)}</p>` : ''}
      <p>Responda este e-mail para falar direto com o contratante.</p>
      <p><a href="${SITE()}/admin#orcamentos" style="color:#e8220a;">Ver todos os orçamentos</a></p>`)
  };
}
