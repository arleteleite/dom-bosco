// Gastos gerais e rateio (etapa 13). Módulo sem DOM: dá para testar no Node.
//
// PROBLEMA: energia, gás, água, folha, manutenção e financiamentos não pertencem a um produto, mas alguém paga por eles.
// "Ratear" é decidir quanto de cada gasto cada produto carrega. NÃO existe método único certo, e o método muda o preço e a margem
// de cada produto. Por isso o piloto mostra 3 métodos LADO A LADO, com a conta aberta, e a escolha é da proprietária e do contador
// (RF-022). O piloto não decide: só mostra a diferença.
//
// DADOS: todos os valores de gastos são INVENTADOS. As quantidades vendidas por mês vêm do dia de vendas de exemplo do balcão
// (também inventado) multiplicado pelos dias de funcionamento, e podem ser corrigidas.
//
// Cada loja (padaria e pizzaria) tem seu próprio total de gastos e rateia só entre os seus produtos (RN-005 [P]).
// Um gasto "das duas" é dividido entre as lojas pela porcentagem informada.

import { PRODUTOS, custoUnitario } from './produtos.js';
import { gerarVendasDeExemplo } from './balcao.js';

export const LOJAS = { padaria: 'Padaria', pizzaria: 'Pizzaria', ambas: 'As duas' };

export const METODOS = {
  quantidade: {
    nome: 'Por quantidade vendida',
    resumo: 'Todo produto da loja carrega o mesmo valor por unidade.',
    como: 'gastos da loja ÷ unidades vendidas por mês',
    efeito: 'Simples de explicar, mas um pãozinho de R$ 0,80 carrega o mesmo que uma pizza de R$ 60.',
  },
  faturamento: {
    nome: 'Por faturamento',
    resumo: 'Quem fatura mais carrega mais: cada R$ 1 vendido leva a mesma parte dos gastos.',
    como: 'gastos da loja × preço do produto ÷ faturamento da loja no mês',
    efeito: 'Proporcional ao preço: o produto caro absorve mais, o barato quase nada. Depende dos preços de venda estarem certos.',
  },
  ingredientes: {
    nome: 'Por custo dos ingredientes',
    resumo: 'Quem gasta mais com ingredientes carrega mais dos gastos gerais.',
    como: 'gastos da loja × custo do produto ÷ custo total dos ingredientes vendidos no mês',
    efeito: 'Independe do preço de venda, mas trata igual um produto caro de fazer e um que dá mais trabalho e usa pouco insumo.',
  },
};

/** Método aplicado na Precificação (margem de lucro). "nenhum" = ainda não escolhido: os gastos gerais não entram. */
export const config = { metodo: 'nenhum', diasPorMes: 26 };

const arredondar = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

const G = (id, nome, valor, loja, pctPadaria = 50) => ({ id, nome, valor, loja, pctPadaria });

export const GASTOS = [
  G('energia', 'Energia elétrica', 2800, 'ambas', 50),
  G('gas', 'Gás', 1500, 'ambas', 60),
  G('agua', 'Água', 450, 'ambas', 70),
  G('folha-padaria', 'Folha de pagamento (padaria)', 9000, 'padaria'),
  G('folha-pizzaria', 'Folha de pagamento (pizzaria)', 6000, 'pizzaria'),
  G('manutencao', 'Manutenção de máquinas', 600, 'padaria'),
  G('financiamento-forno', 'Financiamento do forno', 1200, 'padaria'),
  G('combustivel', 'Combustível das entregas', 700, 'pizzaria'),
];

let contador = 0;
export function novoGasto(nome = 'Novo gasto') {
  contador += 1;
  const g = G(`gasto-novo-${contador}`, nome, 0, 'padaria');
  GASTOS.push(g);
  return g;
}
export function removerGasto(id) {
  const i = GASTOS.findIndex((g) => g.id === id);
  if (i >= 0) GASTOS.splice(i, 1);
}

/** Quanto de cada gasto cai em cada loja. */
export function totaisPorLoja() {
  const t = { padaria: 0, pizzaria: 0 };
  for (const g of GASTOS) {
    const v = Number(g.valor) || 0;
    if (g.loja === 'ambas') {
      const pct = Math.min(Math.max(Number(g.pctPadaria) || 0, 0), 100) / 100;
      t.padaria += v * pct;
      t.pizzaria += v * (1 - pct);
    } else {
      t[g.loja] += v;
    }
  }
  return { padaria: arredondar(t.padaria), pizzaria: arredondar(t.pizzaria), total: arredondar(t.padaria + t.pizzaria) };
}

