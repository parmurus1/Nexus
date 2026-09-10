// api/frete.js — calcula o frete real (PAC/SEDEX/etc.) via API do Melhor Envio
// Docs: https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos
//
// Variáveis de ambiente necessárias (ver .env.example):
//   MELHOR_ENVIO_TOKEN   -> token OAuth2 (pessoal ou de aplicação) gerado no painel do Melhor Envio
//   MELHOR_ENVIO_SANDBOX -> "true" para usar o ambiente de testes, qualquer outro valor = produção
//   CEP_ORIGEM           -> CEP de onde os produtos são enviados (só números)

const MELHOR_ENVIO_BASE = {
  sandbox: 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',
  producao: 'https://www.melhorenvio.com.br/api/v2/me/shipment/calculate'
};

function limparCep(cep) {
  return String(cep || '').replace(/\D/g, '');
}

// Calcula o frete no servidor. Reutilizada por este endpoint e pelo
// criar-pagamento-merch.js (que revalida o valor antes de gerar o pagamento).
export async function calcularFreteMelhorEnvio({ cepOrigem, cepDestino, itens }) {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) throw new Error('MELHOR_ENVIO_TOKEN não configurado');

  const url = process.env.MELHOR_ENVIO_SANDBOX === 'true'
    ? MELHOR_ENVIO_BASE.sandbox
    : MELHOR_ENVIO_BASE.producao;

  // Agrupa os itens do carrinho em "produtos" no formato exigido pela API
  // (peso em kg, dimensões em cm, valor unitário para seguro, quantidade)
  const products = itens.map((i, idx) => ({
    id: String(i.id || idx),
    width: Math.max(11, Number(i.largura_cm) || 20),   // Correios exige mínimo 11cm
    height: Math.max(2, Number(i.altura_cm) || 5),
    length: Math.max(16, Number(i.comprimento_cm) || 25), // mínimo 16cm
    weight: Math.max(0.05, Number(i.peso_kg) || 0.3),
    insurance_value: Number(i.preco) || 0.01,
    quantity: Number(i.qty) || 1
  }));

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Nexus Band Merch (contato@nexusband.com)'
    },
    body: JSON.stringify({
      from: { postal_code: limparCep(cepOrigem) },
      to: { postal_code: limparCep(cepDestino) },
      products
    })
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`Autenticação recusada pelo Melhor Envio (${resp.status}). Verifique se MELHOR_ENVIO_TOKEN é válido e combina com MELHOR_ENVIO_SANDBOX (token de sandbox só funciona na URL de sandbox, e vice-versa). Resposta: ${texto.slice(0, 300)}`);
    }
    throw new Error(`Melhor Envio respondeu ${resp.status}: ${texto.slice(0, 300)}`);
  }

  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error('Resposta inesperada da API de frete');

  // Filtra opções com erro (ex: transportadora não atende a rota) e mapeia
  // só os campos que a loja precisa.
  return data
    .filter(op => !op.error && op.price)
    .map(op => ({
      id: op.id,
      servico: op.name,
      transportadora: op.company?.name || '',
      preco: Number(op.custom_price ?? op.price),
      prazo_dias: op.custom_delivery_time ?? op.delivery_time ?? null
    }))
    .sort((a, b) => a.preco - b.preco);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { cep, itens } = req.body;
  const cepDestino = limparCep(cep);

  if (cepDestino.length !== 8)
    return res.status(400).json({ erro: 'CEP inválido' });
  if (!itens || !Array.isArray(itens) || itens.length === 0)
    return res.status(400).json({ erro: 'Carrinho vazio' });

  const cepOrigem = process.env.CEP_ORIGEM;
  if (!cepOrigem)
    return res.status(200).json({ modo_demo: true, opcoes: [], mensagem: 'Cálculo de frete ainda não configurado. Finalize pelo WhatsApp.' });

  try {
    const opcoes = await calcularFreteMelhorEnvio({ cepOrigem, cepDestino, itens });
    if (!opcoes.length)
      return res.status(200).json({ opcoes: [], mensagem: 'Nenhuma transportadora disponível para esse CEP no momento.' });
    return res.status(200).json({ opcoes });
  } catch (err) {
    console.error('Erro ao calcular frete:', err.message);
    console.error('Config usada -> CEP_ORIGEM:', cepOrigem, '| MELHOR_ENVIO_SANDBOX:', process.env.MELHOR_ENVIO_SANDBOX, '| token presente:', !!process.env.MELHOR_ENVIO_TOKEN);
    return res.status(500).json({ erro: 'Não foi possível calcular o frete agora. Tente novamente ou finalize pelo WhatsApp.' });
  }
}
