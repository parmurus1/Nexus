// api/_lib/whatsapp.js — avisos no WhatsApp da banda via CallMeBot (https://www.callmebot.com).
// Serviço gratuito que manda mensagem para o PRÓPRIO número de quem ativou;
// cada número precisa ativar o bot uma vez e recebe a sua apikey.
//
// Variável de ambiente:
//   WHATSAPP_AVISOS -> "numero:apikey", com DDI e DDD, ex.: "5511999999999:1234567".
//                      Mais de um número separado por vírgula:
//                      "5511999999999:1234567,5511888888888:7654321"
//
// Sem a variável nada é enviado (e nada quebra): só registra no log.

function destinos() {
  return String(process.env.WHATSAPP_AVISOS || '')
    .split(',')
    .map(par => {
      const [numero, apikey] = par.split(':').map(s => (s || '').trim());
      return { numero: numero.replace(/\D/g, ''), apikey };
    })
    .filter(d => d.numero.length >= 10 && d.apikey);
}

export function whatsappConfigurado() {
  return destinos().length > 0;
}

// Nunca lança: o aviso é um "extra" e não pode derrubar o formulário.
export async function avisarWhatsapp(texto) {
  const lista = destinos();
  if (!lista.length) {
    console.log('[whatsapp] WHATSAPP_AVISOS não configurado — aviso não enviado');
    return { ok: false, erro: 'não configurado' };
  }
  const resultados = await Promise.all(lista.map(async ({ numero, apikey }) => {
    try {
      const url = 'https://api.callmebot.com/whatsapp.php?' + new URLSearchParams({ phone: '+' + numero, text: texto, apikey });
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        console.error(`[whatsapp] CallMeBot respondeu ${resp.status} para ...${numero.slice(-4)}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error(`[whatsapp] erro ao enviar para ...${numero.slice(-4)}:`, e.message);
      return false;
    }
  }));
  return { ok: resultados.some(Boolean) };
}

const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';

export function whatsappNovoOrcamento(o, site) {
  const campo = (rotulo, valor) => valor ? [`${rotulo}: ${valor}`] : [];
  const fone = o.telefone.replace(/\D/g, '');
  return [
    '*Novo pedido de orçamento — Nexus*',
    '',
    `Nome: ${o.nome}`,
    ...campo('Evento', o.tipo_evento),
    ...campo('Data', dataBR(o.data_evento)),
    ...campo('Cidade', o.cidade),
    ...campo('WhatsApp', fone ? `${o.telefone} (wa.me/${fone.length <= 11 ? '55' + fone : fone})` : ''),
    ...campo('E-mail', o.email),
    ...(o.mensagem ? ['', o.mensagem.slice(0, 600)] : []),
    '',
    `${site}/admin#orcamentos`
  ].join('\n');
}
