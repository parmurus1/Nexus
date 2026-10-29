// api/admin.js — ações do painel admin (login, upload, rifa, pedidos, orçamentos, config)
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { autenticar, verificarCredenciais, criarSessao, multiusuario, usuariosAdmin, ipDaRequisicao, MAX_TENTATIVAS, JANELA_TENTATIVAS_MIN } from './_lib/auth.js';
import { liberarExpirados, ajustarTotalBilhetes } from './_lib/rifa.js';
import { gerarEtiquetaESalvar, atualizarRastreio } from './_lib/pedidos.js';
import { emailConfigurado, enviarEmail, emailRifaVencedor } from './_lib/email.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const UPLOAD_BUCKET_PADRAO = 'membros-fotos';
const UPLOAD_BUCKETS_PERMITIDOS = ['membros-fotos', 'galeria-fotos', 'produtos-fotos'];
const UPLOAD_TIPOS_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
// O navegador já redimensiona e converte para WebP antes de enviar (ver admin.html),
// então uma foto chega com ~150–500KB. O limite abaixo também respeita o teto de
// 4,5MB de corpo de requisição das funções da Vercel (base64 aumenta ~33%).
const UPLOAD_TAMANHO_MAX_BYTES = 3 * 1024 * 1024;

function uploadSlugify(str) {
  return String(str || 'foto')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'foto';
}

// Extrai {bucket, caminho} de uma URL pública do nosso Storage (só buckets permitidos).
function arquivoDoStorage(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (!m || !UPLOAD_BUCKETS_PERMITIDOS.includes(m[1])) return null;
  return { bucket: m[1], caminho: decodeURIComponent(m[2]) };
}

// Chaves que o painel pode gravar na tabela config (evita gravar lixo arbitrário)
const CONFIG_PERMITIDA = /^(valor_bilhete|data_sorteio|rifa_ativa|modo_demo|rifa_nav_visivel|venom_mode|chave_pix|link_[a-z]+|contato_[a-z]+|conteudo_[a-z_]+|musica_[a-z_]+)$/;

