// api/bilhetes.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { data, error } = await supabase
    .from('bilhetes')
    .select('numero, status')
    .order('numero', { ascending: true });

  if (error) return res.status(500).json({ erro: 'Erro ao buscar bilhetes' });

  // Buscar config também
  const { data: config } = await supabase
    .from('config')
    .select('chave, valor');

  const configObj = {};
  config?.forEach(c => { configObj[c.chave] = c.valor; });

  return res.status(200).json({ bilhetes: data, config: configObj });
}
