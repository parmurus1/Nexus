// api/site.js — endpoints públicos pequenos reunidos numa única Serverless Function
// (o plano Hobby da Vercel permite no máximo 12). As URLs antigas continuam
// funcionando via rewrites no vercel.json:
//   GET  /api/config          -> configurações e conteúdo editável do site
//   GET  /api/bilhetes        -> números da rifa e status
//   GET  /api/pedido-status   -> status (não sensível) de um pedido da loja
//   GET  /api/rifa-status     -> status de um pagamento da rifa (tela de espera/sucesso)
//   POST /api/meus-numeros    -> "Meus números" da rifa: código por e-mail e consulta
//   POST /api/orcamento       -> formulário de orçamento da página Contratantes
//   POST /api/avisos          -> cadastro de fãs no rodapé ("avisos de shows")
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { liberarExpirados, situacaoVendas, resultadoPublico, processarPagamentoRifa } from './_lib/rifa.js';
import { ipDaRequisicao } from './_lib/auth.js';
import { enviarEmail, emailConfigurado, emailNovoOrcamento, emailCodigoRifa } from './_lib/email.js';
import { emailValido, telefoneNormalizado, telefoneFormatado } from './_lib/validacao.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Chaves de config que nunca devem ir para o navegador
const CONFIG_PRIVADA = new Set(['chave_pix']);

async function lerConfig() {
  const { data, error } = await supabase.from('config').select('chave, valor');
  if (error) return null;
  const obj = {};
  (data || []).forEach(c => { if (!CONFIG_PRIVADA.has(c.chave)) obj[c.chave] = c.valor; });
  return obj;
}

// Liberação de reservas vencidas no máximo uma vez por minuto por instância,
// para a página da rifa (que atualiza a cada 30s) não gerar escrita à toa.
let ultimaLiberacao = 0;

async function rotaBilhetes(req, res) {
  if (Date.now() - ultimaLiberacao > 60 * 1000) {
    ultimaLiberacao = Date.now();
    await liberarExpirados(supabase);
  }
  const { data, error } = await supabase.from('bilhetes').select('numero, status').order('numero', { ascending: true });
  if (error) return res.status(500).json({ erro: 'Erro ao buscar bilhetes' });
  const config = await lerConfig();
  res.setHeader('Cache-Control', 'no-store');
  const vendas = situacaoVendas(config || {});
  return res.status(200).json({
    bilhetes: data,
    config: { valor_bilhete: config?.valor_bilhete, data_sorteio: config?.data_sorteio },
    vendas_abertas: vendas.abertas,
    resultado: vendas.abertas ? null : resultadoPublico(config || {})
  });
}

// Status de um pagamento da rifa. Aceita o id do pagamento (Pix na página ou
// retorno do Mercado Pago) ou o id da preferência (retorno sem pagamento).
// Se o webhook ainda não chegou, consulta o Mercado Pago e confirma por aqui
// mesmo — a confirmação é idempotente. Devolve só status e números, nunca dados pessoais.
async function rotaRifaStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const pagamento = String(req.query.pagamento || '');
  const preferencia = String(req.query.preferencia || '');

  if (/^\d{1,20}$/.test(pagamento)) {
    const { data: pagos } = await supabase.from('bilhetes').select('numero').eq('payment_id', pagamento).eq('status', 'pago');
    if (pagos?.length) return res.status(200).json({ status: 'pago', numeros: pagos.map(b => b.numero).sort((a, b) => a - b) });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(200).json({ status: 'pendente' });
    let p;
    try {
      p = await new Payment(new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })).get({ id: pagamento });
    } catch {
      return res.status(404).json({ erro: 'Pagamento não encontrado' });
    }
    if (p.metadata?.tipo === 'merch') return res.status(404).json({ erro: 'Pagamento não encontrado' });
    const r = await processarPagamentoRifa(supabase, p);
    if (r.status === 'invalido') return res.status(404).json({ erro: 'Pagamento não encontrado' });
    return res.status(200).json({ status: r.status, numeros: r.numeros || [] });
  }

  if (/^[\w-]{6,80}$/.test(preferencia)) {
    const { data } = await supabase.from('bilhetes').select('numero, status').eq('preference_id', preferencia);
    const pagos = (data || []).filter(b => b.status === 'pago').map(b => b.numero).sort((a, b) => a - b);
    if (pagos.length) return res.status(200).json({ status: 'pago', numeros: pagos });
    if ((data || []).some(b => b.status === 'reservado')) return res.status(200).json({ status: 'pendente' });
    return res.status(200).json({ status: 'expirado' });
  }

  return res.status(400).json({ erro: 'Informe o pagamento' });
}

