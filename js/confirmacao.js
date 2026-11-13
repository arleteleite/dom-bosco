// Confirmação de uma compra: o estoque sobe, o preço entra no histórico e o piloto avisa se o preço variou muito.
// É a única parte do piloto que MUDA o estoque e o histórico. Por isso:
//   - só se confirma com a conferência concluída;
//   - as notas confirmadas ficam num registro à parte, que "Limpar tudo" não apaga (evita lançar duas vezes);
//   - dá para desfazer a confirmação (estoque e histórico voltam ao que eram).

import { RECEITAS, FORNECEDORES, ultimaCompra } from './dados.js';
import { agregarEntrada, resumir, insumoDe } from './revisao.js';

/** Limite de variação de preço (em %) a partir do qual o piloto avisa. A pessoa pode mudar na tela. */
export const config = { limitePercentual: 10 };

/** Notas e compras já confirmadas (no formato que as funções de duplicidade entendem). */
export const registroConfirmadas = [];

const arredondar = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
const DIA_EM_MS = 86_400_000;

/** Quantos dias atrás foi uma data "AAAA-MM-DD..." (0 se for hoje, futura ou ilegível). */
function diasAtrasDe(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto ?? '');
  if (!m) return 0;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje - alvo) / DIA_EM_MS));
}

/** De onde veio o preço, para o histórico: XML, PDF, foto, recibo ou sem comprovante. */
export function origemDoHistorico(r) {
  if (r.tipo === 'manual') return r.comprovante === 'recibo' ? 'recibo' : 'nenhum';
  return r.origem === 'pdf' ? 'pdf' : r.origem === 'foto' ? 'foto' : 'xml';
}

/** @returns {{ pode: boolean, motivo?: string }} */
export function podeConfirmar(r) {
  if (r.confirmacao) return { pode: false, motivo: 'Esta compra já foi confirmada.' };
  if (r.tipo === 'manual') return { pode: true };
  if (r.tipo !== 'mercadoria' || !r.revisao) return { pode: false, motivo: 'Este arquivo não é uma compra de mercadoria.' };

  const resumo = resumir(r);
  if (resumo.pendentes > 0) return { pode: false, motivo: `Falta decidir ${resumo.pendentes} ${resumo.pendentes === 1 ? 'item' : 'itens'}.` };
  if (resumo.contagem.ligado === 0) return { pode: false, motivo: 'Nenhum item está ligado a um insumo.' };
  const semQuantidade = r.revisao.itens.some((l) => l.status === 'ligado' && !(l.qtdUso > 0));
  if (semQuantidade) return { pode: false, motivo: 'Há item ligado sem quantidade para o estoque.' };
  return { pode: true };
}

const precoPorUso = (precoEmbalagem, insumo) => precoEmbalagem / insumo.compra.qtdUso;

/** Custo dos ingredientes de uma receita, com os preços mais recentes de cada insumo. */
function custoDaReceita(receita) {
  return receita.ingredientes.reduce((soma, ing) => {
    const insumo = insumoDe(ing.insumoId);
    return soma + ing.qtd * precoPorUso(ultimaCompra(insumo).preco, insumo);
  }, 0);
}

/** Receitas que usam o insumo e quanto o custo dos ingredientes mudou só por causa dele. */
function receitasAfetadas(insumoId, precoAnterior, precoNovo) {
  const insumo = insumoDe(insumoId);
  return RECEITAS.filter((rc) => rc.ingredientes.some((i) => i.insumoId === insumoId)).map((rc) => {
    const ing = rc.ingredientes.find((i) => i.insumoId === insumoId);
    const delta = ing.qtd * (precoPorUso(precoNovo, insumo) - precoPorUso(precoAnterior, insumo));
    const custoDepois = custoDaReceita(rc);
    const custoAntes = custoDepois - delta;
    return {
      id: rc.id, nome: rc.nome, area: rc.area, precoVenda: rc.precoPraticado,
      custoAntes, custoDepois, delta,
      sobraAntes: rc.precoPraticado - custoAntes, sobraDepois: rc.precoPraticado - custoDepois,
    };
  });
}

/**
 * Confirma a compra: soma ao estoque, registra o preço no histórico de cada insumo e guarda o que mudou.
 * @returns a confirmação, também guardada em `r.confirmacao`
 */
