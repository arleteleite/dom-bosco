// Painel da gestora (etapa 16): junta o que os outros módulos já sabem para responder "o que eu preciso olhar hoje?".
// Módulo sem DOM: dá para testar no Node. Nada aqui grava dados; tudo é cálculo sobre o que já existe no piloto.
//
// O QUE É HIPÓTESE [P]: quais blocos importam, em que ordem e com que limites (margem baixa, variação de preço, tolerância).
// A pergunta que decide o painel final é da proprietária: "quando você abre o computador de manhã, o que quer saber primeiro?"

import { INSUMOS, variacaoUltima, ultimaCompra } from './dados.js';
import { PRODUTOS, buscarProduto, custoUnitario, indicadores, precoPorUso, produtosAfetados } from './produtos.js';
import { vendasParaRelatorio, relatorio } from './balcao.js';
import { totaisPorLoja, config as configGastos, gastosPorUnidade, METODOS } from './gastos.js';
import { consumoDeInsumos, conciliar } from './producao.js';
import { aguardando, resumoDoDia, iso, somarDias, insumosDosProximosDias } from './encomendas.js';
import { config as configAlerta } from './confirmacao.js';

/** Limites do painel (a proprietária ajusta na tela). */
export const limites = { margemBaixaPct: 10 };

const arredondar = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

// ---- Números do dia, por área ---------------------------------------------------------------------------------

/**
 * Vendas, custo dos ingredientes e margens do dia (vendas do Balcão), por área.
 * Margem de contribuição aqui = venda − custo dos ingredientes (impostos de cada produto descontados). Gastos gerais à parte.
 */
export function numerosDoDia() {
  const vendas = vendasParaRelatorio();
  const r = relatorio(vendas);
  const areas = { padaria: novaArea(), pizzaria: novaArea() };
  for (const p of r.porProduto) {
    const produto = buscarProduto(p.produtoId);
    if (!produto) continue;
    const a = areas[produto.area];
    const custo = custoUnitario(produto).total;
    const imposto = (Number(produto.impostosPct) || 0) / 100;
    a.vendas += p.valor;
    a.itens += p.qtd;
    a.custo += custo * p.qtd;
    a.impostos += p.valor * imposto;
    a.gastosGerais += gastosPorUnidade(produto) * p.qtd;
  }
  for (const a of Object.values(areas)) {
    a.contribuicao = a.vendas - a.custo - a.impostos;
    a.lucro = a.contribuicao - a.gastosGerais;
    a.contribuicaoPct = a.vendas > 0 ? a.contribuicao / a.vendas : null;
    a.lucroPct = a.vendas > 0 ? a.lucro / a.vendas : null;
  }
  const pool = totaisPorLoja();
  const dias = configGastos.diasPorMes || 26;
  for (const area of ['padaria', 'pizzaria']) {
    const a = areas[area];
    a.gastosMes = pool[area];
    a.gastosPorDia = pool[area] / dias;
    // Quanto de margem de contribuição por dia a loja precisa para pagar os gastos gerais, e quanto de venda isso pede.
    a.vendaParaEquilibrio = a.contribuicaoPct && a.contribuicaoPct > 0 ? a.gastosPorDia / a.contribuicaoPct : null;
    a.cobreOsGastos = a.contribuicao >= a.gastosPorDia;
  }
  const soma = (k) => areas.padaria[k] + areas.pizzaria[k];
  return {
    pedidos: r.pedidos, vendas: arredondar(r.total), ticketMedio: r.ticketMedio, areas,
    totais: { vendas: soma('vendas'), custo: soma('custo'), contribuicao: soma('contribuicao'), gastosPorDia: soma('gastosPorDia') },
    porProduto: r.porProduto, dias, metodo: configGastos.metodo,
  };
}

const novaArea = () => ({ vendas: 0, itens: 0, custo: 0, impostos: 0, gastosGerais: 0 });

// ---- Ranking de consumo ---------------------------------------------------------------------------------------------

/**
 * Insumos que mais pesam, estimados pelo que foi vendido × a ficha técnica de cada produto, valorizados ao último preço pago.
 * `periodo`: "dia" (as vendas de hoje) ou "mes" (o dia × os dias de funcionamento: uma estimativa grosseira).
 * `escopo`: "todas", "padaria" ou "pizzaria".
 */
