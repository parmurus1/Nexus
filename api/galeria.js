// api/galeria.js — CRUD da Galeria (fotos e vídeos do YouTube) exibida em /galeria e /sobre
//
// Pensado para pesar o mínimo possível no banco:
//  - o banco guarda só metadados (tipo, título, URL); as fotos ficam no Storage
//    (bucket "galeria-fotos") e os vídeos ficam no YouTube — a capa do vídeo é
//    derivada do ID, sem upload nem coluna extra;
//  - o GET público é cacheado pela CDN da Vercel (s-maxage), então a maioria das
//    visitas nem chega ao Supabase;
//  - a reordenação é um único UPDATE (função SQL galeria_reordenar);
//  - ao excluir/trocar uma foto, os arquivos antigos são apagados do Storage.
import { createClient } from '@supabase/supabase-js';
import { autenticar } from './_lib/auth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUCKET = 'galeria-fotos';
// select('*') de propósito: algumas instalações já tinham uma tabela "galeria"
// antiga (com "criado_em" no lugar de "created_at"), e pedir uma coluna que não
// existe faz a consulta inteira falhar. A tabela é pequena, então não pesa.
const CAMPOS = '*';
const AVISO_TABELA = 'Tabela galeria não encontrada. Execute o bloco "GALERIA" do supabase_schema.sql no Supabase.';

// Aceita youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ e music.youtube.com.
// Retorna a URL normalizada (shorts continuam como shorts para a página saber
// que o vídeo é vertical) ou null se não for um link válido do YouTube.
export function normalizarYoutube(entrada) {
  const url = String(entrada || '').trim();
  const m = url.match(/^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/);
  if (!m) return null;
  const id = m[1];
  return /\/shorts\//.test(url) ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
}

