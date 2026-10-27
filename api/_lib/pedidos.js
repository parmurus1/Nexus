// api/_lib/pedidos.js — regras compartilhadas dos pedidos da loja (merch).
import { gerarEtiquetaParaPedido, buscarRastreio } from './melhorenvio.js';
import { enviarEmail, emailEtiquetaGerada } from './email.js';

export const MAX_QTD_POR_ITEM = 20;

// Estoque é opcional: produtos.estoque = {"P": 3, "M": 5} ou {"único": 10}.
// null (ou tamanho ausente no objeto) = sem controle de estoque.
export function estoqueDisponivel(produto, tam) {
  const e = produto && produto.estoque;
  if (!e || typeof e !== 'object' || !(tam in e)) return Infinity;
  return Math.max(0, parseInt(e[tam], 10) || 0);
}

// Monta os itens do pedido a partir do BANCO, nunca dos preços/nomes enviados
// pelo navegador. O navegador só informa id do produto, tamanho e quantidade.
export async function montarItensSeguros(supabase, itensCliente) {
  if (!Array.isArray(itensCliente) || !itensCliente.length) return { erro: 'Carrinho vazio' };
  if (itensCliente.length > 30) return { erro: 'Carrinho com itens demais' };

  // Carrinhos salvos por versões antigas da loja não têm o id do produto
  if (itensCliente.some(i => !i || !i.id)) {
    return { erro: 'Carrinho desatualizado. Recarregue a página da loja e adicione os produtos novamente.' };
  }
  const ids = [...new Set(itensCliente.map(i => String(i.id)))];

  const { data: produtos, error } = await supabase.from('produtos').select('*').in('id', ids);
  if (error) return { erro: 'Erro ao consultar produtos', status: 500 };

  // Junta linhas repetidas (mesmo produto + tamanho)
  const agrupado = new Map();
  for (const i of itensCliente) {
    const p = (produtos || []).find(x => String(x.id) === String(i.id));
    if (!p) return { erro: 'Um dos produtos do carrinho não existe mais. Recarregue a página da loja.' };
    if (p.ativo === false) return { erro: `"${p.nome}" não está mais disponível.` };
    const preco = Number(p.preco);
    if (!(preco > 0)) return { erro: `"${p.nome}" ainda não tem preço definido.` };

    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const tam = sizes.length ? String(i.tam || '') : 'único';
    if (sizes.length && !sizes.includes(tam)) return { erro: `Escolha um tamanho válido para "${p.nome}".` };

    const qty = parseInt(i.qty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTD_POR_ITEM) return { erro: `Quantidade inválida para "${p.nome}".` };

    const chave = `${p.id}|${tam}`;
    const atual = agrupado.get(chave);
    if (atual) atual.qty += qty;
    else agrupado.set(chave, {
      id: p.id, nome: p.nome, tam, qty, preco,
      peso_kg: Number(p.peso_kg) || 0.3, altura_cm: Number(p.altura_cm) || 5,
      largura_cm: Number(p.largura_cm) || 20, comprimento_cm: Number(p.comprimento_cm) || 25,
      _produto: p
    });
  }

  const itens = [];
  for (const it of agrupado.values()) {
    const disponivel = estoqueDisponivel(it._produto, it.tam);
    if (it.qty > disponivel) {
      const tamTxt = it.tam !== 'único' ? ` (${it.tam})` : '';
      return { erro: disponivel > 0 ? `Só restam ${disponivel} unidade(s) de "${it.nome}${tamTxt}".` : `"${it.nome}${tamTxt}" esgotou.` };
    }
    delete it._produto;
    itens.push(it);
  }
  return { itens };
}

// Baixa o estoque de um pedido pago (função SQL baixar_estoque; sem ela, ignora).
export async function baixarEstoque(supabase, itens) {
  for (const i of itens || []) {
    if (!i.id) continue;
    const { error } = await supabase.rpc('baixar_estoque', { p_id: i.id, p_tam: i.tam || 'único', p_qtd: Number(i.qty) || 1 });
    if (error) { console.error('[estoque] não foi possível baixar o estoque:', error.message); return; }
  }
}

// Gera a etiqueta no Melhor Envio e grava o resultado no pedido. Usado pelo
// botão "Gerar etiqueta" do admin e, com ETIQUETA_AUTOMATICA=true, pelo webhook.
export async function gerarEtiquetaESalvar(supabase, pedido) {
  const resultado = await gerarEtiquetaParaPedido(pedido);
  if (resultado.ok) {
    await supabase.from('pedidos_merch').update({
      me_status: 'gerada',
      me_etiqueta_id: String(resultado.etiqueta_id),
      me_rastreio: resultado.rastreio,
      me_link_etiqueta: resultado.link_etiqueta,
      me_etiqueta_gerada_em: new Date().toISOString(),
      me_erro: null
    }).eq('id', pedido.id);
    // O cliente recebe o rastreio por e-mail assim que ele existir
    if (resultado.rastreio) await enviarEmail({ para: pedido.email_comprador, ...emailEtiquetaGerada(pedido, resultado.rastreio) });
  } else {
    await supabase.from('pedidos_merch').update({
      me_status: resultado.status,
      me_erro: resultado.erro,
      // guarda a etiqueta já criada para a próxima tentativa continuar dela
      ...(resultado.etiqueta_id ? { me_etiqueta_id: String(resultado.etiqueta_id) } : {})
    }).eq('id', pedido.id);
  }
  return resultado;
}

// Busca de novo o rastreio de uma etiqueta já gerada (às vezes ele só aparece
// depois). Na primeira vez que encontra, avisa o cliente por e-mail.
export async function atualizarRastreio(supabase, pedido) {
  if (!pedido.me_etiqueta_id) return { erro: 'Este pedido ainda não tem etiqueta.' };
  const rastreio = await buscarRastreio(pedido.me_etiqueta_id).catch(e => { console.error('[rastreio]', e.message); return null; });
  if (!rastreio) return { erro: 'O rastreio ainda não está disponível. Tente de novo mais tarde.' };
  if (rastreio !== pedido.me_rastreio) {
    await supabase.from('pedidos_merch').update({ me_rastreio: rastreio }).eq('id', pedido.id);
    if (!pedido.me_rastreio) await enviarEmail({ para: pedido.email_comprador, ...emailEtiquetaGerada(pedido, rastreio) });
  }
  return { rastreio };
}
