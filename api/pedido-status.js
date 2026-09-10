// api/pedido-status.js — status público (não-sensível) de um pedido de merch.
// Usado pela página de espera (pendente.html) pra saber quando o pagamento
// caiu, já que o Mercado Pago não redireciona sozinho em pagamentos via Pix.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ erro: 'id do pedido é obrigatório' });

  // Só devolvemos o essencial pro front decidir se já pode redirecionar —
  // nunca endereço, e-mail, telefone ou qualquer outro dado do comprador.
  const { data, error } = await supabase
    .from('pedidos_merch')
    .select('status, nome_comprador')
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ erro: 'Pedido não encontrado' });

  return res.status(200).json({ status: data.status, nome: data.nome_comprador });
}
