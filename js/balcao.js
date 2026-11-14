// Balcão e vendas (etapa 12): simulação do fluxo "atendente monta o pedido → senha → caixa chama e recebe → venda registrada".
// Módulo sem DOM (dá para testar no Node). Tudo fica só na memória do navegador, como o resto do piloto.
//
// HIPÓTESES [P] mostradas à proprietária, não decisões:
//   - o atendente monta o pedido com os preços do cadastro e o caixa recebe na ordem de chegada (RF-017);
//   - a venda só é registrada quando o caixa recebe (RF-013);
//   - no cartão, o acréscimo é aplicado no fechamento: preço à vista ÷ (1 − taxa) (RN-001);
//   - se a internet cair, o balcão continua e o registro é enviado depois (RNF-002).
// O relatório inclui, por padrão, um dia de vendas INVENTADAS, só para o relatório ter o que mostrar.

import { PRODUTOS, precoNoCartao } from './produtos.js';

export const FORMAS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
};

export const balcao = {
  proximoNumero: 1,
  rascunho: { itens: [], obs: '' }, // pedido que o atendente está montando
  pedidos: [], // enviados ao caixa (aguardando, pagos ou cancelados)
  taxas: { debito: null, credito: null }, // % da maquininha; ela informa (pendência 5)
  offline: false,
  incluirExemplo: true,
};

const arredondar = (v) => Math.round(v * 100) / 100;

/** Produtos que dá para vender: não são preparos e têm preço de venda. */
export const catalogo = () => PRODUTOS.filter((p) => p.tipo !== 'preparo' && Number(p.preco) > 0)
  .sort((a, b) => a.area.localeCompare(b.area) || a.nome.localeCompare(b.nome, 'pt-BR'));

export const totalDosItens = (itens) => arredondar(itens.reduce((s, i) => s + i.qtd * i.preco, 0));
export const quantidadeDeItens = (itens) => itens.reduce((s, i) => s + i.qtd, 0);

// ---- Atendente --------------------------------------------------------------------------------

/** Soma (ou tira) uma unidade do pedido que está sendo montado. */
export function mudarItem(produtoId, delta) {
  const itens = balcao.rascunho.itens;
  const existente = itens.find((i) => i.produtoId === produtoId);
  if (existente) {
    existente.qtd += delta;
    if (existente.qtd <= 0) itens.splice(itens.indexOf(existente), 1);
    return;
  }
  const p = catalogo().find((x) => x.id === produtoId);
  if (p && delta > 0) itens.push({ produtoId, nome: p.nome, area: p.area, qtd: delta, preco: Number(p.preco) });
}

export function limparRascunho() { balcao.rascunho = { itens: [], obs: '' }; }

/** Envia o pedido ao caixa e devolve o pedido, já com o número (a senha do cliente). */
export function enviarParaCaixa(agora = new Date()) {
  const { itens, obs } = balcao.rascunho;
  if (itens.length === 0) throw new Error('Escolha pelo menos um item.');
  const pedido = {
    numero: balcao.proximoNumero++, itens: structuredClone(itens), obs: String(obs).trim(),
    criadoEm: agora, status: 'aguardando', chamadoEm: null, pagamento: null,
  };
  balcao.pedidos.push(pedido);
  limparRascunho();
  return pedido;
}

// ---- Caixa ------------------------------------------------------------------------------------

export const filaDoCaixa = () => balcao.pedidos.filter((p) => p.status === 'aguardando').sort((a, b) => a.numero - b.numero);

export function chamar(pedido, agora = new Date()) { pedido.chamadoEm = pedido.chamadoEm ?? agora; }

/**
 * Valor a cobrar em cada forma de pagamento. O preço-base é o à vista; só o cartão leva acréscimo (RN-001).
 * @returns {{ base: number, acrescimo: number, total: number, troco: number|null, erro?: string }}
 */
export function calcularPagamento(pedido, forma, recebido = null) {
  const base = totalDosItens(pedido.itens);
  if (forma === 'debito' || forma === 'credito') {
    const taxa = balcao.taxas[forma];
    if (taxa === null || taxa === undefined) return { base, acrescimo: 0, total: base, troco: null, erro: `Informe a taxa do ${forma === 'debito' ? 'débito' : 'crédito'} para calcular o acréscimo.` };
    const total = arredondar(precoNoCartao(base, taxa));
    return { base, acrescimo: arredondar(total - base), total, troco: null };
  }
  if (forma === 'dinheiro') {
    if (recebido === null || recebido === '') return { base, acrescimo: 0, total: base, troco: null };
    if (!(Number(recebido) >= base)) return { base, acrescimo: 0, total: base, troco: null, erro: 'O valor recebido é menor que o total.' };
    return { base, acrescimo: 0, total: base, troco: arredondar(Number(recebido) - base) };
  }
  return { base, acrescimo: 0, total: base, troco: null };
}

/** Recebe o pagamento e registra a venda. Se a internet estiver "fora", a venda fica marcada como pendente de envio. */
export function pagar(pedido, forma, recebido = null, agora = new Date()) {
  if (pedido.status !== 'aguardando') throw new Error('Este pedido já foi fechado.');
  const c = calcularPagamento(pedido, forma, recebido);
  if (c.erro) throw new Error(c.erro);
  pedido.status = 'pago';
  pedido.pagoEm = agora;
  pedido.pagamento = { forma, base: c.base, acrescimo: c.acrescimo, total: c.total, troco: c.troco, pendenteEnvio: balcao.offline };
  return pedido;
}

export function cancelar(pedido) {
  if (pedido.status !== 'aguardando') throw new Error('Só dá para cancelar um pedido que ainda não foi pago.');
  pedido.status = 'cancelado';
}