async function rotaConfig(req, res) {
  const config = await lerConfig();
  if (!config) return res.status(500).json({ erro: 'Erro ao buscar config' });
  // Cache curto na CDN da Vercel: a maioria das visitas não chega ao banco.
  // O painel admin lê a config pela rota autenticada (sem cache).
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  return res.status(200).json(config);
}

async function rotaPedidoStatus(req, res) {
  const { id } = req.query;
  if (!id || !/^[0-9a-f-]{36}$/i.test(String(id))) return res.status(400).json({ erro: 'id do pedido inválido' });
  // Só o essencial para a tela de espera — nunca endereço, e-mail ou telefone.
  const { data, error } = await supabase.from('pedidos_merch').select('status').eq('id', id).maybeSingle();
  if (error || !data) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ status: data.status });
}

const limpar = (v, max) => String(v || '').trim().slice(0, max);

async function rotaOrcamento(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  const b = req.body || {};

  // Campo "site" é invisível para pessoas; se vier preenchido, é robô.
  if (b.site) return res.status(200).json({ ok: true });

  const o = {
    nome: limpar(b.nome, 120),
    email: limpar(b.email, 160).toLowerCase(),
    telefone: limpar(b.telefone, 30),
    data_evento: /^\d{4}-\d{2}-\d{2}$/.test(b.data_evento || '') ? b.data_evento : null,
    cidade: limpar(b.cidade, 120),
    tipo_evento: limpar(b.tipo_evento, 80),
    mensagem: limpar(b.mensagem, 2000)
  };
  if (!o.nome) return res.status(400).json({ erro: 'Informe seu nome.' });
  // Campo preenchido precisa ser válido; pelo menos um dos dois é obrigatório.
  if (o.email && !emailValido(o.email)) return res.status(400).json({ erro: 'Confira o e-mail: ele parece incompleto ou com erro de digitação.' });
  if (o.telefone) {
    const tel = telefoneNormalizado(o.telefone);
    if (!tel) return res.status(400).json({ erro: 'Confira o WhatsApp: use DDD + número, ex.: (11) 91234-5678.' });
    o.telefone = telefoneFormatado(tel);
  }
  if (!o.email && !o.telefone) return res.status(400).json({ erro: 'Informe um e-mail ou WhatsApp para retornarmos.' });

  // Limite simples contra spam: 3 pedidos por IP por hora
  const ip = ipDaRequisicao(req);
  const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('orcamentos').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('criado_em', umaHora);
  if ((count || 0) >= 3) return res.status(429).json({ erro: 'Recebemos vários pedidos seus agora há pouco. Tente novamente mais tarde ou fale com a gente pelo WhatsApp.' });

  const { data, error } = await supabase.from('orcamentos').insert({ ...o, ip, status: 'novo' }).select('id').single();
  if (error) {
    console.error('Erro ao salvar orçamento:', error.message);
    return res.status(500).json({ erro: 'Não foi possível enviar agora. Fale com a gente pelo WhatsApp ou e-mail.' });
  }

  // Avisa a banda por e-mail (só envia se estiver configurado); o pedido também fica no admin
  const destino = process.env.EMAIL_BANDA;
  if (destino) await enviarEmail({ para: destino, ...emailNovoOrcamento(o), responderPara: o.email || undefined });

  return res.status(201).json({ ok: true, id: data.id });
}

async function rotaAvisos(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  const b = req.body || {};
  if (b.site) return res.status(200).json({ ok: true }); // campo-isca: robô

  const bruto = limpar(b.contato, 160);
  let contato, tipo;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bruto)) { contato = bruto.toLowerCase(); tipo = 'email'; }
  else {
    const digitos = bruto.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (digitos.length < 10 || digitos.length > 11) return res.status(400).json({ erro: 'Digite um e-mail ou WhatsApp com DDD.' });
    contato = digitos; tipo = 'whatsapp';
  }

  const ip = ipDaRequisicao(req);
  const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('fas').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('criado_em', umaHora);
  if ((count || 0) >= 5) return res.status(429).json({ erro: 'Muitos cadastros seguidos. Tente de novo mais tarde.' });

  // Já cadastrado conta como sucesso (não revela se o contato existe)
  const { error } = await supabase.from('fas').upsert(
    { contato, tipo, origem: limpar(b.origem, 60) || null, ip },
    { onConflict: 'contato', ignoreDuplicates: true }
  );
  if (error) {
    console.error('Erro ao cadastrar fã:', error.message);
    return res.status(500).json({ erro: 'Não foi possível cadastrar agora. Tente mais tarde.' });
  }
  return res.status(201).json({ ok: true });
}

// "Meus números": a pessoa pede um código de 6 dígitos no e-mail e só vê os
// números depois de digitá-lo. O código é guardado só como hash, vale 10 min e
// aceita 5 tentativas. A resposta do envio é sempre a mesma, para não revelar
// quais e-mails compraram.
const CODIGO_MINUTOS = 10;
const CODIGO_TENTATIVAS = 5;
const hashCodigo = (email, codigo) => crypto.createHash('sha256').update(`${email}:${codigo}`).digest('hex');

