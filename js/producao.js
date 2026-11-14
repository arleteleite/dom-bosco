// Produção, sobras e conciliação (etapa 14). Módulo sem DOM: dá para testar no Node.
//
// O QUE ESTA ETAPA SIMULA (hipóteses [P], para a proprietária reagir):
//   - cada produto tem uma META de unidades por dia (hoje a quantidade diária já é definida na cabeça de quem produz);
//   - cada FORNADA registrada tira os insumos do estoque pela ficha técnica (RF-011);
//   - a SOBRA pode ser descartada, reaproveitada (ex.: pão francês vira torrada) ou doada/consumida pela casa;
//   - no fim do dia, a CONCILIAÇÃO compara o que foi produzido, o que foi vendido no Balcão, o que saiu como sobra e o que foi
//     contado na prateleira, e destaca a divergência (RF-019).
//
// Os dados do dia de exemplo são INVENTADOS. Tudo fica só na memória: recarregar a página zera.

import { PRODUTOS, buscarProduto, custoUnitario, qtdBase } from './produtos.js';
import { buscarInsumo } from './dados.js';
import { vendasParaRelatorio, gerarVendasDeExemplo } from './balcao.js';

export const DESTINOS = {
  descarte: 'Descartado (jogado fora)',
  reaproveitado: 'Reaproveitado (ex.: pão vira torrada)',
  doacao: 'Doação ou consumo da casa',
};

export const producao = {
  metas: new Map(), // produtoId → unidades por dia
  fornadas: [],
  saidas: [], // sobras: descarte, reaproveitamento ou doação
  contagens: new Map(), // produtoId → unidades contadas no fim do dia (ou ausente)
  toleranciaPct: 5, // divergência que passa disto (% do produzido) é destacada
  proximoId: 1,
};

const arredondar = (v, casas = 3) => Math.round(v * 10 ** casas) / 10 ** casas;

/** Só o que a casa fabrica entra aqui: preparos (massa, molho) viram insumos de outros produtos, e revendidos não são produzidos. */
export const produtosDeProducao = () => PRODUTOS.filter((p) => p.tipo === 'fabricado')
  .sort((a, b) => a.area.localeCompare(b.area) || a.nome.localeCompare(b.nome, 'pt-BR'));

// ---- Meta do dia --------------------------------------------------------------------------------------

/** Meta sugerida: o que o dia de exemplo do balcão vendeu, mais 10% de folga. */
function metaSugerida(produtoId) {
  const vendido = gerarVendasDeExemplo().flatMap((v) => v.itens).filter((i) => i.produtoId === produtoId).reduce((s, i) => s + i.qtd, 0);
  return Math.ceil(vendido * 1.1);
}

export function metaDe(produtoId) {
  if (!producao.metas.has(produtoId)) producao.metas.set(produtoId, metaSugerida(produtoId));
  return producao.metas.get(produtoId);
}

export function definirMeta(produtoId, qtd) {
  const n = Number(qtd);
  producao.metas.set(produtoId, Number.isFinite(n) && n >= 0 ? Math.round(n) : 0);
}

// ---- Consumo de insumos pela ficha ------------------------------------------------------------------------

/**
 * Quanto de cada insumo (em g, mL ou un) uma produção de `qtd` unidades consome, segundo a ficha técnica.
 * Os lotes da ficha são proporcionais: produzir metade das unidades de um lote consome metade dos ingredientes.
 * Sub-receitas (massa, molho) são abertas até chegar nos insumos.
 * @returns {Map<string, number>} insumoId → quantidade
 */
export function consumoDeInsumos(produto, qtd, pilha = []) {
  const consumo = new Map();
  if (!(qtd > 0) || pilha.includes(produto.id)) return consumo;
  const vendaveis = custoUnitario(produto).vendaveis;
  if (!(vendaveis > 0)) return consumo;
  const lotes = qtd / vendaveis;
  for (const linha of produto.linhas) {
    if (!linha.refId) continue;
    const q = qtdBase(linha) * lotes;
    if (linha.tipo === 'insumo') {
      consumo.set(linha.refId, (consumo.get(linha.refId) ?? 0) + q);
    } else {
      const sub = buscarProduto(linha.refId);
      if (!sub) continue;
      for (const [id, v] of consumoDeInsumos(sub, q, [...pilha, produto.id])) consumo.set(id, (consumo.get(id) ?? 0) + v);
    }
  }
  return consumo;
}

