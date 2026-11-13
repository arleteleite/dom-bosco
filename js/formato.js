// Formatação de números, moeda e datas no padrão brasileiro.

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

const numeroLongo = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

const dataCompleta = new Intl.DateTimeFormat('pt-BR');
const horaCurta = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Data de "N dias atrás" no formato dd/mm/aaaa. */
export function dataDeDias(diasAtras) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return dataCompleta.format(d);
}

export const fmtHora = (data) => horaCurta.format(data);

export const fmtMoeda = (v) => moeda.format(v);
/** Quantidade como vem na nota (até 4 casas, ex.: 0,282). */
export const fmtNumero = (v) => numeroLongo.format(v);
export const fmtPercentual = (fracao) => percentual.format(fracao);

/** Mostra a quantidade na unidade mais legível (g → kg, ml → L). */
export function fmtQtd(valor, uso) {
  if (uso === 'g') return valor >= 1000 ? `${numero.format(valor / 1000)} kg` : `${numero.format(valor)} g`;
  if (uso === 'ml') return valor >= 1000 ? `${numero.format(valor / 1000)} L` : `${numero.format(valor)} ml`;
  return `${numero.format(valor)} un`;
}

export function dataRelativa(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return dataCurta.format(d);
}

export const fmtValidade = (diasAteVencer) => {
  if (diasAteVencer === null) return 'sem validade';
  if (diasAteVencer <= 0) return 'vence hoje';
  if (diasAteVencer === 1) return 'vence amanhã';
  return `vence em ${diasAteVencer} dias`;
};

/** Evita que texto vire HTML. */
export const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