// ---- Quantidade vendida por mês ----------------------------------------------------------------------

const volumes = new Map(); // produtoId → { qtd, editado }

/** Unidades por mês sugeridas pelo dia de vendas de exemplo do balcão (inventado) × dias de funcionamento. */
function sugestaoDeVolume(produtoId) {
  const doDia = gerarVendasDeExemplo().flatMap((v) => v.itens).filter((i) => i.produtoId === produtoId).reduce((s, i) => s + i.qtd, 0);
  return Math.round(doDia * config.diasPorMes);
}

export function volumeDe(produtoId) {
  let v = volumes.get(produtoId);
  if (!v) { v = { qtd: sugestaoDeVolume(produtoId), editado: false }; volumes.set(produtoId, v); }
  return v;
}

export function definirVolume(produtoId, qtd) {
  const n = Number(qtd);
  volumes.set(produtoId, { qtd: Number.isFinite(n) && n >= 0 ? n : 0, editado: true });
}

/** Mudou o número de dias: refaz só os volumes que a pessoa não corrigiu à mão. */
export function mudarDias(dias) {
  config.diasPorMes = Math.min(Math.max(Number(dias) || 0, 1), 31);
  for (const [id, v] of volumes) if (!v.editado) v.qtd = sugestaoDeVolume(id);
}

// ---- Rateio ----------------------------------------------------------------------------------------------

export const produtosDoRateio = () => PRODUTOS.filter((p) => p.tipo !== 'preparo' && !p.soEncomenda);

/** "Peso" de uma unidade do produto em cada método. Maior peso = carrega mais dos gastos. */
function pesoUnitario(metodo, produto, custo) {
  if (metodo === 'quantidade') return 1;
  if (metodo === 'faturamento') return Number(produto.preco) > 0 ? Number(produto.preco) : 0;
  return custo; // ingredientes
}

/**
 * Rateia os gastos de cada loja entre os produtos dela.
 *   gasto por unidade do produto = gastos da loja × peso da unidade ÷ Σ (unidades × peso) da loja
 * @returns {{ itens: Map<string, {porUnidade:number, semBase:boolean, motivo?:string}>, lojas: object, conferencia: object }}
 */
export function ratear(metodo) {
  const pool = totaisPorLoja();
  const itens = new Map();
  const lojas = {};
  const conferencia = { rateado: 0, total: 0, naoDistribuido: 0 };

  for (const loja of ['padaria', 'pizzaria']) {
    const lista = produtosDoRateio().filter((p) => p.area === loja).map((p) => {
      const custo = custoUnitario(p).total;
      return { p, qtd: volumeDe(p.id).qtd, peso: pesoUnitario(metodo, p, custo) };
    });
    const base = lista.reduce((s, x) => s + (x.qtd > 0 && x.peso > 0 ? x.qtd * x.peso : 0), 0);
    lojas[loja] = { total: pool[loja], base, produtos: lista.length };
    conferencia.total += pool[loja];
    for (const x of lista) {
      if (base <= 0 || !(x.qtd > 0 && x.peso > 0)) {
        itens.set(x.p.id, { porUnidade: 0, semBase: true, motivo: x.qtd > 0 ? (metodo === 'faturamento' ? 'sem preço de venda' : 'sem custo') : 'sem quantidade vendida' });
        continue;
      }
      const porUnidade = (pool[loja] * x.peso) / base;
      itens.set(x.p.id, { porUnidade, semBase: false });
      conferencia.rateado += porUnidade * x.qtd;
    }
  }
  conferencia.rateado = arredondar(conferencia.rateado);
  conferencia.total = arredondar(conferencia.total);
  conferencia.naoDistribuido = arredondar(conferencia.total - conferencia.rateado);
  return { itens, lojas, conferencia };
}

/** Gasto geral rateado por unidade, pelo método escolhido na tela de Gastos gerais (0 se ainda não escolheu). */
export function gastosPorUnidade(produto) {
  if (config.metodo === 'nenhum' || produto.tipo === 'preparo') return 0;
  return ratear(config.metodo).itens.get(produto.id)?.porUnidade ?? 0;
}

/** Só para testes. */
export function _reiniciar() { volumes.clear(); config.metodo = 'nenhum'; config.diasPorMes = 26; }
