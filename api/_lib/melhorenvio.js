// api/_lib/melhorenvio.js — integração com a API do Melhor Envio (frete e etiquetas).
// Docs: https://docs.melhorenvio.com.br
//
// Variáveis de ambiente (ver .env.example):
//   MELHOR_ENVIO_TOKEN   -> token gerado no painel do Melhor Envio (Integrações > Permissões de acesso)
//   MELHOR_ENVIO_SANDBOX -> "true" para o ambiente de testes; qualquer outro valor = produção
//   CEP_ORIGEM           -> CEP de onde os produtos saem (só números)
//   REMETENTE_*          -> dados de quem envia, impressos na etiqueta
//   ETIQUETA_AUTOMATICA  -> "true" gera a etiqueta assim que o pagamento é aprovado.
//                           Padrão: manual (botão "Gerar etiqueta" no admin), porque os
//                           produtos têm tempo de produção e a etiqueta tem prazo para postar.

const SITE_EMAIL = 'contato@nexusband.com.br';

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
    // O Melhor Envio exige User-Agent com nome da aplicação e e-mail de contato
    'User-Agent': `Nexus Band Loja (${SITE_EMAIL})`
  };
}

async function chamar(caminho, { method = 'GET', body } = {}) {
  const resp = await fetch(`${apiRoot()}${caminho}`, {
    method,
    headers: headersPadrao(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const texto = await resp.text().catch(() => '');
  if (!resp.ok) {
    const erro = new Error(`Melhor Envio respondeu ${resp.status} em ${caminho}: ${texto.slice(0, 300)}`);
    erro.status = resp.status;
    erro.texto = texto;
    throw erro;
  }
  try { return JSON.parse(texto); } catch { return texto; }
}

export const limparCep = cep => String(cep || '').replace(/\D/g, '');

export function freteConfigurado() {
  return !!process.env.MELHOR_ENVIO_TOKEN && limparCep(process.env.CEP_ORIGEM).length === 8;
}

export function etiquetaAutomatica() {
  return process.env.ETIQUETA_AUTOMATICA === 'true';
}

// Os Correios (PAC/SEDEX) aceitam um único volume por envio, então o pedido
// inteiro vai numa caixa só: soma os pesos, empilha as alturas e usa a maior
// largura/comprimento. O mesmo pacote é usado no cálculo e na etiqueta, para o
// valor cobrado do cliente bater com o valor pago na etiqueta.
export function montarPacote(itens) {
  let peso = 0, altura = 0, largura = 11, comprimento = 16; // mínimos dos Correios
  for (const i of itens || []) {
    const q = Number(i.qty) || 1;
    peso += (Number(i.peso_kg) || 0.3) * q;
    altura += (Number(i.altura_cm) || 5) * q;
    largura = Math.max(largura, Number(i.largura_cm) || 20);
    comprimento = Math.max(comprimento, Number(i.comprimento_cm) || 25);
  }
  return {
    width: Math.min(100, Math.round(largura)),
    height: Math.min(100, Math.max(2, Math.round(altura))),
    length: Math.min(100, Math.round(comprimento)),
    weight: Math.max(0.05, Math.round(peso * 1000) / 1000)
  };
}

const valorDeclarado = itens => Math.max(0.01, (itens || []).reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qty) || 1), 0));

