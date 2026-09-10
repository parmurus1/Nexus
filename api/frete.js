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

// Raiz da API (sem o path de cálculo) — usada para montar os demais endpoints
// (carrinho, checkout, geração de etiqueta, saldo da carteira).
function apiRoot() {
  return process.env.MELHOR_ENVIO_SANDBOX === 'true'
    ? 'https://sandbox.melhorenvio.com.br/api/v2'
    : 'https://www.melhorenvio.com.br/api/v2';
}

function headersPadrao() {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) throw new Error('MELHOR_ENVIO_TOKEN não configurado');
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Nexus Band Merch (contato@nexusband.com)'
  };
}

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

// ── Saldo da carteira do Melhor Envio ──────────────────────────────────────
// Antes de comprar uma etiqueta é preciso garantir que há saldo suficiente
// na carteira (crédito pré-pago, separado do Mercado Pago). Se não houver,
// a compra falha — então checamos antes para dar um erro claro e evitar
// tentativas inúteis.
export async function consultarSaldoCarteira() {
  const resp = await fetch(`${apiRoot()}/me/balance`, {
    method: 'GET',
    headers: headersPadrao()
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`Não foi possível consultar o saldo da carteira (${resp.status}): ${texto.slice(0, 300)}`);
  }
  const data = await resp.json();
  // A API retorna algo como { balance: 123.45 }
  return Number(data.balance ?? data.balance_available ?? 0);
}

// ── 1. Inserir o frete escolhido no carrinho do Melhor Envio ──────────────
// Precisa dos dados completos do destinatário e do remetente (endereço,
// itens etc). Retorna o "orderId" usado nas etapas seguintes.
export async function inserirNoCarrinho({ cepOrigem, destinatario, itens, servicoId }) {
  const products = itens.map((i, idx) => ({
    name: i.nome || `Item ${idx + 1}`,
    quantity: Number(i.qty) || 1,
    unitary_value: Number(i.preco) || 0.01
  }));

  const volumes = itens.map(i => ({
    width: Math.max(11, Number(i.largura_cm) || 20),
    height: Math.max(2, Number(i.altura_cm) || 5),
    length: Math.max(16, Number(i.comprimento_cm) || 25),
    weight: Math.max(0.05, Number(i.peso_kg) || 0.3)
  }));

  // Dados do REMETENTE (vocês) — fixos, vêm de variáveis de ambiente porque
  // não mudam pedido a pedido. Sem isso o Melhor Envio recusa com 422
  // ("from.name é obrigatório", etc).
  const remetente = {
    name: process.env.REMETENTE_NOME,
    document: process.env.REMETENTE_CPF, // CPF só números — pessoa física
    address: process.env.REMETENTE_ENDERECO,
    number: process.env.REMETENTE_NUMERO,
    complement: process.env.REMETENTE_COMPLEMENTO || '',
    district: process.env.REMETENTE_BAIRRO,
    city: process.env.REMETENTE_CIDADE,
    state_abbr: process.env.REMETENTE_UF,
    postal_code: limparCep(cepOrigem),
    country_id: 'BR'
  };
  const faltando = ['name', 'document', 'address', 'number', 'district', 'city', 'state_abbr']
    .filter(campo => !remetente[campo]);
  if (faltando.length) {
    throw new Error(`Dados do remetente incompletos nas variáveis de ambiente (faltando: ${faltando.map(c => 'REMETENTE_' + c.toUpperCase()).join(', ')}). Configure-as na Vercel.`);
  }

  const body = {
    service: Number(servicoId),
    from: remetente,
    to: {
      name: destinatario.nome,
      document: destinatario.cpf,
      address: destinatario.endereco,
      number: destinatario.numero,
      complement: destinatario.complemento || '',
      district: destinatario.bairro || '',
      city: destinatario.cidade || '',
      state_abbr: destinatario.uf || '',
      postal_code: limparCep(destinatario.cep),
      country_id: 'BR'
    },
    products,
    volumes,
    options: {
      insurance_value: itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qty) || 1), 0),
      receipt: false,
      own_hand: false,
      // Sem CNPJ/nota fiscal: usamos Declaração de Conteúdo Eletrônica (DC-e).
      // O Melhor Envio gera a DC-e automaticamente a partir do array "products"
      // acima (nome, quantidade, valor unitário) — não precisa anexar nada manualmente.
      // IMPORTANTE: não enviar options.invoice.key junto com non_commercial — são
      // mutuamente exclusivos (nota fiscal OU declaração de conteúdo, nunca os dois).
      non_commercial: true
    }
  };

  const resp = await fetch(`${apiRoot()}/me/cart`, {
    method: 'POST',
    headers: headersPadrao(),
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`Erro ao inserir no carrinho do Melhor Envio (${resp.status}): ${texto.slice(0, 300)}`);
  }

  const data = await resp.json();
  return data.id; // orderId do item inserido no carrinho
}