/** O mesmo consumo com o saldo do estoque ao lado: mostra o que vai faltar antes de registrar. */
export function previaDaFornada(produtoId, qtd) {
  const produto = buscarProduto(produtoId);
  if (!produto) return [];
  return [...consumoDeInsumos(produto, qtd)].map(([insumoId, q]) => {
    const insumo = buscarInsumo(insumoId);
    const saldo = insumo?.estoque.saldo ?? 0;
    return { insumoId, nome: insumo?.nome ?? '(removido)', uso: insumo?.uso ?? 'un', qtd: q, saldo, faltara: Math.max(0, q - saldo) };
  }).sort((a, b) => b.faltara - a.faltara || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---- Fornadas ---------------------------------------------------------------------------------------------

/**
 * Registra uma fornada: soma ao produzido do dia e BAIXA os insumos do estoque.
 * O saldo nunca fica negativo: se faltar, a fornada registra o que faltou (a contagem do estoque estava desatualizada).
 */
export function registrarFornada({ produtoId, qtd, quem = '', exemplo = false }, agora = new Date()) {
  const produto = buscarProduto(produtoId);
  const n = Number(qtd);
  if (!produto) throw new Error('Escolha o produto.');
  if (!(n > 0)) throw new Error('Informe quantas unidades saíram do forno.');
  const baixas = [...consumoDeInsumos(produto, n)].map(([insumoId, q]) => {
    const insumo = buscarInsumo(insumoId);
    if (!insumo) return { insumoId, qtd: q, baixado: 0, faltou: q };
    const baixado = Math.min(insumo.estoque.saldo, q);
    insumo.estoque.saldo = arredondar(insumo.estoque.saldo - baixado);
    return { insumoId, qtd: arredondar(q), baixado: arredondar(baixado), faltou: arredondar(q - baixado) };
  });
  const fornada = { id: producao.proximoId++, produtoId, nome: produto.nome, area: produto.area, qtd: Math.round(n), quem: String(quem).trim(), quando: agora, exemplo, baixas };
  producao.fornadas.push(fornada);
  return fornada;
}

export function desfazerFornada(id) {
  const i = producao.fornadas.findIndex((f) => f.id === id);
  if (i < 0) return;
  for (const b of producao.fornadas[i].baixas) {
    const insumo = buscarInsumo(b.insumoId);
    if (insumo) insumo.estoque.saldo = arredondar(insumo.estoque.saldo + b.baixado);
  }
  producao.fornadas.splice(i, 1);
}

export const produzidoHoje = (produtoId) => producao.fornadas.filter((f) => f.produtoId === produtoId).reduce((s, f) => s + f.qtd, 0);

/** Insumos consumidos hoje, separados por área (RN-005: cada produto pertence à padaria ou à pizzaria). */
export function consumoDoDia() {
  const mapa = new Map();
  for (const f of producao.fornadas) {
    for (const b of f.baixas) {
      const m = mapa.get(b.insumoId) ?? { insumoId: b.insumoId, total: 0, padaria: 0, pizzaria: 0 };
      m.total += b.qtd;
      m[f.area] += b.qtd;
      mapa.set(b.insumoId, m);
    }
  }
  return [...mapa.values()].map((m) => ({ ...m, insumo: buscarInsumo(m.insumoId) })).filter((m) => m.insumo).sort((a, b) => b.total - a.total);
}

// ---- Sobras e descarte ------------------------------------------------------------------------------------

export function registrarSaida({ produtoId, qtd, destino, obs = '' }, agora = new Date()) {
  const produto = buscarProduto(produtoId);
  const n = Number(qtd);
  if (!produto) throw new Error('Escolha o produto.');
  if (!DESTINOS[destino]) throw new Error('Escolha o que aconteceu com a sobra.');
  if (!(n > 0)) throw new Error('Informe a quantidade.');
  const saida = {
    id: producao.proximoId++, produtoId, nome: produto.nome, area: produto.area, qtd: Math.round(n), destino, obs: String(obs).trim(), quando: agora,
    custo: arredondar(n * custoUnitario(produto).total, 2),
  };
  producao.saidas.push(saida);
  return saida;
}

export function removerSaida(id) {
  const i = producao.saidas.findIndex((s) => s.id === id);
  if (i >= 0) producao.saidas.splice(i, 1);
}

export const saidasDe = (produtoId) => producao.saidas.filter((s) => s.produtoId === produtoId).reduce((s, x) => s + x.qtd, 0);

// ---- Conciliação do fim do dia -----------------------------------------------------------------------------

/** Quantas unidades de um produto foram vendidas hoje no Balcão (inclui as vendas de exemplo, se estiverem ligadas). */
export function vendidoHoje(produtoId) {
  return vendasParaRelatorio().flatMap((v) => v.itens).filter((i) => i.produtoId === produtoId).reduce((s, i) => s + i.qtd, 0);
}

export function definirContagem(produtoId, qtd) {
  if (qtd === null || qtd === '' || !Number.isFinite(Number(qtd))) producao.contagens.delete(produtoId);
  else producao.contagens.set(produtoId, Math.max(0, Math.round(Number(qtd))));
}

/**
 * Para cada produto: produzido − vendido − saídas registradas = sobra ESPERADA. Compara com a sobra CONTADA.
 *   divergência < 0: faltou produto sem explicação (venda sem registro, consumo, perda, contagem errada)
 *   divergência > 0: sobrou mais do que o esperado (venda registrada a mais, fornada esquecida, contagem errada)
 */
export function conciliar() {
  const tolerancia = Number(producao.toleranciaPct) || 0;
  return produtosDeProducao().map((p) => {
    const produzido = produzidoHoje(p.id);
    const vendido = vendidoHoje(p.id);
    const saidas = saidasDe(p.id);
    const esperado = produzido - vendido - saidas;
    const contado = producao.contagens.has(p.id) ? producao.contagens.get(p.id) : null;
    const divergencia = contado === null ? null : contado - esperado;
    const base = Math.max(produzido, vendido, 1);
    const custo = custoUnitario(p).total;
    return {
      produto: p, produzido, vendido, saidas, esperado, contado, divergencia,
      divergenciaPct: divergencia === null ? null : Math.abs(divergencia) / base,
      alerta: divergencia !== null && divergencia !== 0 && (Math.abs(divergencia) / base) * 100 > tolerancia,
      valor: divergencia === null ? null : arredondar(divergencia * custo, 2),
      ativo: produzido > 0 || vendido > 0 || saidas > 0 || metaDe(p.id) > 0,
    };
  });
}

// ---- Dia de exemplo (inventado) ---------------------------------------------------------------------------------

/** Zera o dia: desfaz as fornadas (devolvendo os insumos ao estoque) e apaga sobras e contagens. */
export function limparDia() {
  [...producao.fornadas].forEach((f) => desfazerFornada(f.id));
  producao.saidas = [];
  producao.contagens.clear();
}

/**
 * Preenche um dia: duas fornadas por produto cobrindo as vendas do dia de exemplo, algumas sobras e uma contagem com pequenas
 * diferenças de propósito, para a conciliação ter divergências para mostrar. Tudo inventado.
 */
export function preencherDiaDeExemplo(agora = new Date()) {
  limparDia();
  const diferencas = [0, -8, 2, 0, -3, 0, -1, 1]; // bolo fecha; mini pão e pizza de calabresa passam da tolerância; os outros ficam dentro dela
  produtosDeProducao().forEach((p, k) => {
    const vendido = vendidoHoje(p.id);
    if (vendido <= 0) return;
    const total = Math.ceil(vendido * 1.15);
    const manha = Math.ceil(total * 0.6);
    registrarFornada({ produtoId: p.id, qtd: manha, quem: 'exemplo', exemplo: true }, new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 6, 30));
    if (total - manha > 0) registrarFornada({ produtoId: p.id, qtd: total - manha, quem: 'exemplo', exemplo: true }, new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 14, 0));
    const sobra = Math.max(0, total - vendido);
    const destino = p.id === 'pao-mini-unidade' ? 'reaproveitado' : 'descarte';
    const registrada = Math.floor(sobra / 3);
    if (registrada > 0) registrarSaida({ produtoId: p.id, qtd: registrada, destino, obs: destino === 'reaproveitado' ? 'virou torrada' : '' }, agora);
    const esperado = total - vendido - registrada;
    producao.contagens.set(p.id, Math.max(0, esperado + diferencas[k % diferencas.length]));
  });
}

/** Só para testes. */
export function _reiniciar() {
  limparDia();
  producao.metas.clear();
  producao.toleranciaPct = 5;
}