export function rankingDeConsumo({ escopo = 'todas', periodo = 'dia', limite = 10 } = {}) {
  const fator = periodo === 'mes' ? (configGastos.diasPorMes || 26) : 1;
  const mapa = new Map();
  for (const p of relatorio(vendasParaRelatorio()).porProduto) {
    const produto = buscarProduto(p.produtoId);
    if (!produto || (escopo !== 'todas' && produto.area !== escopo)) continue;
    for (const [insumoId, q] of consumoDeInsumos(produto, p.qtd * fator)) {
      const m = mapa.get(insumoId) ?? { insumoId, qtd: 0, padaria: 0, pizzaria: 0 };
      m.qtd += q; m[produto.area] += q;
      mapa.set(insumoId, m);
    }
  }
  const lista = [...mapa.values()].map((m) => {
    const insumo = INSUMOS.find((i) => i.id === m.insumoId);
    const pu = insumo ? precoPorUso(insumo) : null;
    return { ...m, insumo, valor: pu === null ? 0 : m.qtd * pu, semPreco: pu === null, valorPadaria: (pu ?? 0) * m.padaria, valorPizzaria: (pu ?? 0) * m.pizzaria };
  }).filter((m) => m.insumo).sort((a, b) => b.valor - a.valor);
  const total = lista.reduce((s, m) => s + m.valor, 0);
  return { itens: lista.slice(0, limite).map((m) => ({ ...m, parte: total > 0 ? m.valor / total : 0 })), total, quantos: lista.length, fator };
}

// ---- Preço dos insumos ----------------------------------------------------------------------------------------------

/** Insumos cujo último preço mais variou sobre o anterior (para cima ou para baixo), com os produtos afetados. */
export function maioresVariacoes(n = 5) {
  return INSUMOS.filter((i) => i.ativo !== false && i.historico.length >= 2).map((i) => {
    const v = variacaoUltima(i);
    const anterior = i.historico[i.historico.length - 2].preco;
    return { insumo: i, variacao: v, de: anterior, para: ultimaCompra(i).preco, passouDoLimite: Math.abs(v * 100) >= configAlerta.limitePercentual, afetados: produtosAfetados(i.id, anterior).length };
  }).filter((x) => x.variacao !== 0).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao)).slice(0, n);
}

// ---- Produtos com margem baixa ----------------------------------------------------------------------------------------

/** Produtos à venda cuja margem de lucro (com o método de rateio escolhido) está abaixo do limite, ou negativa. */
export function produtosComMargemBaixa() {
  return PRODUTOS.filter((p) => p.tipo !== 'preparo' && Number(p.preco) > 0).map((p) => {
    const c = custoUnitario(p);
    const ind = indicadores(p, c.total, gastosPorUnidade(p));
    return { produto: p, margemPct: ind.lucroPct, contribuicaoPct: ind.contribuicaoPct, incompleto: c.incompleto, preco: ind.preco };
  }).filter((x) => x.margemPct * 100 < limites.margemBaixaPct).sort((a, b) => a.margemPct - b.margemPct);
}

// ---- Estoque ---------------------------------------------------------------------------------------------------------

export function situacaoDoEstoque() {
  const ativos = INSUMOS.filter((i) => i.ativo !== false);
  return {
    abaixoDoMinimo: ativos.filter((i) => i.estoque.minimo > 0 && i.estoque.saldo < i.estoque.minimo),
    vencemEmBreve: ativos.filter((i) => i.estoque.validadeEmDias !== null && i.estoque.validadeEmDias <= 7),
  };
}

// ---- Encomendas -------------------------------------------------------------------------------------------------------

/** Os próximos `n` dias a partir de hoje: quantas encomendas cada um tem. */
export function proximosDias(n = 7, hoje = new Date()) {
  const t0 = iso(hoje);
  return Array.from({ length: n }, (_, k) => resumoDoDia(somarDias(t0, k)));
}

// ---- O que pede atenção hoje ------------------------------------------------------------------------------------------

/**
 * Lista de avisos, do mais urgente ao menos. Cada um: { nivel: 'alerta' | 'aviso' | 'ok', titulo, detalhe, rota }.
 * `comprasPendentes` vem da tela de Compras (o painel não conhece a lista de notas).
 */
