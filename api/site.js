// api/site.js — endpoints públicos pequenos reunidos numa única Serverless Function
// (o plano Hobby da Vercel permite no máximo 12). As URLs antigas continuam
// funcionando via rewrites no vercel.json:
//   GET  /api/config          -> configurações e conteúdo editável do site
//   GET  /api/bilhetes        -> números da rifa e status
//   GET  /api/pedido-status   -> status (não sensível) de um pedido da loja
//   POST /api/orcamento       -> formulário de orçamento da página Contratantes
//   POST /api/avisos          -> cadastro de fãs no rodapé ("avisos de shows")
import { createClient } from '@supabase/supabase-js';
import { liberarExpirados } from './_lib/rifa.js';
import { ipDaRequisicao } from './_lib/auth.js';
import { enviarEmail, emailNovoOrcamento } from './_lib/email.js';

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
  return res.status(200).json({ bilhetes: data, config: { valor_bilhete: config?.valor_bilhete, data_sorteio: config?.data_sorteio } });
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email) && o.telefone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ erro: 'Informe um e-mail ou telefone válido para retornarmos.' });
  }
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) o.email = '';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rota = req.query.r;
  try {
    if (rota === 'orcamento') return await rotaOrcamento(req, res);
    if (rota === 'avisos') return await rotaAvisos(req, res);
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });
    if (rota === 'config') return await rotaConfig(req, res);
    if (rota === 'bilhetes') return await rotaBilhetes(req, res);
    if (rota === 'pedido-status') return await rotaPedidoStatus(req, res);
    return res.status(404).json({ erro: 'Rota não encontrada' });
  } catch (e) {
    console.error(`Erro em /api/site (${rota}):`, e);
    return res.status(500).json({ erro: 'Erro interno' });
  }
}