export function confirmarCompra(r, agora = new Date()) {
  const { pode, motivo } = podeConfirmar(r);
  if (!pode) throw new Error(motivo);

  const dias = diasAtrasDe(r.tipo === 'manual' ? r.data : r.emissao);
  const origem = origemDoHistorico(r);
  const fornecedor = r.tipo === 'manual'
    ? { id: r.fornecedorId, nome: FORNECEDORES.find((f) => f.id === r.fornecedorId)?.nome ?? r.emitente.nome }
    : { id: null, nome: r.emitente?.nome ?? '(fornecedor não identificado)' };

  const mudancas = [];
  for (const g of agregarEntrada(r)) {
    const insumo = insumoDe(g.insumoId);
    const embalagens = g.qtdUso / insumo.compra.qtdUso;
    const preco = arredondar(g.valor / embalagens); // por embalagem de compra (ex.: R$ por Kg, por saco)

    const saldoAntes = insumo.estoque.saldo;
    const ultimaEntradaAnterior = insumo.estoque.ultimaEntrada;
    insumo.estoque.saldo = arredondar(saldoAntes + g.qtdUso, 3);
    insumo.estoque.ultimaEntrada = { qtdUso: g.qtdUso, quando: agora };

    // O histórico fica do mais antigo para o mais novo. Compra de data antiga entra no lugar certo.
    const entrada = { diasAtras: dias, preco, fornecedorId: fornecedor.id, fornecedorNome: fornecedor.nome, origem, compraId: r.id };
    const h = insumo.historico;
    let posicao = h.findIndex((e) => e.diasAtras < dias);
    if (posicao < 0) posicao = h.length;
    h.splice(posicao, 0, entrada);

    const anterior = posicao > 0 ? h[posicao - 1] : null;
    mudancas.push({
      insumoId: g.insumoId, qtdUso: g.qtdUso, valor: g.valor, linhas: g.linhas,
      saldoAntes, saldoDepois: insumo.estoque.saldo,
      preco, precoAnterior: anterior?.preco ?? null,
      variacao: anterior ? (preco - anterior.preco) / anterior.preco : null,
      ehPrecoAtual: posicao === h.length - 1, // false = compra antiga, que não muda o preço de hoje
      entrada, ultimaEntradaAnterior, receitas: [],
    });
  }

  // As receitas só são calculadas depois que todos os preços da compra entraram.
  for (const m of mudancas) {
    if (m.precoAnterior !== null && m.ehPrecoAtual) m.receitas = receitasAfetadas(m.insumoId, m.precoAnterior, m.preco);
  }

  r.confirmacao = { quando: agora, dias, origem, mudancas };

  registroConfirmadas.push(
    r.tipo === 'manual'
      ? { ...r, id: `conf-${r.id}`, origemId: r.id, confirmadaEm: agora }
      : {
        id: `conf-${r.id}`, origemId: r.id, tipo: 'mercadoria', confirmadaEm: agora,
        hash: r.hash, chave: r.chave, numero: r.numero, serie: r.serie, emitente: r.emitente, arquivo: r.arquivo,
      },
  );
  return r.confirmacao;
}

/** Desfaz a confirmação: tira a entrada do estoque e o preço do histórico, e libera a nota no registro. */
export function desfazerConfirmacao(r) {
  if (!r.confirmacao) return;
  for (const m of r.confirmacao.mudancas) {
    const insumo = insumoDe(m.insumoId);
    insumo.estoque.saldo = Math.max(0, arredondar(insumo.estoque.saldo - m.qtdUso, 3));
    if (m.ultimaEntradaAnterior) insumo.estoque.ultimaEntrada = m.ultimaEntradaAnterior;
    else delete insumo.estoque.ultimaEntrada;
    const i = insumo.historico.indexOf(m.entrada);
    if (i >= 0) insumo.historico.splice(i, 1);
  }
  for (let i = registroConfirmadas.length - 1; i >= 0; i--) {
    if (registroConfirmadas[i].origemId === r.id) registroConfirmadas.splice(i, 1);
  }
  delete r.confirmacao;
}

/** Insumos desta compra cujo preço variou no mínimo `limite` por cento (para cima ou para baixo). */
export function alertasDaConfirmacao(r, limite = config.limitePercentual) {
  if (!r.confirmacao) return [];
  return r.confirmacao.mudancas.filter((m) => m.variacao !== null && Math.abs(m.variacao * 100) >= limite);
}