// Caminho do arquivo dentro do bucket, se a URL for do nosso Storage.
function caminhoNoBucket(url) {
  const m = String(url || '').match(new RegExp(`/storage/v1/object/public/${BUCKET}/(.+?)(?:\\?.*)?$`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function removerArquivos(urls) {
  const caminhos = [...new Set(urls.map(caminhoNoBucket).filter(Boolean))];
  if (!caminhos.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(caminhos);
  if (error) console.error('Erro ao remover arquivos da galeria:', error.message);
}

function limparTexto(v, max) {
  return String(v || '').trim().slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const admin = req.query.publico === 'nao';

    // Listagem completa (inclui itens ocultos) — só para o painel admin
    if (admin) {
      if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });
      res.setHeader('Cache-Control', 'private, no-store');
      const { data, error } = await supabase
        .from('galeria')
        .select(CAMPOS)
        .order('ordem', { ascending: true })
        .order('id', { ascending: true });
      if (error) {
        console.error('GET galeria (admin) error:', error.message);
        return res.status(200).json({ itens: [], aviso: AVISO_TABELA });
      }
      return res.status(200).json({ itens: data || [] });
    }

    // Público: só itens ativos, com filtro opcional por tipo e limite (usado na /sobre)
    let query = supabase
      .from('galeria')
      .select(CAMPOS)
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('id', { ascending: true });
    if (['foto', 'video'].includes(req.query.tipo)) query = query.eq('tipo', req.query.tipo);
    const limite = parseInt(req.query.limite, 10);
    if (limite > 0) query = query.limit(Math.min(limite, 100));

    const { data, error } = await query;
    if (error) {
      console.error('GET galeria error:', error.message);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ itens: [], aviso: AVISO_TABELA });
    }
    // CDN da Vercel guarda a resposta por 5 min e serve a versão antiga por até
    // 1 dia enquanto atualiza em segundo plano — quase zero leitura no banco.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).json({ itens: data || [] });
  }

  // ── Escrita: exige autenticação ───────────────────────────────────────────
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};

  // ── PUT em lote: reordenar. Body: { reordenar: [id1, id2, ...] } ──────────
  if (req.method === 'PUT' && !req.query.id && Array.isArray(body.reordenar)) {
    const ids = body.reordenar.filter(id => typeof id === 'string').slice(0, 1000);
    const { error } = await supabase.rpc('galeria_reordenar', { ids });
    if (error) {
      // Função SQL ainda não criada — cai para updates individuais
      console.error('RPC galeria_reordenar falhou, usando fallback:', error.message);
      const resultados = await Promise.all(ids.map((id, idx) => supabase.from('galeria').update({ ordem: idx + 1 }).eq('id', id)));
      const falhou = resultados.find(r => r.error);
      if (falhou) return res.status(500).json({ erro: 'Erro ao reordenar: ' + falhou.error.message });
    }
    return res.status(200).json({ ok: true });
  }

  // ── POST: criar item ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const tipo = body.tipo;
    if (!['foto', 'video'].includes(tipo)) return res.status(400).json({ erro: 'tipo deve ser "foto" ou "video"' });

    let url = limparTexto(body.url, 1000);
    let thumbnail_url = limparTexto(body.thumbnail_url, 1000);
    if (tipo === 'video') {
      url = normalizarYoutube(url);
      if (!url) return res.status(400).json({ erro: 'Cole um link válido do YouTube (vídeo ou Shorts).' });
      thumbnail_url = ''; // capa vem do próprio YouTube
    } else if (!url) {
      return res.status(400).json({ erro: 'Envie a foto antes de salvar.' });
    }

    // Item novo entra no topo da galeria
    const { data: primeiro, error: erroOrdem } = await supabase
      .from('galeria')
      .select('ordem')
      .order('ordem', { ascending: true })
      .limit(1);
    if (erroOrdem) return res.status(500).json({ erro: AVISO_TABELA });
    const ordem = primeiro && primeiro[0] ? (primeiro[0].ordem || 0) - 1 : 0;

    const { data: inserted, error } = await supabase
      .from('galeria')
      .insert({
        tipo,
        titulo: limparTexto(body.titulo, 120),
        descricao: limparTexto(body.descricao, 200),
        url,
        thumbnail_url,
        ordem,
        ativo: body.ativo !== false
      })
      .select(CAMPOS)
      .single();

    if (error) {
      console.error('POST galeria error:', error.message);
      return res.status(500).json({ erro: 'Erro ao criar item: ' + error.message });
    }
    return res.status(201).json({ item: inserted });
  }

  const id = req.query.id;

  // ── PUT: editar item ───────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { data: atual, error: erroBusca } = await supabase
      .from('galeria').select('tipo, url, thumbnail_url').eq('id', id).single();
    if (erroBusca || !atual) return res.status(404).json({ erro: 'Item não encontrado' });

    const updates = {};
    if (body.titulo !== undefined) updates.titulo = limparTexto(body.titulo, 120);
    if (body.descricao !== undefined) updates.descricao = limparTexto(body.descricao, 200);
    if (body.ativo !== undefined) updates.ativo = body.ativo !== false;
    if (body.url !== undefined) {
      if (atual.tipo === 'video') {
        const yt = normalizarYoutube(body.url);
        if (!yt) return res.status(400).json({ erro: 'Cole um link válido do YouTube (vídeo ou Shorts).' });
        updates.url = yt;
      } else {
        const novaUrl = limparTexto(body.url, 1000);
        if (!novaUrl) return res.status(400).json({ erro: 'A foto não pode ficar vazia.' });
        updates.url = novaUrl;
        updates.thumbnail_url = limparTexto(body.thumbnail_url, 1000);
      }
    }

    const { error } = await supabase.from('galeria').update(updates).eq('id', id);
    if (error) {
      console.error('PUT galeria error:', error.message);
      return res.status(500).json({ erro: 'Erro ao atualizar item: ' + error.message });
    }

    // Foto substituída: apaga os arquivos antigos que não são mais usados
    if (updates.url && updates.url !== atual.url) {
      const antigos = [atual.url, atual.thumbnail_url].filter(u => u && u !== updates.url && u !== updates.thumbnail_url);
      await removerArquivos(antigos);
    }
    return res.status(200).json({ ok: true });
  }

  // ── DELETE: excluir item (e os arquivos dele no Storage) ─────────────────
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const { data: atual } = await supabase.from('galeria').select('url, thumbnail_url').eq('id', id).single();
    const { error } = await supabase.from('galeria').delete().eq('id', id);
    if (error) {
      console.error('DELETE galeria error:', error.message);
      return res.status(500).json({ erro: 'Erro ao excluir item: ' + error.message });
    }
    if (atual) await removerArquivos([atual.url, atual.thumbnail_url]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}
