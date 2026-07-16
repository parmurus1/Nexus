// api/membros.js — CRUD de membros para a página Sobre
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function autenticar(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.replace('Bearer ', '') === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: público — lista todos os membros ────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('membros')
      .select('*')
      .order('ordem', { ascending: true });

    if (error) {
      // Tabela ainda não existe (usuário não rodou o SQL) — retorna aviso
      console.error('GET membros error:', error.message);
      return res.status(200).json({ membros: [], aviso: 'Tabela membros não encontrada. Execute o bloco de migração no supabase_schema.sql.' });
    }

    const membros = (data || []).map(m => ({ ...m, ativo: m.ativo !== false }));
    return res.status(200).json({ membros });
  }

  // ── Escrita: exige autenticação ───────────────────────────────────────────
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // ── POST: criar membro ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, funcao, foto, bio, instagram, tiktok, ativo, ordem } = req.body;
    if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

    const { count, error: checkError } = await supabase
      .from('membros')
      .select('id', { count: 'exact', head: true });

    if (checkError) {
      return res.status(500).json({
        erro: 'A tabela "membros" não existe no Supabase. Execute o bloco de migração no SQL Editor do Supabase antes de usar esta função.'
      });
    }

    const { data: inserted, error } = await supabase
      .from('membros')
      .insert({
        nome,
        funcao: funcao || '',
        foto: foto || '',
        bio: bio || '',
        instagram: instagram || '',
        tiktok: tiktok || '',
        ativo: ativo !== false,
        ordem: ordem != null ? parseInt(ordem, 10) : 99
      })
      .select()
      .single();

    if (error) {
      console.error('POST membro error:', error.message);
      return res.status(500).json({ erro: 'Erro ao criar membro: ' + error.message });
    }
    return res.status(201).json({ membro: inserted });
  }

  // ── PUT: editar membro ────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { nome, funcao, foto, bio, instagram, tiktok, ativo, ordem } = req.body;
    const updates = {};
    if (nome      !== undefined) updates.nome      = nome;
    if (funcao    !== undefined) updates.funcao    = funcao;
    if (foto      !== undefined) updates.foto      = foto;
    if (bio       !== undefined) updates.bio       = bio;
    if (instagram !== undefined) updates.instagram = instagram;
    if (tiktok    !== undefined) updates.tiktok    = tiktok;
    if (ativo     !== undefined) updates.ativo     = ativo;
    if (ordem     !== undefined) updates.ordem     = parseInt(ordem, 10) || 0;

    const { error } = await supabase.from('membros').update(updates).eq('id', id);
    if (error) {
      console.error('PUT membro error:', error.message);
      return res.status(500).json({ erro: 'Erro ao atualizar membro: ' + error.message });
    }
    return res.status(200).json({ ok: true });
  }

  // ── DELETE: excluir membro ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { error } = await supabase.from('membros').delete().eq('id', id);
    if (error) {
      console.error('DELETE membro error:', error.message);
      return res.status(500).json({ erro: 'Erro ao excluir membro: ' + error.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}
