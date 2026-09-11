// api/galeria.js — CRUD da Galeria (fotos e vídeos) exibida na página /galeria
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

  // ── GET: público — lista os itens da galeria ─────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('galeria')
      .select('*')
      .order('ordem', { ascending: true });

    if (error) {
      // Tabela ainda não existe (usuário não rodou o SQL) — retorna aviso
      console.error('GET galeria error:', error.message);
      return res.status(200).json({ itens: [], aviso: 'Tabela galeria não encontrada. Execute o arquivo supabase_schema_galeria.sql no Supabase.' });
    }

    const { publico } = req.query;
    let itens = (data || []).map(g => ({ ...g, ativo: g.ativo !== false }));
    // Endpoint público (usado na página /galeria) só retorna itens ativos
    if (publico !== 'nao') itens = itens.filter(g => g.ativo);

    return res.status(200).json({ itens });
  }

  // ── Escrita: exige autenticação ───────────────────────────────────────────
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // ── POST: criar item ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { tipo, titulo, url, thumbnail_url, ordem, ativo } = req.body || {};
    if (!tipo || !['foto', 'video'].includes(tipo)) return res.status(400).json({ erro: 'tipo deve ser "foto" ou "video"' });
    if (!url) return res.status(400).json({ erro: 'url é obrigatória' });

    const { count, error: checkError } = await supabase
      .from('galeria')
      .select('id', { count: 'exact', head: true });

    if (checkError) {
      return res.status(500).json({
        erro: 'A tabela "galeria" não existe no Supabase. Execute o arquivo supabase_schema_galeria.sql no SQL Editor do Supabase antes de usar esta função.'
      });
    }

    const { data: inserted, error } = await supabase
      .from('galeria')
      .insert({
        tipo,
        titulo: titulo || '',
        url,
        thumbnail_url: thumbnail_url || '',
        ordem: ordem != null ? parseInt(ordem, 10) : 99,
        ativo: ativo !== false
      })
      .select()
      .single();

    if (error) {
      console.error('POST galeria error:', error.message);
      return res.status(500).json({ erro: 'Erro ao criar item: ' + error.message });
    }
    return res.status(201).json({ item: inserted });
  }

  // ── PUT: editar item ───────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { tipo, titulo, url, thumbnail_url, ordem, ativo } = req.body || {};
    const updates = {};
    if (tipo !== undefined) {
      if (!['foto', 'video'].includes(tipo)) return res.status(400).json({ erro: 'tipo deve ser "foto" ou "video"' });
      updates.tipo = tipo;
    }
    if (titulo !== undefined) updates.titulo = titulo;
    if (url !== undefined) updates.url = url;
    if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url;
    if (ordem !== undefined) updates.ordem = parseInt(ordem, 10) || 0;
    if (ativo !== undefined) updates.ativo = ativo;

    const { error } = await supabase.from('galeria').update(updates).eq('id', id);
    if (error) {
      console.error('PUT galeria error:', error.message);
      return res.status(500).json({ erro: 'Erro ao atualizar item: ' + error.message });
    }
    return res.status(200).json({ ok: true });
  }

  // ── DELETE: excluir item ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { error } = await supabase.from('galeria').delete().eq('id', id);
    if (error) {
      console.error('DELETE galeria error:', error.message);
      return res.status(500).json({ erro: 'Erro ao excluir item: ' + error.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}
