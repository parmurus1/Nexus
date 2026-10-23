// api/_lib/rifa.js — regras compartilhadas da rifa.

// Reserva dura 30 min. O link de pagamento do Mercado Pago expira antes (25 min),
// assim ninguém consegue pagar por um número que já voltou a ficar disponível.
export const RESERVA_MINUTOS = 30;
export const PAGAMENTO_EXPIRA_MINUTOS = 25;
export const MAX_BILHETES_POR_COMPRA = 50;

export const LIMPAR_COMPRADOR = {
  nome_comprador: null,
  email_comprador: null,
  instagram_comprador: null,
  telefone_comprador: null,
  preference_id: null,
  reservado_em: null
};

// Devolve para "disponível" os bilhetes reservados há mais de 30 min sem pagamento.
// Chamado automaticamente antes de listar/reservar bilhetes, então não depende
// mais de alguém clicar no botão do admin.
export async function liberarExpirados(supabase) {
  const limite = new Date(Date.now() - RESERVA_MINUTOS * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bilhetes')
    .update({ status: 'disponivel', ...LIMPAR_COMPRADOR })
    .eq('status', 'reservado')
    .lt('reservado_em', limite)
    .select('numero');
  if (error) {
    console.error('Erro ao liberar bilhetes expirados:', error.message);
    return [];
  }
  return (data || []).map(b => b.numero);
}

// Valida a lista de números enviada pelo navegador.
export function normalizarNumeros(numeros) {
  if (!Array.isArray(numeros)) return null;
  const lista = [...new Set(numeros.map(n => Number(n)))];
  if (!lista.length || lista.length > MAX_BILHETES_POR_COMPRA) return null;
  if (lista.some(n => !Number.isInteger(n) || n < 1 || n > 100000)) return null;
  return lista.sort((a, b) => a - b);
}
