// api/produtos.js — CRUD de produtos para a merch
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function autenticar(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.replace('Bearer ', '') === process.env.ADMIN_PASSWORD;
}

// Gera um id único simples (sem dependência externa)
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: público — lista todos os produtos ──────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .order('ordem', { ascending: true });

    if (error) {
      // Tabela ainda não existe (usuário não rodou o SQL) — retorna padrão
      console.error('GET produtos error:', error.message);
      return res.status(200).json({ produtos: [], aviso: 'Tabela produtos não encontrada. Execute o schema SQL no Supabase.' });
    }

    const produtos = (data || []).map(p => ({
      ...p,
      sizes: Array.isArray(p.sizes) ? p.sizes : (p.sizes ? JSON.parse(p.sizes) : []),
      ativo: p.ativo !== false
    }));
    return res.status(200).json({ produtos });
  }

  // ── Escrita: exige autenticação ─────────────────────────────────────────
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // ── POST: criar produto ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, cat, desc, preco, emoji, img, badge, sizes, ativo } = req.body;
    if (!nome || !desc) return res.status(400).json({ erro: 'nome e descrição são obrigatórios' });

    // Verifica se a tabela existe antes de inserir
    const { count, error: checkError } = await supabase
      .from('produtos')
      .select('id', { count: 'exact', head: true });

    if (checkError) {
      return res.status(500).json({
        erro: 'A tabela "produtos" não existe no Supabase. Execute o bloco de migração no SQL Editor do Supabase antes de usar esta função.'
      });
    }

    const { data: inserted, error } = await supabase
      .from('produtos')
      .insert({
        nome,
        cat: cat || '',
        desc,
        preco: preco != null ? parseFloat(preco) : 0,
        emoji: emoji || '📦',
        img: img || '',
        badge: badge || null,
        sizes: Array.isArray(sizes) ? sizes : [],
        ativo: ativo !== false,
        ordem: 99
      })
      .select()
      .single();

    if (error) {
      console.error('POST produto error:', error.message);
      return res.status(500).json({ erro: 'Erro ao criar produto: ' + error.message });
    }
    return res.status(201).json({ produto: inserted });
  }

  // ── PUT: editar produto ─────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { nome, cat, desc, preco, emoji, img, badge, sizes, ativo } = req.body;
    const updates = {};
    if (nome  !== undefined) updates.nome  = nome;
    if (cat   !== undefined) updates.cat   = cat;
    if (desc  !== undefined) updates.desc  = desc;
    if (preco !== undefined) updates.preco = parseFloat(preco) || 0;
    if (emoji !== undefined) updates.emoji = emoji;
    if (img   !== undefined) updates.img   = img;
    if (badge !== undefined) updates.badge = badge || null;
    if (sizes !== undefined) updates.sizes = Array.isArray(sizes) ? sizes : [];
    if (ativo !== undefined) updates.ativo = ativo;

    const { error } = await supabase.from('produtos').update(updates).eq('id', id);
    if (error) {
      console.error('PUT produto error:', error.message);
      return res.status(500).json({ erro: 'Erro ao atualizar produto: ' + error.message });
    }
    return res.status(200).json({ ok: true });
  }

  // ── DELETE: excluir produto ─────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) {
      console.error('DELETE produto error:', error.message);
      return res.status(500).json({ erro: 'Erro ao excluir produto: ' + error.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}
