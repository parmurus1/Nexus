// api/config.js — endpoint público para leitura de configs do site
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

  const { data, error } = await supabase.from('config').select('chave, valor');
  if (error) return res.status(500).json({ erro: 'Erro ao buscar config' });

  const configObj = {};
  data?.forEach(c => { configObj[c.chave] = c.valor; });

  return res.status(200).json(configObj);
}
