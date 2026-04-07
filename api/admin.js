// api/admin.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function autenticar(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const senha = auth.replace('Bearer ', '');
  return senha === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { acao } = req.query;

  // Login
  if (acao === 'login') {
    if (req.method !== 'POST') return res.status(405).end();
    const { senha } = req.body;
    if (senha === process.env.ADMIN_PASSWORD) {
      return res.status(200).json({ ok: true, token: process.env.ADMIN_PASSWORD });
    }
    return res.status(401).json({ erro: 'Senha incorreta' });
  }

  if (!autenticar(req)) return res.status(401).json({ erro: 'Não autorizado' });

  // Resumo
  if (acao === 'resumo') {
    const { data: bilhetes } = await supabase
      .from('bilhetes')
      .select('numero, status, nome_comprador, email_comprador, instagram_comprador, telefone_comprador, pago_em');
    const { data: config } = await supabase.from('config').select('chave, valor');
    const { data: sorteio } = await supabase.from('sorteio').select('*').order('realizado_em', { ascending: false }).limit(1);

    const configObj = {};
    config?.forEach(c => { configObj[c.chave] = c.valor; });

    const stats = {
      total: bilhetes?.length || 0,
      disponiveis: bilhetes?.filter(b => b.status === 'disponivel').length || 0,
      reservados: bilhetes?.filter(b => b.status === 'reservado').length || 0,
      pagos: bilhetes?.filter(b => b.status === 'pago').length || 0,
    };

    return res.status(200).json({ bilhetes, config: configObj, stats, ultimo_sorteio: sorteio?.[0] || null });
  }

  // Liberar expirados
  if (acao === 'liberar-expirados') {
    const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('bilhetes')
      .update({ status: 'disponivel', nome_comprador: null, email_comprador: null, instagram_comprador: null, telefone_comprador: null, preference_id: null, reservado_em: null })
      .eq('status', 'reservado')
      .lt('reservado_em', trintaMinutosAtras)
      .select('numero');

    if (error) return res.status(500).json({ erro: 'Erro ao liberar bilhetes' });
    return res.status(200).json({ liberados: data?.map(b => b.numero) || [] });
  }

  // Sortear
  if (acao === 'sortear') {
    if (req.method !== 'POST') return res.status(405).end();

    const { data: pagos } = await supabase
      .from('bilhetes')
      .select('numero, nome_comprador, instagram_comprador')
      .eq('status', 'pago');

    if (!pagos || pagos.length === 0)
      return res.status(400).json({ erro: 'Nenhum bilhete pago encontrado' });

    const vencedor = pagos[Math.floor(Math.random() * pagos.length)];

    await supabase.from('sorteio').insert({
      numero_sorteado: vencedor.numero,
      nome_vencedor: vencedor.nome_comprador,
      instagram_vencedor: vencedor.instagram_comprador || null
    });

    return res.status(200).json({
      numero_sorteado: vencedor.numero,
      nome_vencedor: vencedor.nome_comprador,
      instagram_vencedor: vencedor.instagram_comprador || null
    });
  }

  // Atualizar configuração
  if (acao === 'config' && req.method === 'POST') {
    const { chave, valor } = req.body;
    if (!chave || valor === undefined) return res.status(400).json({ erro: 'Dados inválidos' });

    const { error } = await supabase
      .from('config')
      .upsert({ chave, valor: String(valor) }, { onConflict: 'chave' });

    if (error) return res.status(500).json({ erro: 'Erro ao atualizar config' });
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ erro: 'Ação não encontrada' });
}
