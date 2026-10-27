// api/shows.js — CRUD de shows para a agenda
import { createClient } from '@supabase/supabase-js';
import { autenticar } from './_lib/auth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Cartaz do show (flyer) é opcional; a coluna vem do bloco ATUALIZAÇÃO 3 do SQL
function dicaCartaz(error) {
  return /cartaz/i.test(error?.message || '') ? '. Para usar cartazes, execute o bloco ATUALIZAÇÃO 3 do supabase_schema.sql.' : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

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
