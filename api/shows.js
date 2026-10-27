// api/shows.js — CRUD de shows para a agenda
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from './_lib/auth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Cartaz do show (flyer) é opcional; a coluna vem do bloco ATUALIZAÇÃO 3 do SQL
function dicaCartaz(error) {
  return /cartaz/i.test(error?.message || '') ? '. Para usar cartazes, execute o bloco ATUALIZAÇÃO 3 do supabase_schema.sql.' : '';
}

// ── Integração com o app da banda ──────────────────────────────────────────
// Quando um show é fechado no app, ele chama POST /api/integracao/shows com o
// cabeçalho "X-Nexus-Token: <INTEGRACAO_TOKEN>" e o show aparece na agenda.
// O app manda o id do show dele (id_externo): mandar de novo atualiza o mesmo
// show em vez de duplicar. Veja exemplos no README.
function tokenIntegracaoValido(req) {
  const esperado = process.env.INTEGRACAO_TOKEN || '';
  const recebido = String(req.headers['x-nexus-token'] || '');
  if (esperado.length < 16 || !recebido) return false;
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Aceita "2026-11-21", "21/11/2026" ou "2026-11-21T19:00:00"
function normalizarData(v) {
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function normalizarHora(v, data) {
  const t = String(v || '').trim() || (String(data || '').match(/T(\d{2}:\d{2})/) || [])[1] || '';
  const m = t.match(/^(\d{1,2})[:h](\d{2})?/i);
  return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : null;
}

async function integracaoShows(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });
  if (!tokenIntegracaoValido(req)) return res.status(401).json({ erro: 'Token de integração inválido' });
  const b = req.body || {};
  const externo = String(b.id_externo ?? b.externo_id ?? b.id ?? '').trim().slice(0, 120);
  if (!externo) return res.status(400).json({ erro: 'Envie id_externo (o id do show no app)' });

  // Show desmarcado no app: some da agenda
  if (b.excluir === true || b.excluir === 'true') {
    const { error } = await supabase.from('shows').delete().eq('externo_id', externo);
    if (error) return res.status(500).json({ erro: 'Erro ao excluir show: ' + error.message });
    return res.status(200).json({ ok: true, excluido: true });
  }

  const data = normalizarData(b.data);
  const nome = String(b.nome || '').trim().slice(0, 160);
  const local = String(b.local || '').trim().slice(0, 300);
  if (!nome || !data || !local) return res.status(400).json({ erro: 'nome, data (AAAA-MM-DD ou DD/MM/AAAA) e local são obrigatórios' });

  const show = {
    externo_id: externo,
    nome, data, local,
    hora: normalizarHora(b.hora, b.data),
    status: b.cancelado === true || b.status === 'cancelado' ? 'cancelado' : 'breve',
    gratuito: b.gratuito === true || b.gratuito === 'true',
    ...(b.link !== undefined ? { link: String(b.link || '').trim().slice(0, 500) || null } : {}),
    ...(b.cartaz !== undefined ? { cartaz: String(b.cartaz || '').trim().slice(0, 1000) || null } : {})
  };
  const { data: salvo, error } = await supabase
    .from('shows')
    .upsert(show, { onConflict: 'externo_id' })
    .select()
    .single();
  if (error) {
    const dica = /externo_id|conflict/i.test(error.message) ? '. Execute o bloco ATUALIZAÇÃO 4 do supabase_schema.sql.' : '';
    return res.status(500).json({ erro: 'Erro ao salvar show: ' + error.message + dica });
  }
  return res.status(200).json({ ok: true, show: salvo });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Nexus-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.query.integracao) return integracaoShows(req, res);

  // GET — público: shows em ordem de data (e horário). Não existe ordem manual:
  // a agenda se organiza sozinha conforme as datas.
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .order('data', { ascending: true })
      .order('hora', { ascending: true, nullsFirst: true });
    if (error) return res.status(500).json({ erro: 'Erro ao buscar shows' });
    // Cache curto na CDN da Vercel: a maioria das visitas não chega ao banco.
    // O painel admin busca com ?_=timestamp para sempre ver o dado atualizado.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({ shows: data || [] });
  }

  // Escrita exige autenticação
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // POST — criar show
  if (req.method === 'POST') {
    const { nome, data, hora, local, status, link, gratuito, cartaz } = req.body;
    if (!nome || !data || !local) return res.status(400).json({ erro: 'nome, data e local são obrigatórios' });

    const { data: inserted, error } = await supabase
      .from('shows')
      .insert({ nome, data, hora: hora || null, local, status: status || 'breve', link: link || null, gratuito: gratuito || false, ...(cartaz ? { cartaz } : {}) })
      .select()
      .single();
    if (error) return res.status(500).json({ erro: 'Erro ao criar show' + dicaCartaz(error) });
    return res.status(201).json({ show: inserted });
  }

  // PUT — editar show (id na URL: /api/shows/[id])
  if (req.method === 'PUT') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });
    const { nome, data, hora, local, status, link, gratuito, cartaz } = req.body;
    const updates = {};
    if (nome !== undefined) updates.nome = nome;
    if (data !== undefined) updates.data = data;
    if (hora !== undefined) updates.hora = hora || null;
    if (local !== undefined) updates.local = local;
    if (status !== undefined) updates.status = status;
    if (link !== undefined) updates.link = link || null;
    if (gratuito !== undefined) updates.gratuito = gratuito;
    if (cartaz !== undefined) updates.cartaz = cartaz || null;
    const { error } = await supabase.from('shows').update(updates).eq('id', id);
    if (error) return res.status(500).json({ erro: 'Erro ao atualizar show' + dicaCartaz(error) });
    return res.status(200).json({ ok: true });
  }

  // DELETE — excluir show
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });
    const { error } = await supabase.from('shows').delete().eq('id', id);
    if (error) return res.status(500).json({ erro: 'Erro ao excluir show' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}
