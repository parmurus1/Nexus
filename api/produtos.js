// api/produtos.js — CRUD de produtos para a merch
import { createClient } from '@supabase/supabase-js';
import { autenticar } from './_lib/auth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Estoque opcional por tamanho: {"P": 3, "M": 0} ou {"único": 10}. null = sem controle.
function normalizarEstoque(v) {
  if (v === null || v === '' ) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out = {};
  for (const [tam, qtd] of Object.entries(v)) {
    const n = parseInt(qtd, 10);
    if (String(tam).trim() && Number.isInteger(n) && n >= 0) out[String(tam).trim().slice(0, 20)] = Math.min(n, 100000);
  }
  return Object.keys(out).length ? out : null;
}

function erroColuna(msg) {
  return /estoque/i.test(msg) ? ' Para usar o controle de estoque, execute o bloco ATUALIZAÇÃO 2 do supabase_schema.sql no Supabase.' : '';
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
      ativo: p.ativo !== false,
      // Fallback para produtos antigos sem peso/dimensões cadastrados
      peso_kg: p.peso_kg ?? 0.3,
      altura_cm: p.altura_cm ?? 5,
      largura_cm: p.largura_cm ?? 20,
      comprimento_cm: p.comprimento_cm ?? 25
    }));
    // Cache curto na CDN da Vercel: a maioria das visitas não chega ao banco.
    // O painel admin busca com ?_=timestamp para sempre ver o dado atualizado.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({ produtos });
  }

  // ── Escrita: exige autenticação ─────────────────────────────────────────
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // ── POST: criar produto ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, cat, descricao, preco, emoji, img, badge, sizes, ativo, peso_kg, altura_cm, largura_cm, comprimento_cm, estoque } = req.body;
    if (!nome || !descricao) return res.status(400).json({ erro: 'nome e descrição são obrigatórios' });

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
        descricao,
        preco: preco != null ? parseFloat(preco) : 0,
        emoji: emoji || 'package',
        img: img || '',
        badge: badge || null,
        sizes: Array.isArray(sizes) ? sizes : [],
        ativo: ativo !== false,
        ordem: 99,
        peso_kg: peso_kg != null ? parseFloat(peso_kg) : 0.3,
        altura_cm: altura_cm != null ? parseFloat(altura_cm) : 5,
        largura_cm: largura_cm != null ? parseFloat(largura_cm) : 20,
        comprimento_cm: comprimento_cm != null ? parseFloat(comprimento_cm) : 25,
        ...(estoque !== undefined && normalizarEstoque(estoque) !== undefined ? { estoque: normalizarEstoque(estoque) } : {})
      })
      .select()
      .single();

    if (error) {
      console.error('POST produto error:', error.message);
      return res.status(500).json({ erro: 'Erro ao criar produto: ' + error.message + erroColuna(error.message) });
    }
    return res.status(201).json({ produto: inserted });
  }

  // ── PUT: editar produto ─────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { nome, cat, descricao, preco, emoji, img, badge, sizes, ativo, peso_kg, altura_cm, largura_cm, comprimento_cm, estoque } = req.body;
    const updates = {};
    if (nome  !== undefined) updates.nome  = nome;
    if (cat   !== undefined) updates.cat   = cat;
    if (descricao !== undefined) updates.descricao = descricao;
    if (preco !== undefined) updates.preco = parseFloat(preco) || 0;
    if (emoji !== undefined) updates.emoji = emoji;
    if (img   !== undefined) updates.img   = img;
    if (badge !== undefined) updates.badge = badge || null;
    if (sizes !== undefined) updates.sizes = Array.isArray(sizes) ? sizes : [];
    if (ativo !== undefined) updates.ativo = ativo;
    if (peso_kg !== undefined) updates.peso_kg = parseFloat(peso_kg) || 0.3;
    if (altura_cm !== undefined) updates.altura_cm = parseFloat(altura_cm) || 5;
    if (largura_cm !== undefined) updates.largura_cm = parseFloat(largura_cm) || 20;
    if (comprimento_cm !== undefined) updates.comprimento_cm = parseFloat(comprimento_cm) || 25;
    if (estoque !== undefined && normalizarEstoque(estoque) !== undefined) updates.estoque = normalizarEstoque(estoque);

    const { error } = await supabase.from('produtos').update(updates).eq('id', id);
    if (error) {
      console.error('PUT produto error:', error.message);
      return res.status(500).json({ erro: 'Erro ao atualizar produto: ' + error.message + erroColuna(error.message) });
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
