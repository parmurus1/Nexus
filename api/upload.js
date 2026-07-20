// api/upload.js — upload de fotos (membros) para o Supabase Storage
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUCKET = 'membros-fotos';
const TIPOS_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const TAMANHO_MAX_BYTES = 5 * 1024 * 1024; // 5MB (o arquivo já deve chegar comprimido pelo navegador)

function autenticar(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.replace('Bearer ', '') === process.env.ADMIN_PASSWORD;
}

function slugify(str) {
  return String(str || 'foto')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'foto';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  try {
    const { imagemBase64, tipo, nome } = req.body || {};
    if (!imagemBase64 || !tipo) {
      return res.status(400).json({ erro: 'Dados da imagem incompletos' });
    }

    const extensao = TIPOS_PERMITIDOS[tipo];
    if (!extensao) {
      return res.status(400).json({ erro: 'Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.' });
    }

    // remove o prefixo "data:image/...;base64," se estiver presente
    const base64Limpo = imagemBase64.includes(',') ? imagemBase64.split(',')[1] : imagemBase64;
    const buffer = Buffer.from(base64Limpo, 'base64');

    if (buffer.length > TAMANHO_MAX_BYTES) {
      return res.status(400).json({ erro: 'Imagem muito grande. O tamanho máximo é 5MB.' });
    }

    const nomeArquivo = `${slugify(nome)}-${Date.now()}.${extensao}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(nomeArquivo, buffer, { contentType: tipo, upsert: false });

    if (uploadError) {
      console.error('Erro upload:', uploadError.message);
      const dica = /bucket not found/i.test(uploadError.message)
        ? ' Crie o bucket "membros-fotos" no Supabase (veja o bloco de Storage no supabase_schema.sql).'
        : '';
      return res.status(500).json({ erro: 'Erro ao enviar imagem: ' + uploadError.message + dica });
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(nomeArquivo);

    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (e) {
    console.error('Erro upload:', e.message);
    return res.status(500).json({ erro: 'Erro ao processar upload: ' + e.message });
  }
}