// ── Cálculo do frete ────────────────────────────────────────────────────────
// Usado por /api/frete (mostrar as opções) e por /api/criar-pagamento-merch
// (revalidar o valor antes de cobrar). Os itens SEMPRE vêm do banco.
export async function calcularFrete({ cepDestino, itens }) {
  const data = await chamar('/me/shipment/calculate', {
    method: 'POST',
    body: {
      from: { postal_code: limparCep(process.env.CEP_ORIGEM) },
      to: { postal_code: limparCep(cepDestino) },
      package: montarPacote(itens),
      options: { insurance_value: valorDeclarado(itens), receipt: false, own_hand: false }
    }
  });
  if (!Array.isArray(data)) throw new Error('Resposta inesperada da API de frete');

  // Descarta transportadoras que não atendem a rota e mantém só o que a loja usa
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

// ── Etiqueta ────────────────────────────────────────────────────────────────

// Saldo da carteira do Melhor Envio (crédito pré-pago usado para pagar as etiquetas)
export async function consultarSaldo() {
  const data = await chamar('/me/balance');
  return Number(data.balance ?? data.balance_available ?? 0);
}

function remetente() {
  const r = {
    name: process.env.REMETENTE_NOME,
    phone: limparCep(process.env.REMETENTE_TELEFONE) || undefined,
    email: process.env.REMETENTE_EMAIL || process.env.EMAIL_BANDA || undefined,
    document: limparCep(process.env.REMETENTE_CPF), // pessoa física: CPF só números
    address: process.env.REMETENTE_ENDERECO,
    number: process.env.REMETENTE_NUMERO,
    complement: process.env.REMETENTE_COMPLEMENTO || '',
    district: process.env.REMETENTE_BAIRRO,
    city: process.env.REMETENTE_CIDADE,
    state_abbr: process.env.REMETENTE_UF,
    postal_code: limparCep(process.env.CEP_ORIGEM),
    country_id: 'BR'
  };
  const faltando = { name: 'REMETENTE_NOME', document: 'REMETENTE_CPF', address: 'REMETENTE_ENDERECO', number: 'REMETENTE_NUMERO',
    district: 'REMETENTE_BAIRRO', city: 'REMETENTE_CIDADE', state_abbr: 'REMETENTE_UF', postal_code: 'CEP_ORIGEM' };
  const ausentes = Object.entries(faltando).filter(([campo]) => !r[campo]).map(([, env]) => env);
  if (ausentes.length) throw new Error(`Dados do remetente incompletos. Configure na Vercel: ${ausentes.join(', ')}.`);
  return r;
}

// 1. Coloca o envio no carrinho do Melhor Envio e devolve o id da etiqueta
async function inserirNoCarrinho(pedido) {
  const data = await chamar('/me/cart', {
    method: 'POST',
    body: {
      service: Number(pedido.frete_service_id),
      from: remetente(),
      to: {
        name: pedido.nome_comprador,
        phone: limparCep(pedido.telefone_comprador) || undefined,
        email: pedido.email_comprador || undefined,
        document: limparCep(pedido.cpf_comprador),
        address: pedido.endereco,
        number: pedido.numero,
        complement: pedido.complemento || '',
        district: pedido.bairro || '',
        city: pedido.cidade || '',
        state_abbr: pedido.uf || '',
        postal_code: limparCep(pedido.cep),
        country_id: 'BR'
      },
      products: (pedido.itens || []).map((i, idx) => ({
        name: `${i.nome || `Item ${idx + 1}`}${i.tam && i.tam !== 'único' ? ` (${i.tam})` : ''}`,
        quantity: Number(i.qty) || 1,
        unitary_value: Number(i.preco) || 0.01
      })),
      volumes: [montarPacote(pedido.itens)],
      options: {
        insurance_value: valorDeclarado(pedido.itens),
        receipt: false,
        own_hand: false,
        // Sem CNPJ/nota fiscal: vai com Declaração de Conteúdo, que o Melhor Envio
        // monta a partir de "products". Não enviar invoice junto (são exclusivos).
        non_commercial: true
      }
    }
  });
  if (!data?.id) throw new Error('O Melhor Envio não devolveu o id da etiqueta.');
  return data.id;
}

// Código de rastreio da etiqueta (dos Correios quando já existe; senão o do Melhor Envio)
export async function buscarRastreio(etiquetaId) {
  const ordem = await chamar(`/me/orders/${encodeURIComponent(etiquetaId)}`);
  return ordem?.tracking || ordem?.self_tracking || null;
}

// Link do PDF para imprimir a etiqueta
async function linkImpressao(etiquetaId) {
  const data = await chamar('/me/shipment/print', { method: 'POST', body: { mode: 'private', orders: [etiquetaId] } });
  return data?.url || null;
}

// Fluxo completo para um pedido pago: carrinho -> compra com saldo -> geração.
// Nunca lança: devolve { ok, status, ... } para quem chamou gravar no pedido.
export async function gerarEtiquetaParaPedido(pedido) {
  try {
    if (!freteConfigurado()) return { ok: false, status: 'falha', erro: 'Melhor Envio não configurado (MELHOR_ENVIO_TOKEN e CEP_ORIGEM).' };
    if (!pedido.frete_service_id) return { ok: false, status: 'falha', erro: 'Pedido sem o serviço de frete salvo.' };

    // Se uma tentativa anterior já criou a etiqueta, continua de onde parou
    // (assim nunca paga duas vezes pelo mesmo pedido)
    let etiquetaId = pedido.me_etiqueta_id || null;
    let situacao = null;
    if (etiquetaId) {
      const ordem = await chamar(`/me/orders/${encodeURIComponent(etiquetaId)}`).catch(() => null);
      situacao = ordem?.status || null;
      if (!situacao || situacao === 'canceled') { etiquetaId = null; situacao = null; }
    }
    if (!etiquetaId) { etiquetaId = await inserirNoCarrinho(pedido); situacao = 'pending'; }

    if (situacao === 'pending') {
      // Confere o saldo antes de pagar, para dar um erro claro
      const saldo = await consultarSaldo();
      if (saldo < Number(pedido.frete_valor || 0)) {
        return { ok: false, status: 'falha_saldo', etiqueta_id: etiquetaId, erro: `Saldo insuficiente na carteira do Melhor Envio (R$ ${saldo.toFixed(2).replace('.', ',')}). Recarregue e tente de novo.` };
      }
      try {
        await chamar('/me/shipment/checkout', { method: 'POST', body: { orders: [etiquetaId] } });
      } catch (e) {
        const semSaldo = /saldo|balance|insufic/i.test(e.texto || '');
        return { ok: false, status: semSaldo ? 'falha_saldo' : 'falha', etiqueta_id: etiquetaId,
          erro: semSaldo ? 'Saldo insuficiente na carteira do Melhor Envio. Recarregue e tente de novo.' : e.message };
      }
    }

    if (situacao === 'pending' || situacao === 'released') {
      await chamar('/me/shipment/generate', { method: 'POST', body: { orders: [etiquetaId] } })
        .catch(e => { throw Object.assign(e, { etiquetaId }); });
    }

    // Rastreio e link de impressão são "extras": se falharem, a etiqueta já existe
    const [rastreio, link] = await Promise.all([
      buscarRastreio(etiquetaId).catch(() => null),
      linkImpressao(etiquetaId).catch(() => null)
    ]);
    return { ok: true, status: 'gerada', etiqueta_id: etiquetaId, rastreio, link_etiqueta: link };
  } catch (err) {
    console.error('Erro ao gerar etiqueta:', err.message);
    return { ok: false, status: 'falha', etiqueta_id: err.etiquetaId, erro: err.message };
  }
}