async function rotaMeusNumeros(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  res.setHeader('Cache-Control', 'no-store');
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!emailValido(email)) return res.status(400).json({ erro: 'Digite um e-mail válido.' });

  if (b.acao === 'enviar') {
    if (!emailConfigurado()) return res.status(503).json({ erro: 'A consulta está indisponível no momento. Fale com a gente pelo Instagram.' });
    const ip = ipDaRequisicao(req);
    const quinzeMin = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ count: porEmail, error: erroTabela }, { count: porIp }] = await Promise.all([
      supabase.from('rifa_codigos').select('id', { count: 'exact', head: true }).eq('email', email).gte('criado_em', quinzeMin),
      supabase.from('rifa_codigos').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('criado_em', umaHora)
    ]);
    if (erroTabela) {
      console.error('Tabela rifa_codigos ausente (rode a ATUALIZAÇÃO 6):', erroTabela.message);
      return res.status(503).json({ erro: 'A consulta está indisponível no momento. Fale com a gente pelo Instagram.' });
    }
    if ((porEmail || 0) >= 3 || (porIp || 0) >= 10) {
      return res.status(429).json({ erro: 'Muitos pedidos de código seguidos. Espere alguns minutos e tente de novo.' });
    }
    // Só manda e-mail para quem tem bilhete pago, mas responde igual nos dois casos
    const { count: pagos } = await supabase.from('bilhetes').select('numero', { count: 'exact', head: true })
      .eq('email_comprador', email).eq('status', 'pago');
    if (pagos) {
      const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await supabase.from('rifa_codigos').update({ usado: true }).eq('email', email).eq('usado', false);
      const { error } = await supabase.from('rifa_codigos').insert({
        email, ip, codigo_hash: hashCodigo(email, codigo),
        expira_em: new Date(Date.now() + CODIGO_MINUTOS * 60 * 1000).toISOString()
      });
      if (error) return res.status(500).json({ erro: 'Não foi possível gerar o código agora. Tente de novo.' });
      await enviarEmail({ para: email, ...emailCodigoRifa({ codigo }) });
    } else {
      // Registra a tentativa para o limite por IP valer também para e-mails sem compra
      await supabase.from('rifa_codigos').insert({ email, ip, codigo_hash: '-', expira_em: new Date().toISOString(), usado: true });
    }
    return res.status(200).json({ ok: true });
  }

  if (b.acao === 'verificar') {
    const codigo = String(b.codigo || '').replace(/\D/g, '');
    if (codigo.length !== 6) return res.status(400).json({ erro: 'O código tem 6 números.' });
    const { data: atual } = await supabase.from('rifa_codigos').select('id, codigo_hash, tentativas, expira_em')
      .eq('email', email).eq('usado', false).gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (!atual || atual.tentativas >= CODIGO_TENTATIVAS) {
      return res.status(400).json({ erro: 'Código expirado. Peça um novo código.', expirado: true });
    }
    const certo = crypto.timingSafeEqual(Buffer.from(atual.codigo_hash), Buffer.from(hashCodigo(email, codigo)));
    if (!certo) {
      const restam = CODIGO_TENTATIVAS - atual.tentativas - 1;
      await supabase.from('rifa_codigos').update({ tentativas: atual.tentativas + 1 }).eq('id', atual.id);
      return res.status(400).json({ erro: restam > 0 ? `Código incorreto. Você ainda tem ${restam} tentativa(s).` : 'Código incorreto. Peça um novo código.', expirado: restam <= 0 });
    }
    await supabase.from('rifa_codigos').update({ usado: true }).eq('id', atual.id);
    const { data: bilhetes } = await supabase.from('bilhetes').select('numero, pago_em')
      .eq('email_comprador', email).eq('status', 'pago').order('numero', { ascending: true });
    return res.status(200).json({ bilhetes: bilhetes || [] });
  }

  return res.status(400).json({ erro: 'Ação inválida' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rota = req.query.r;
  try {
    if (rota === 'orcamento') return await rotaOrcamento(req, res);
    if (rota === 'avisos') return await rotaAvisos(req, res);
    if (rota === 'meus-numeros') return await rotaMeusNumeros(req, res);
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });
    if (rota === 'config') return await rotaConfig(req, res);
    if (rota === 'bilhetes') return await rotaBilhetes(req, res);
    if (rota === 'pedido-status') return await rotaPedidoStatus(req, res);
    if (rota === 'rifa-status') return await rotaRifaStatus(req, res);
    return res.status(404).json({ erro: 'Rota não encontrada' });
  } catch (e) {
    console.error(`Erro em /api/site (${rota}):`, e);
    return res.status(500).json({ erro: 'Erro interno' });
  }
}
