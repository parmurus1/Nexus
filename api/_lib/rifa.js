// api/_lib/rifa.js — regras compartilhadas da rifa.
import { enviarEmail, emailRifaConfirmada, emailConflitoBanda } from './email.js';

// Reserva dura 10 min. O link de pagamento do Mercado Pago expira antes (8 min),
// assim ninguém consegue pagar por um número que já voltou a ficar disponível.
export const RESERVA_MINUTOS = 10;
export const PAGAMENTO_EXPIRA_MINUTOS = 8;
export const MAX_BILHETES_POR_COMPRA = 50;

export const LIMPAR_COMPRADOR = {
  nome_comprador: null,
  email_comprador: null,
  instagram_comprador: null,
  telefone_comprador: null,
  preference_id: null,
  reservado_em: null
};

// Devolve para "disponível" os bilhetes reservados há mais de RESERVA_MINUTOS sem pagamento.
// Chamado automaticamente antes de listar/reservar bilhetes, então não depende
// mais de alguém clicar no botão do admin.
export async function liberarExpirados(supabase) {
  const limite = new Date(Date.now() - RESERVA_MINUTOS * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bilhetes')
    .update({ status: 'disponivel', ...LIMPAR_COMPRADOR })
    .eq('status', 'reservado')
    .lt('reservado_em', limite)
    .select('numero');
  if (error) {
    console.error('Erro ao liberar bilhetes expirados:', error.message);
    return [];
  }
  return (data || []).map(b => b.numero);
}

// Valida a lista de números enviada pelo navegador.
export function normalizarNumeros(numeros) {
  if (!Array.isArray(numeros)) return null;
  const lista = [...new Set(numeros.map(n => Number(n)))];
  if (!lista.length || lista.length > MAX_BILHETES_POR_COMPRA) return null;
  if (lista.some(n => !Number.isInteger(n) || n < 1 || n > 100000)) return null;
  return lista.sort((a, b) => a - b);
}

// ── Vendas abertas/encerradas ─────────────────────────────────────────────

// Data de hoje no fuso de São Paulo (AAAA-MM-DD), para comparar com data_sorteio
export function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// As vendas fecham quando o admin desliga "Vendas abertas" (o sorteio faz isso
// sozinho) ou quando o dia do sorteio já passou.
export function situacaoVendas(config = {}) {
  if (config.rifa_ativa === 'false') return { abertas: false, motivo: 'encerrada' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(config.data_sorteio || '') && hojeSaoPaulo() > config.data_sorteio) {
    return { abertas: false, motivo: 'prazo' };
  }
  return { abertas: true };
}

export async function lerConfigRifa(supabase) {
  const { data } = await supabase.from('config').select('chave, valor')
    .in('chave', ['valor_bilhete', 'data_sorteio', 'rifa_ativa', 'rifa_resultado', 'modo_demo', 'total_bilhetes']);
  const cfg = {};
  (data || []).forEach(c => { cfg[c.chave] = c.valor; });
  return cfg;
}

// Resultado público do sorteio: só o primeiro nome e o Instagram do vencedor
export function resultadoPublico(config = {}) {
  try {
    const r = JSON.parse(config.rifa_resultado || 'null');
    return r && Number.isInteger(r.numero) ? r : null;
  } catch { return null; }
}

// ── Quantidade de bilhetes ────────────────────────────────────────────────

export const TOTAL_MAX_BILHETES = 10000;

// Cria os números que faltam até "total" e apaga os que passam dele (ou que
// ficaram abaixo de 1, como um "000" criado à mão) — mas só se ninguém tiver
// reservado ou pago esses números.
export async function ajustarTotalBilhetes(supabase, total) {
  if (!Number.isInteger(total) || total < 1 || total > TOTAL_MAX_BILHETES) {
    return { ok: false, erro: `A quantidade precisa ser de 1 a ${TOTAL_MAX_BILHETES}.` };
  }
  const foraDaFaixa = `numero.gt.${total},numero.lt.1`;
  const { data: acima, error: erroAcima } = await supabase.from('bilhetes').select('numero, status').or(foraDaFaixa);
  if (erroAcima) return { ok: false, erro: 'Erro ao ler os bilhetes' };
  const ocupados = (acima || []).filter(b => b.status !== 'disponivel').map(b => b.numero);
  if (ocupados.length) {
    return { ok: false, erro: `Não dá para reduzir para ${total}: os números ${ocupados.slice(0, 10).map(n => String(n).padStart(3, '0')).join(', ')}${ocupados.length > 10 ? '…' : ''} já foram reservados ou vendidos.` };
  }
  if ((acima || []).length) {
    const { error } = await supabase.from('bilhetes').delete().or(foraDaFaixa).eq('status', 'disponivel');
    if (error) return { ok: false, erro: 'Erro ao remover bilhetes' };
  }
  const novos = Array.from({ length: total }, (_, i) => ({ numero: i + 1 }));
  for (let i = 0; i < novos.length; i += 1000) {
    const { error } = await supabase.from('bilhetes').upsert(novos.slice(i, i + 1000), { onConflict: 'numero', ignoreDuplicates: true });
    if (error) return { ok: false, erro: 'Erro ao criar bilhetes: ' + error.message };
  }
  await supabase.from('config').upsert({ chave: 'total_bilhetes', valor: String(total) }, { onConflict: 'chave' });
  return { ok: true, total };
}

// ── Confirmação de pagamento (webhook e consulta de status) ───────────────

// Marca como pagos os bilhetes de um pagamento aprovado do Mercado Pago. É chamada
// pelo webhook e também pela consulta de status (caso o webhook atrase ou falhe),
// por isso é idempotente: um aviso repetido não muda nada nem manda e-mail de novo.
export async function processarPagamentoRifa(supabase, pagamento) {
  const meta = pagamento.metadata || {};
  const numeros = Array.isArray(meta.numeros) ? meta.numeros.map(Number) : null;
  if (!numeros || !numeros.length) {
    console.error('Metadata de números não encontrada no pagamento', pagamento.id);
    return { status: 'invalido' };
  }
  const email = String(meta.email || '').toLowerCase();

  if (pagamento.status === 'approved') {
    // Confirma só bilhetes que estão reservados para ESTE comprador — ou que
    // voltaram a ficar livres (pagamento chegou em cima do prazo). Nunca
    // sobrescreve um bilhete já pago ou reservado por outra pessoa.
    const filtroEmail = `"${email.replace(/"/g, '')}"`;
    const { data: confirmados, error } = await supabase
      .from('bilhetes')
      .update({
        status: 'pago',
        payment_id: String(pagamento.id),
        pago_em: new Date().toISOString(),
        nome_comprador: meta.nome || null,
        email_comprador: email || null,
        instagram_comprador: meta.instagram || null,
        telefone_comprador: meta.telefone || null
      })
      .in('numero', numeros)
      .or(`status.eq.disponivel,and(status.eq.reservado,email_comprador.ilike.${filtroEmail})`)
      .select('numero');
    if (error) throw new Error('Erro ao confirmar bilhetes: ' + error.message);

    const pegos = (confirmados || []).map(b => b.numero);
    const { data: jaPagos } = await supabase.from('bilhetes').select('numero').in('numero', numeros).eq('payment_id', String(pagamento.id));
    const doPagamento = (jaPagos || []).map(b => b.numero);
    if (!pegos.length && doPagamento.length === numeros.length) {
      console.log(`[rifa] aviso repetido do pagamento ${pagamento.id} — ignorado`);
      return { status: 'pago', numeros: doPagamento };
    }

    const faltando = numeros.filter(n => !doPagamento.includes(n));
    if (faltando.length) {
      // Pagamento depois da expiração e número revendido: fica registrado no admin
      // para a banda devolver o valor ou combinar outros números com o comprador.
      console.error(`[CONFLITO] Pagamento ${pagamento.id} (${email}) aprovado, mas os bilhetes ${faltando.join(', ')} já eram de outra pessoa.`);
      const { data: novo, error: erroConflito } = await supabase.from('rifa_conflitos').upsert({
        payment_id: String(pagamento.id),
        nome: meta.nome || null,
        email: email || null,
        instagram: meta.instagram || null,
        telefone: meta.telefone || null,
        numeros_pedidos: numeros,
        numeros_faltando: faltando,
        valor: pagamento.transaction_amount || null
      }, { onConflict: 'payment_id', ignoreDuplicates: true }).select('id');
      if (erroConflito) console.error('Erro ao registrar conflito (rode a ATUALIZAÇÃO 5 do supabase_schema.sql):', erroConflito.message);
      else if (novo?.length && process.env.EMAIL_BANDA) {
        await enviarEmail({ para: process.env.EMAIL_BANDA, ...emailConflitoBanda({ nome: meta.nome, email, numeros: faltando, valor: pagamento.transaction_amount, paymentId: pagamento.id }) });
      }
    }
    if (pegos.length) {
      console.log(`[ok] Pagamento confirmado: bilhetes ${pegos.join(', ')}`);
      await enviarEmail({ para: email, ...emailRifaConfirmada({ nome: meta.nome, numeros: doPagamento, valor: pagamento.transaction_amount }) });
    }
    return { status: doPagamento.length ? 'pago' : 'conflito', numeros: doPagamento, faltando };
  }

  // Expirou ou foi recusado: libera os bilhetes deste comprador que ainda estão reservados
  if (pagamento.status === 'cancelled' || pagamento.status === 'rejected') {
    await supabase
      .from('bilhetes')
      .update({ status: 'disponivel', payment_id: null, ...LIMPAR_COMPRADOR })
      .in('numero', numeros)
      .eq('status', 'reservado')
      .ilike('email_comprador', email); // ilike: reservas antigas guardavam o e-mail sem padronizar maiúsculas
    return { status: pagamento.status === 'cancelled' ? 'expirado' : 'recusado' };
  }

  return { status: 'pendente' };
}
