// api/_lib/auth.js — login do painel admin com sessão assinada.
//
// Antes o "token" salvo no navegador era a própria senha. Agora o login gera
// um token assinado (HMAC-SHA256) que expira em 12h e não contém a senha.
// Trocar a senha (ou ADMIN_SESSION_SECRET) invalida todas as sessões.
//
// Variáveis de ambiente:
//   ADMIN_PASSWORD        -> senha única do painel (modo simples, como antes)
//   ADMIN_USERS           -> opcional, uma senha por pessoa: "davi:senha1,joao:senha2"
//                            (quando definida, o login pede usuário + senha)
//   ADMIN_SESSION_SECRET  -> opcional, segredo para assinar as sessões
//                            (se ausente, é derivado das senhas acima)
import crypto from 'node:crypto';

const DURACAO_MS = 12 * 60 * 60 * 1000;
export const MAX_TENTATIVAS = 5;          // tentativas erradas...
export const JANELA_TENTATIVAS_MIN = 15;  // ...por IP nesta janela

export function usuariosAdmin() {
  const lista = String(process.env.ADMIN_USERS || '')
    .split(',')
    .map(par => par.trim())
    .filter(Boolean)
    .map(par => {
      const i = par.indexOf(':');
      return i > 0 ? { usuario: par.slice(0, i).trim().toLowerCase(), senha: par.slice(i + 1) } : null;
    })
    .filter(u => u && u.usuario && u.senha);
  if (lista.length) return lista;
  return process.env.ADMIN_PASSWORD ? [{ usuario: 'admin', senha: process.env.ADMIN_PASSWORD }] : [];
}

export const multiusuario = () => !!String(process.env.ADMIN_USERS || '').trim();

function segredo() {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  // Derivado das senhas: mudar qualquer senha derruba as sessões antigas.
  return crypto.createHash('sha256').update('nexus-sessao|' + usuariosAdmin().map(u => u.usuario + ':' + u.senha).join('|')).digest('hex');
}

function iguais(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const assinar = dados => b64url(crypto.createHmac('sha256', segredo()).update(dados).digest());

// Retorna o nome do usuário se a senha conferir, senão null.
export function verificarCredenciais(usuario, senha) {
  if (!senha) return null;
  const usuarios = usuariosAdmin();
  const nome = String(usuario || '').trim().toLowerCase();
  let encontrado = null;
  for (const u of usuarios) {
    // Modo senha única: ignora o usuário digitado
    const usuarioConfere = !multiusuario() || iguais(u.usuario, nome);
    if (usuarioConfere && iguais(u.senha, senha)) encontrado = u.usuario;
  }
  return encontrado;
}

export function criarSessao(usuario) {
  const payload = b64url(JSON.stringify({ u: usuario, exp: Date.now() + DURACAO_MS }));
  return { token: `${payload}.${assinar(payload)}`, expira_em: Date.now() + DURACAO_MS };
}

// Lê o "Authorization: Bearer <token>" e devolve { usuario } ou null.
export function autenticar(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const [payload, assinatura] = token.split('.');
  if (!payload || !assinatura || !usuariosAdmin().length) return null;
  if (!iguais(assinatura, assinar(payload))) return null;
  try {
    const dados = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!dados.exp || Date.now() > dados.exp) return null;
    return { usuario: dados.u };
  } catch {
    return null;
  }
}

export function ipDaRequisicao(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim().slice(0, 64) || 'desconhecido';
}
