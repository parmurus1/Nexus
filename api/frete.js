// api/frete.js — opções de frete (PAC, SEDEX etc.) para o carrinho da loja, via Melhor Envio.
// A integração em si fica em _lib/melhorenvio.js.
import { createClient } from '@supabase/supabase-js';
import { calcularFrete, freteConfigurado, limparCep } from './_lib/melhorenvio.js';
import { montarItensSeguros } from './_lib/pedidos.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { cep, itens: itensCliente } = req.body || {};
  const cepDestino = limparCep(cep);
  if (cepDestino.length !== 8) return res.status(400).json({ erro: 'CEP inválido' });

  if (!freteConfigurado()) {
    return res.status(200).json({ modo_demo: true, opcoes: [], mensagem: 'Cálculo de frete ainda não configurado. Finalize pelo WhatsApp.' });
  }

  // Peso e medidas vêm do banco (o navegador só diz o que está no carrinho),
  // então o valor mostrado aqui é o mesmo que será cobrado no pagamento.
  const { itens, erro, status } = await montarItensSeguros(supabase, itensCliente);
  if (erro) return res.status(status || 400).json({ erro });

  try {
    const opcoes = await calcularFrete({ cepDestino, itens });
    if (!opcoes.length) return res.status(200).json({ opcoes: [], mensagem: 'Nenhuma transportadora atende esse CEP no momento.' });
    return res.status(200).json({ opcoes });
  } catch (err) {
    console.error('Erro ao calcular frete:', err.message, '| sandbox:', process.env.MELHOR_ENVIO_SANDBOX, '| token presente:', !!process.env.MELHOR_ENVIO_TOKEN);
    return res.status(500).json({ erro: 'Não foi possível calcular o frete agora. Tente novamente ou finalize pelo WhatsApp.' });
  }
}
