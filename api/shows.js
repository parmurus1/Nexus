// api/shows.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function gerarToken() {
  return crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD + '_nexus').digest('hex');
}

function autenticar(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.replace('Bearer ', '') === gerarToken();
}

// Helper: garante que req.body seja parseado mesmo em ESM na Vercel
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET público — retorna todos os shows ordenados por data
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .order('data', { ascending: false });
    if (error) return res.status(500).json({ erro: 'Erro ao buscar shows' });
    return res.status(200).json({ shows: data || [] });
  }

  // Todas as outras ações exigem autenticação
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // POST — criar
  if (req.method === 'POST') {
    const { nome, local, data, horario } = await parseBody(req);
    if (!nome || !local || !data) return res.status(400).json({ erro: 'nome, local e data são obrigatórios' });
    const { data: novo, error } = await supabase
      .from('shows')
      .insert({ nome, local, data, horario: horario || 'A confirmar', feito: false })
      .select()
      .single();
    if (error) return res.status(500).json({ erro: 'Erro ao criar show' });
    return res.status(201).json({ show: novo });
  }

  // PUT — editar ou marcar como feito
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'id obrigatório' });
    const campos = {};
    const { nome, local, data, horario, feito } = await parseBody(req);
    if (nome !== undefined) campos.nome = nome;
    if (local !== undefined) campos.local = local;
    if (data !== undefined) campos.data = data;
    if (horario !== undefined) campos.horario = horario;
    if (feito !== undefined) campos.feito = feito;
    const { data: atualizado, error } = await supabase
      .from('shows')
      .update(campos)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ erro: 'Erro ao atualizar show' });
    return res.status(200).json({ show: atualizado });
  }

  // DELETE — excluir
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'id obrigatório' });
    const { error } = await supabase.from('shows').delete().eq('id', id);
    if (error) return res.status(500).json({ erro: 'Erro ao excluir show' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