async function tentativasRecentes(ip) {
  const desde = new Date(Date.now() - JANELA_TENTATIVAS_MIN * 60 * 1000).toISOString();
  const { count, error } = await supabase.from('admin_tentativas').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('criado_em', desde);
  if (error) return 0; // tabela ainda não criada: segue sem limite (ver supabase_schema.sql)
  return count || 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { acao } = req.query;

  // Informa à tela de login se ela deve pedir usuário (ADMIN_USERS) ou só senha
  if (acao === 'login-info') {
    return res.status(200).json({ multiusuario: multiusuario(), configurado: usuariosAdmin().length > 0 });
  }

  // Login: devolve uma sessão assinada que expira em 12h (nunca a senha).
  // Limite de tentativas erradas por IP contra adivinhação de senha.
  if (acao === 'login') {
    if (req.method !== 'POST') return res.status(405).end();
    if (!usuariosAdmin().length) return res.status(500).json({ erro: 'Painel sem senha configurada (ADMIN_PASSWORD ou ADMIN_USERS na Vercel).' });
    const ip = ipDaRequisicao(req);
    if (await tentativasRecentes(ip) >= MAX_TENTATIVAS) {
      return res.status(429).json({ erro: `Muitas tentativas erradas. Aguarde ${JANELA_TENTATIVAS_MIN} minutos e tente de novo.` });
    }
    const { usuario, senha } = req.body || {};
    const nome = verificarCredenciais(usuario, senha);
    if (!nome) {
      await supabase.from('admin_tentativas').insert({ ip }).then(() => {}, () => {});
      // atraso pequeno deixa ataques automatizados mais lentos
      await new Promise(r => setTimeout(r, 600));
      return res.status(401).json({ erro: multiusuario() ? 'Usuário ou senha incorretos' : 'Senha incorreta' });
    }
    await supabase.from('admin_tentativas').delete().eq('ip', ip).then(() => {}, () => {});
    const sessao = criarSessao(nome);
    return res.status(200).json({ ok: true, usuario: nome, ...sessao });
  }

  const sessao = autenticar(req);
  if (!sessao) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });

  // Upload de imagem (fotos de membros e da galeria) — antes era o arquivo api/upload.js,
  // unificado aqui para não ultrapassar o limite de Serverless Functions do plano Hobby da Vercel.
  if (acao === 'upload') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    try {
      const { imagemBase64, tipo, nome, pasta, sufixo } = req.body || {};
      if (!imagemBase64 || !tipo) {
        return res.status(400).json({ erro: 'Dados da imagem incompletos' });
      }

      const bucket = UPLOAD_BUCKETS_PERMITIDOS.includes(pasta) ? pasta : UPLOAD_BUCKET_PADRAO;

      const extensao = UPLOAD_TIPOS_PERMITIDOS[tipo];
      if (!extensao) {
        return res.status(400).json({ erro: 'Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.' });
      }

      const base64Limpo = imagemBase64.includes(',') ? imagemBase64.split(',')[1] : imagemBase64;
      const buffer = Buffer.from(base64Limpo, 'base64');

      if (buffer.length > UPLOAD_TAMANHO_MAX_BYTES) {
        return res.status(400).json({ erro: 'Imagem muito grande. O tamanho máximo é 3MB.' });
      }

      const sufixoLimpo = sufixo ? '-' + uploadSlugify(sufixo).slice(0, 12) : '';
      const nomeArquivo = `${uploadSlugify(nome)}-${Date.now()}${Math.random().toString(36).slice(2, 6)}${sufixoLimpo}.${extensao}`;

      // Nome de arquivo é único, então pode ser cacheado "para sempre" pela CDN do
      // Supabase — reduz bastante o tráfego (egress) do plano gratuito.
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(nomeArquivo, buffer, { contentType: tipo, upsert: false, cacheControl: '31536000' });

      if (uploadError) {
        console.error('Erro upload:', uploadError.message);
        const dica = /bucket not found/i.test(uploadError.message)
          ? ` Crie o bucket "${bucket}" no Supabase (veja os blocos de Storage no supabase_schema.sql).`
          : '';
        return res.status(500).json({ erro: 'Erro ao enviar imagem: ' + uploadError.message + dica });
      }

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(nomeArquivo);
      return res.status(200).json({ url: publicUrlData.publicUrl });
    } catch (e) {
      console.error('Erro upload:', e.message);
      return res.status(500).json({ erro: 'Erro ao processar upload: ' + e.message });
    }
  }

  // Remove arquivos enviados que acabaram não sendo usados (ex.: admin enviou uma
  // foto e fechou o formulário sem salvar). Body: { urls: [...] }
  if (acao === 'remover-arquivo') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const arquivos = (Array.isArray(req.body?.urls) ? req.body.urls : []).map(arquivoDoStorage).filter(Boolean).slice(0, 50);
    const porBucket = {};
    arquivos.forEach(a => { (porBucket[a.bucket] = porBucket[a.bucket] || []).push(a.caminho); });
    for (const [bucket, caminhos] of Object.entries(porBucket)) {
      const { error } = await supabase.storage.from(bucket).remove(caminhos);
      if (error) console.error('Erro ao remover arquivos:', error.message);
    }
    return res.status(200).json({ ok: true, removidos: arquivos.length });
  }

  // Resumo
  if (acao === 'resumo') {
    const { data: bilhetes } = await supabase
      .from('bilhetes')
      .select('numero, status, nome_comprador, email_comprador, instagram_comprador, telefone_comprador, pago_em');
    const { data: config } = await supabase.from('config').select('chave, valor');
    const { data: sorteio } = await supabase.from('sorteio').select('*').order('realizado_em', { ascending: false }).limit(1);
    // Pagamentos aprovados depois que a reserva venceu e o número foi revendido
    const { data: conflitos } = await supabase.from('rifa_conflitos').select('*').eq('resolvido', false).order('criado_em', { ascending: false });

    const configObj = {};
    config?.forEach(c => { configObj[c.chave] = c.valor; });

    const stats = {
      total: bilhetes?.length || 0,
      disponiveis: bilhetes?.filter(b => b.status === 'disponivel').length || 0,
      reservados: bilhetes?.filter(b => b.status === 'reservado').length || 0,
      pagos: bilhetes?.filter(b => b.status === 'pago').length || 0,
    };

    return res.status(200).json({
      bilhetes, config: configObj, stats, ultimo_sorteio: sorteio?.[0] || null, conflitos: conflitos || [],
      usuario: sessao.usuario, email_configurado: emailConfigurado()
    });
  }

  // Pedidos da loja (merch). Por privacidade o painel não recebe endereço completo,
  // CPF nem e-mail — só o necessário para acompanhar pagamento e envio.
  if (acao === 'pedidos-merch') {
    const { data: pedidos, error } = await supabase
      .from('pedidos_merch')
      .select('id, itens, valor_total, nome_comprador, telefone_comprador, status, criado_em, pago_em, cidade, uf, frete_servico, frete_transportadora, frete_valor, me_status, me_rastreio, me_link_etiqueta, me_erro')
      .order('criado_em', { ascending: false })
      .limit(300);

    if (error) return res.status(500).json({ erro: 'Erro ao buscar pedidos de merch' });
    return res.status(200).json({ pedidos: pedidos || [] });
  }

  // Gera (de novo) a etiqueta de um pedido pago — ex.: depois de recarregar a carteira do Melhor Envio
  if (acao === 'gerar-etiqueta') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { id } = req.body || {};
    const { data: pedido } = await supabase.from('pedidos_merch').select('*').eq('id', id).maybeSingle();
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (pedido.status !== 'pago') return res.status(400).json({ erro: 'Só é possível gerar etiqueta de pedidos pagos.' });
    if (pedido.me_status === 'gerada') return res.status(400).json({ erro: 'A etiqueta deste pedido já foi gerada.' });
    const resultado = await gerarEtiquetaESalvar(supabase, pedido);
    if (!resultado.ok) return res.status(400).json({ erro: resultado.erro || 'Não foi possível gerar a etiqueta' });
    return res.status(200).json({ ok: true, rastreio: resultado.rastreio, link_etiqueta: resultado.link_etiqueta });
  }

  // Busca de novo o código de rastreio de uma etiqueta já gerada
  if (acao === 'atualizar-rastreio') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { id } = req.body || {};
    const { data: pedido } = await supabase.from('pedidos_merch').select('*').eq('id', id).maybeSingle();
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    const r = await atualizarRastreio(supabase, pedido);
    if (r.erro) return res.status(400).json({ erro: r.erro });
    return res.status(200).json({ ok: true, rastreio: r.rastreio });
  }

  // Manda um e-mail de teste para EMAIL_BANDA e devolve o erro do Resend, se houver,
  // para a banda conferir a configuração sem precisar abrir os logs da Vercel.
  if (acao === 'email-teste') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const faltando = ['RESEND_API_KEY', 'EMAIL_REMETENTE', 'EMAIL_BANDA'].filter(v => !process.env[v]);
    if (faltando.length) return res.status(400).json({ erro: `Falta configurar na Vercel: ${faltando.join(', ')}` });
    const r = await enviarEmail({
      para: process.env.EMAIL_BANDA,
      assunto: 'Teste de e-mail do site Nexus',
      html: '<p>Se você recebeu este e-mail, os avisos de orçamento e de compras estão funcionando.</p>'
    });
    if (!r.ok) return res.status(502).json({ erro: `O Resend recusou o envio (${r.erro}). ${r.detalhe || ''}`.trim() });
    return res.status(200).json({ ok: true, para: process.env.EMAIL_BANDA });
  }

  // Orçamentos enviados pela página Contratantes
  if (acao === 'orcamentos') {
    const { data, error } = await supabase
      .from('orcamentos')
      .select('id, nome, email, telefone, data_evento, cidade, tipo_evento, mensagem, status, criado_em')
      .order('criado_em', { ascending: false })
      .limit(300);
    if (error) return res.status(200).json({ orcamentos: [], aviso: 'Tabela orcamentos não encontrada. Execute o bloco ATUALIZAÇÃO 2 do supabase_schema.sql.' });
    return res.status(200).json({ orcamentos: data || [] });
  }

  if (acao === 'orcamento-status') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { id, status } = req.body || {};
    if (!['novo', 'respondido', 'fechado', 'arquivado'].includes(status)) return res.status(400).json({ erro: 'Status inválido' });
    const { error } = await supabase.from('orcamentos').update({ status }).eq('id', id);
    if (error) return res.status(500).json({ erro: 'Erro ao atualizar orçamento' });
    return res.status(200).json({ ok: true });
  }

  if (acao === 'orcamento-excluir') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { error } = await supabase.from('orcamentos').delete().eq('id', (req.body || {}).id);
    if (error) return res.status(500).json({ erro: 'Erro ao excluir orçamento' });
    return res.status(200).json({ ok: true });
  }

  // Fãs cadastrados no rodapé do site (lista de avisos de shows)
  if (acao === 'fas') {
    const { data, error } = await supabase.from('fas').select('id, contato, tipo, origem, criado_em').order('criado_em', { ascending: false }).limit(5000);
    if (error) return res.status(200).json({ fas: [], aviso: 'Tabela fas não encontrada. Execute o bloco ATUALIZAÇÃO 3 do supabase_schema.sql.' });
    return res.status(200).json({ fas: data || [] });
  }

  if (acao === 'fa-excluir') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { error } = await supabase.from('fas').delete().eq('id', (req.body || {}).id);
    if (error) return res.status(500).json({ erro: 'Erro ao excluir' });
    return res.status(200).json({ ok: true });
  }

  // Liberar expirados (também acontece sozinho ao listar/reservar bilhetes)
  if (acao === 'liberar-expirados') {
    const liberados = await liberarExpirados(supabase);
    return res.status(200).json({ liberados });
  }

  // Cria ou remove números da rifa (só remove os que ninguém reservou nem pagou)
  if (acao === 'total-bilhetes') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const r = await ajustarTotalBilhetes(supabase, Number(req.body?.total));
    if (!r.ok) return res.status(400).json({ erro: r.erro });
    return res.status(200).json(r);
  }

  if (acao === 'rifa-conflito-resolver') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    const { error } = await supabase.from('rifa_conflitos').update({ resolvido: true }).eq('id', (req.body || {}).id);
    if (error) return res.status(500).json({ erro: 'Erro ao marcar como resolvido' });
    return res.status(200).json({ ok: true });
  }

  // Sortear
  if (acao === 'sortear') {
    if (req.method !== 'POST') return res.status(405).end();

    const { data: pagos } = await supabase
      .from('bilhetes')
      .select('numero, nome_comprador, email_comprador, instagram_comprador')
      .eq('status', 'pago');

    if (!pagos || pagos.length === 0)
      return res.status(400).json({ erro: 'Nenhum bilhete pago encontrado' });

    // Gerador criptográfico: sorteio imprevisível e justo
    const vencedor = pagos[crypto.randomInt(pagos.length)];

    await supabase.from('sorteio').insert({
      numero_sorteado: vencedor.numero,
      nome_vencedor: vencedor.nome_comprador,
      instagram_vencedor: vencedor.instagram_comprador || null
    });

    // Encerra as vendas e publica o resultado na página da rifa
    // (só o primeiro nome e o Instagram do vencedor)
    const resultado = {
      numero: vencedor.numero,
      nome: String(vencedor.nome_comprador || '').trim().split(/\s+/)[0] || null,
      instagram: vencedor.instagram_comprador || null,
      data: new Date().toISOString()
    };
    await supabase.from('config').upsert([
      { chave: 'rifa_ativa', valor: 'false' },
      { chave: 'rifa_resultado', valor: JSON.stringify(resultado) }
    ], { onConflict: 'chave' });

    const aviso = await enviarEmail({ para: vencedor.email_comprador, ...emailRifaVencedor({ nome: vencedor.nome_comprador, numero: vencedor.numero }) });

    return res.status(200).json({
      email_enviado: !!aviso.ok,
      numero_sorteado: vencedor.numero,
      nome_vencedor: vencedor.nome_comprador,
      instagram_vencedor: vencedor.instagram_comprador || null
    });
  }

  // Atualizar configuração. Body: { chave, valor } ou { itens: { chave: valor, ... } }
  if (acao === 'config' && req.method === 'POST') {
    const { chave, valor, itens } = req.body || {};
    const pares = itens && typeof itens === 'object' ? Object.entries(itens) : [[chave, valor]];
    if (!pares.length || pares.some(([c, v]) => !c || v === undefined || v === null)) return res.status(400).json({ erro: 'Dados inválidos' });
    const invalida = pares.find(([c]) => !CONFIG_PERMITIDA.test(c));
    if (invalida) return res.status(400).json({ erro: `Configuração desconhecida: ${invalida[0]}` });
    const linhas = pares.map(([c, v]) => ({ chave: c, valor: (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 20000) }));

    const { error } = await supabase.from('config').upsert(linhas, { onConflict: 'chave' });

    if (error) return res.status(500).json({ erro: 'Erro ao atualizar config' });
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ erro: 'Ação não encontrada' });
}