// ---- Sem internet (RNF-002) -----------------------------------------------------------------------

export const pendentesDeEnvio = () => balcao.pedidos.filter((p) => p.status === 'pago' && p.pagamento?.pendenteEnvio);

/** A internet voltou: as vendas feitas sem conexão são enviadas. Devolve quantas eram. */
export function reenviarPendentes() {
  const lista = pendentesDeEnvio();
  lista.forEach((p) => { p.pagamento.pendenteEnvio = false; });
  return lista.length;
}

// ---- Vendas de exemplo (inventadas) --------------------------------------------------------------

// Peso de cada hora do dia (6h às 21h): picos de manhã, almoço e fim de tarde.
const PESO_HORA = { 6: 6, 7: 14, 8: 12, 9: 7, 10: 5, 11: 8, 12: 13, 13: 9, 14: 4, 15: 5, 16: 8, 17: 14, 18: 15, 19: 12, 20: 7, 21: 3 };

/** Gerador pseudoaleatório com semente fixa: o dia de exemplo é sempre o mesmo. */
function sorteador(semente) {
  let s = semente >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function gerarVendasDeExemplo(hoje = new Date(), quantidade = 110) {
  const itens = catalogo();
  if (itens.length === 0) return [];
  const sorte = sorteador(2026);
  const horas = Object.entries(PESO_HORA).flatMap(([h, peso]) => Array(peso).fill(Number(h)));
  // Pizza vende mais à noite, pão e bolo de manhã e à tarde.
  const escolher = (hora) => {
    const pesos = itens.map((p) => (p.area === 'pizzaria' ? (hora >= 17 ? 5 : 0.5) : (hora < 12 ? 5 : 2)));
    let alvo = sorte() * pesos.reduce((a, b) => a + b, 0);
    for (let i = 0; i < itens.length; i += 1) { alvo -= pesos[i]; if (alvo <= 0) return itens[i]; }
    return itens[itens.length - 1];
  };
  const formas = ['dinheiro', 'pix', 'pix', 'debito', 'credito'];
  return Array.from({ length: quantidade }, (_, k) => {
    const hora = horas[Math.floor(sorte() * horas.length)];
    const linhas = new Map();
    for (let n = 1 + Math.floor(sorte() * 3); n > 0; n -= 1) {
      const p = escolher(hora);
      const qtd = p.area === 'pizzaria' ? 1 : 1 + Math.floor(sorte() * 4);
      linhas.set(p.id, { produtoId: p.id, nome: p.nome, area: p.area, preco: Number(p.preco), qtd: (linhas.get(p.id)?.qtd ?? 0) + qtd });
    }
    const lista = [...linhas.values()];
    const base = totalDosItens(lista);
    const pagoEm = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), hora, Math.floor(sorte() * 60));
    return { numero: `ex${k + 1}`, exemplo: true, status: 'pago', itens: lista, pagoEm, pagamento: { forma: formas[Math.floor(sorte() * formas.length)], base, acrescimo: 0, total: base, troco: null, pendenteEnvio: false } };
  });
}

// ---- Relatório de vendas (RF-018) ---------------------------------------------------------------

export function vendasParaRelatorio() {
  const reais = balcao.pedidos.filter((p) => p.status === 'pago');
  return balcao.incluirExemplo ? [...gerarVendasDeExemplo(), ...reais] : reais;
}

/** Vendas por produto, por faixa de horário e por forma de pagamento. */
export function relatorio(vendas) {
  const porProduto = new Map();
  const porHora = new Map();
  const porForma = new Map();
  let total = 0;
  for (const v of vendas) {
    total += v.pagamento.total;
    const hora = v.pagoEm.getHours();
    const h = porHora.get(hora) ?? { hora, pedidos: 0, valor: 0 };
    h.pedidos += 1; h.valor += v.pagamento.total;
    porHora.set(hora, h);
    const f = porForma.get(v.pagamento.forma) ?? { forma: v.pagamento.forma, pedidos: 0, valor: 0 };
    f.pedidos += 1; f.valor += v.pagamento.total;
    porForma.set(v.pagamento.forma, f);
    for (const i of v.itens) {
      const p = porProduto.get(i.produtoId) ?? { produtoId: i.produtoId, nome: i.nome, area: i.area, qtd: 0, valor: 0 };
      p.qtd += i.qtd; p.valor += i.qtd * i.preco;
      porProduto.set(i.produtoId, p);
    }
  }
  return {
    pedidos: vendas.length, total: arredondar(total), ticketMedio: vendas.length ? arredondar(total / vendas.length) : 0,
    porProduto: [...porProduto.values()].sort((a, b) => b.valor - a.valor),
    porHora: [...porHora.values()].sort((a, b) => a.hora - b.hora),
    porForma: [...porForma.values()].sort((a, b) => b.valor - a.valor),
  };
}

/** Junta as horas em faixas (ex.: 3 em 3 horas) para o gráfico. */
export function faixasDeHorario(porHora, passo = 1, inicio = 6, fim = 22) {
  const faixas = [];
  for (let h = inicio; h < fim; h += passo) {
    const dentro = porHora.filter((x) => x.hora >= h && x.hora < h + passo);
    faixas.push({ de: h, ate: h + passo, pedidos: dentro.reduce((s, x) => s + x.pedidos, 0), valor: dentro.reduce((s, x) => s + x.valor, 0) });
  }
  return faixas;
}

/** Só para testes. */
export function _reiniciar() {
  Object.assign(balcao, { proximoNumero: 1, rascunho: { itens: [], obs: '' }, pedidos: [], taxas: { debito: null, credito: null }, offline: false, incluirExemplo: true });
}