export function atencaoDeHoje({ comprasPendentes = 0, hoje = new Date() } = {}) {
  const itens = [];
  const espera = aguardando().length;
  if (espera) itens.push({ nivel: 'alerta', titulo: `${espera} ${espera === 1 ? 'encomenda espera' : 'encomendas esperam'} a sua resposta`, detalhe: 'Confirme quando o sinal chegar ou recuse.', rota: '#/encomendas' });

  const dias = proximosDias(2, hoje);
  const hojeEnc = dias[0].total; const amanha = dias[1].total;
  if (hojeEnc || amanha) itens.push({ nivel: 'aviso', titulo: `Encomendas: ${hojeEnc} para hoje, ${amanha} para amanhã`, detalhe: 'Veja a ordem de produção e os insumos de cada dia.', rota: '#/encomendas' });

  const faltaEnc = insumosDosProximosDias(7, hoje).filter((i) => i.falta > 0.0005);
  if (faltaEnc.length) itens.push({ nivel: 'alerta', titulo: `Vai faltar insumo para as encomendas dos próximos 7 dias (${faltaEnc.length})`, detalhe: `${faltaEnc.slice(0, 4).map((i) => i.nome).join(', ')}${faltaEnc.length > 4 ? '…' : ''}. Compre antes.`, rota: '#/encomendas' });

  const est = situacaoDoEstoque();
  if (est.abaixoDoMinimo.length) itens.push({ nivel: 'alerta', titulo: `${est.abaixoDoMinimo.length} ${est.abaixoDoMinimo.length === 1 ? 'insumo abaixo' : 'insumos abaixo'} do estoque mínimo`, detalhe: est.abaixoDoMinimo.slice(0, 4).map((i) => i.nome).join(', ') + (est.abaixoDoMinimo.length > 4 ? '…' : ''), rota: '#/estoque' });
  if (est.vencemEmBreve.length) itens.push({ nivel: 'aviso', titulo: `${est.vencemEmBreve.length} ${est.vencemEmBreve.length === 1 ? 'insumo vence' : 'insumos vencem'} em breve`, detalhe: est.vencemEmBreve.slice(0, 4).map((i) => i.nome).join(', ') + (est.vencemEmBreve.length > 4 ? '…' : ''), rota: '#/estoque' });

  if (comprasPendentes) itens.push({ nivel: 'aviso', titulo: `${comprasPendentes} ${comprasPendentes === 1 ? 'compra aguarda' : 'compras aguardam'} confirmação`, detalhe: 'O estoque só muda depois de confirmar.', rota: '#/compras' });

  const variacoes = maioresVariacoes(8).filter((v) => v.passouDoLimite);
  if (variacoes.length) itens.push({ nivel: 'aviso', titulo: `${variacoes.length} ${variacoes.length === 1 ? 'insumo variou' : 'insumos variaram'} ${configAlerta.limitePercentual}% ou mais no preço`, detalhe: variacoes.slice(0, 3).map((v) => `${v.insumo.nome} ${v.variacao > 0 ? '+' : ''}${Math.round(v.variacao * 100)}%`).join(', '), rota: '#/compras' });

  const baixas = produtosComMargemBaixa();
  if (baixas.length) itens.push({ nivel: 'alerta', titulo: `${baixas.length} ${baixas.length === 1 ? 'produto com margem de lucro' : 'produtos com margem de lucro'} abaixo de ${limites.margemBaixaPct}%`, detalhe: baixas.slice(0, 3).map((b) => `${b.produto.nome} (${Math.round(b.margemPct * 100)}%)`).join(', '), rota: '#/precificacao' });

  const dif = conciliar().filter((c) => c.alerta);
  if (dif.length) itens.push({ nivel: 'alerta', titulo: `${dif.length} ${dif.length === 1 ? 'produto com diferença' : 'produtos com diferença'} na conciliação do dia`, detalhe: dif.slice(0, 3).map((d) => `${d.produto.nome} (${d.divergencia > 0 ? '+' : ''}${d.divergencia})`).join(', '), rota: '#/producao/fim' });

  return itens;
}

export const nomeDoMetodo = () => (configGastos.metodo === 'nenhum' ? 'nenhum método escolhido' : METODOS[configGastos.metodo].nome);