// ── 2. Comprar (pagar) a etiqueta com saldo da carteira ────────────────────
export async function comprarEtiqueta(orderId) {
  const resp = await fetch(`${apiRoot()}/me/shipment/checkout`, {
    method: 'POST',
    headers: headersPadrao(),
    body: JSON.stringify({ orders: [orderId] })
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    if (resp.status === 400 && /saldo|balance|insufic/i.test(texto)) {
      throw new Error('SALDO_INSUFICIENTE');
    }
    throw new Error(`Erro ao comprar etiqueta (${resp.status}): ${texto.slice(0, 300)}`);
  }
  return resp.json();
}

// ── 3. Gerar a etiqueta (rastreio + link do PDF) ────────────────────────────
export async function gerarEtiqueta(orderId) {
  const resp = await fetch(`${apiRoot()}/me/shipment/generate`, {
    method: 'POST',
    headers: headersPadrao(),
    body: JSON.stringify({ orders: [orderId] })
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`Erro ao gerar etiqueta (${resp.status}): ${texto.slice(0, 300)}`);
  }

  const data = await resp.json();
  // Resposta traz um objeto por orderId com o link de impressão e tracking
  const info = Array.isArray(data) ? data[0] : data[orderId] || data;
  return {
    rastreio: info?.tracking || null,
    link_etiqueta: info?.url || info?.print?.url || null
  };
}

// ── Orquestrador: roda as 3 etapas em sequência para um pedido pago ────────
// Pensado para ser chamado pelo webhook assim que o pagamento é aprovado.
// Nunca lança para o chamador travar o fluxo do webhook — sempre retorna um
// objeto { ok, ...} descrevendo o resultado, incluindo falhas de saldo.
export async function gerarEtiquetaParaPedido(pedido) {
  try {
    if (!pedido.frete_service_id) {
      return { ok: false, status: 'falha', erro: 'Pedido sem frete_service_id salvo — não é possível gerar etiqueta automaticamente.' };
    }

    // 1. Checa saldo antes de gastar chamadas com carrinho/checkout
    const saldo = await consultarSaldoCarteira();
    if (saldo < Number(pedido.frete_valor || 0)) {
      return { ok: false, status: 'falha_saldo', erro: `Saldo insuficiente na carteira do Melhor Envio (R$ ${saldo.toFixed(2)}). Recarregue e gere a etiqueta manualmente.` };
    }

    const cepOrigem = process.env.CEP_ORIGEM;
    if (!cepOrigem) throw new Error('CEP_ORIGEM não configurado');

    const orderId = await inserirNoCarrinho({
      cepOrigem,
      destinatario: {
        nome: pedido.nome_comprador,
        cpf: pedido.cpf_comprador,
        cep: pedido.cep,
        endereco: pedido.endereco,
        numero: pedido.numero,
        complemento: pedido.complemento,
        bairro: pedido.bairro,
        cidade: pedido.cidade,
        uf: pedido.uf
      },
      itens: pedido.itens,
      servicoId: pedido.frete_service_id
    });

    await comprarEtiqueta(orderId);
    const { rastreio, link_etiqueta } = await gerarEtiqueta(orderId);

    return { ok: true, status: 'gerada', etiqueta_id: orderId, rastreio, link_etiqueta };

  } catch (err) {
    if (err.message === 'SALDO_INSUFICIENTE') {
      return { ok: false, status: 'falha_saldo', erro: 'Saldo insuficiente na carteira do Melhor Envio. Recarregue e gere a etiqueta manualmente.' };
    }
    console.error('Erro ao gerar etiqueta automaticamente:', err.message);
    return { ok: false, status: 'falha', erro: err.message };
  }
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
