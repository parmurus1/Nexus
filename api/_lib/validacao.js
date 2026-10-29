// api/_lib/validacao.js — conferência de e-mail e telefone (mesmas regras do formulário).

// E-mail com usuário, domínio e terminação de 2+ letras, sem espaços nem pontos repetidos.
export function emailValido(email) {
  const e = String(email || '').trim();
  return e.length <= 160
    && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e)
    && !/\.\./.test(e) && !/^\./.test(e) && !/\.@/.test(e);
}

// Telefone brasileiro com DDD. Devolve só os dígitos (sem o 55) ou '' se for inválido.
// Celular: DDD + 9 + 8 dígitos. Fixo: DDD + 2 a 5 + 7 dígitos.
export function telefoneNormalizado(tel) {
  const d = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (!/^[1-9][1-9]/.test(d)) return '';
  if (d.length === 11 && d[2] === '9') return /^(\d)\1+$/.test(d.slice(3)) ? '' : d;
  if (d.length === 10 && /[2-5]/.test(d[2])) return d;
  return '';
}

// (11) 94247-7432 / (11) 3456-7890
export function telefoneFormatado(d) {
  return d ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : '';
}
