// api/produtos.js
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

  // GET público — retorna apenas produtos ativos (ou todos se admin)
  if (req.method === 'GET') {
    const isAdmin = autenticar(req);
    let query = supabase.from('produtos').select('*').order('criado_em', { ascending: true });
    if (!isAdmin) query = query.eq('ativo', true);
    const { data, error } = await query;
    if (error) return res.status(500).json({ erro: 'Erro ao buscar produtos' });
    return res.status(200).json({ produtos: data || [] });
  }

  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // POST — criar
  if (req.method === 'POST') {
    const { nome, cat, emoji, preco, badge, descricao, sizes, img, ativo } = await parseBody(req);
    if (!nome || !descricao) return res.status(400).json({ erro: 'nome e descricao são obrigatórios' });
    const { data: novo, error } = await supabase
      .from('produtos')
      .insert({
        nome,
        cat: cat || 'Geral',
        emoji: emoji || '🎵',
        preco: parseFloat(preco) || 0,
        badge: badge || null,
        descricao,
        sizes: sizes || [],
        img: img || null,
        ativo: ativo !== false
      })
      .select()
      .single();
    if (error) return res.status(500).json({ erro: 'Erro ao criar produto' });
    return res.status(201).json({ produto: novo });
  }

  // PUT — editar
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'id obrigatório' });
    const { nome, cat, emoji, preco, badge, descricao, sizes, img, ativo } = await parseBody(req);
    const campos = {};
    if (nome !== undefined) campos.nome = nome;
    if (cat !== undefined) campos.cat = cat;
    if (emoji !== undefined) campos.emoji = emoji;
    if (preco !== undefined) campos.preco = parseFloat(preco) || 0;
    if (badge !== undefined) campos.badge = badge || null;
    if (descricao !== undefined) campos.descricao = descricao;
    if (sizes !== undefined) campos.sizes = sizes;
    if (img !== undefined) campos.img = img || null;
    if (ativo !== undefined) campos.ativo = ativo;
    const { data: atualizado, error } = await supabase
      .from('produtos')
      .update(campos)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ erro: 'Erro ao atualizar produto' });
    return res.status(200).json({ produto: atualizado });
  }

  // DELETE — excluir
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'id obrigatório' });
    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) return res.status(500).json({ erro: 'Erro ao excluir produto' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
