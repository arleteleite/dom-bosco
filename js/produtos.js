// Produtos e fichas técnicas (etapa 11) e o cálculo de custo e preço. Módulo sem DOM: dá para testar no Node.
//
// COMO O CUSTO É FORMADO (tudo aparece na tela como "conta aberta", RNF-004):
//   custo do lote      = soma de (quantidade de cada ingrediente × preço da última compra por unidade de uso)
//   unidades vendáveis = rendimento × (1 − perda do lote)
//   custo por unidade  = custo do lote ÷ unidades vendáveis + outros custos por unidade (informados à mão)
// Ingrediente pode ser um insumo ou outro produto do tipo "preparo" (sub-receita: massa, molho...).
// Gastos gerais (energia, gás, folha...) ainda NÃO entram: vêm na etapa 13.
//
// DADOS: as fichas do bolo, do mini pão, da pizza e da rosquinha vêm do UNIQ (docs/lista_uniqgestao), a conferir.
// A massa e o molho de pizza NÃO existem no UNIQ como ficha: foram inventados aqui só para mostrar sub-receita.
// Os preços de venda são inventados (o UNIQ não os traz).

import { buscarInsumo, ultimaCompra } from './dados.js';
import { UNIDADES_DE_EMBALAGEM } from './cadastro.js';

export const AREAS = { padaria: 'Padaria', pizzaria: 'Pizzaria' };
export const TIPOS = {
  fabricado: 'Fabricado (vendido ao cliente)',
  revendido: 'Revendido (comprado pronto)',
  preparo: 'Preparo intermediário (sub-receita: massa, molho...)',
};
export const FONTES = {
  uniq: 'Ficha do UNIQ, a conferir',
  exemplo: 'Ficha inventada pelo piloto, a preencher',
  novo: 'Cadastrada aqui',
};
// Unidade em que um produto "rende": porções/unidades, gramas ou mililitros.
export const UNIDADES_DE_RENDIMENTO = { un: 'porções (unidades)', g: 'gramas', ml: 'mililitros' };

const arredondar = (v, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;

const L = (tipo, refId, valor, un, obs = '') => ({ tipo, refId, valor, un, obs });

export const PRODUTOS = [
  {
    id: 'bolo-macaxeira', nome: 'Bolo de macaxeira (fatia)', area: 'padaria', tipo: 'fabricado', fonte: 'uniq',
    rende: { qtd: 14, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 6, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'UNIQ: corta em 14 fatias; fica na vitrine gelada de um dia para o outro; validade de 3 dias.',
    linhas: [
      L('insumo', 'macaxeira', 1500, 'g'), L('insumo', 'acucar-refinado', 0.2, 'kg', 'UNIQ diz só "Açúcar": usei o refinado.'),
      L('insumo', 'trigo', 100, 'g'), L('insumo', 'coco', 100, 'g'), L('insumo', 'margarina', 0.2, 'kg'),
      L('insumo', 'ovos', 5, 'un'), L('insumo', 'ferm-bolo', 30, 'g'), L('insumo', 'leite-cond', 395, 'g'),
      L('insumo', 'queijo', 0.1, 'kg', 'UNIQ diz só "Queijo": usei a mussarela.'), L('insumo', 'leite', 0.15, 'l'),
    ],
  },
  {
    id: 'mini-pao-queijo-presunto', nome: 'Mini pão com queijo e presunto', area: 'padaria', tipo: 'fabricado', fonte: 'uniq',
    rende: { qtd: 1, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 7, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'O pão francês mini é fabricado pela própria padaria: aqui entra como insumo com preço inventado. O certo seria ele ser um preparo.',
    linhas: [L('insumo', 'pao-mini', 1, 'un'), L('insumo', 'queijo', 0.025, 'kg'), L('insumo', 'presunto', 0.025, 'kg')],
  },
  {
    id: 'pizza-carne-sol-g', nome: 'Pizza de carne de sol cremosa G', area: 'pizzaria', tipo: 'fabricado', fonte: 'uniq',
    rende: { qtd: 1, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 68, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'UNIQ: rende 1 kg, 1 porção. A pizza vem em P, M, G e GG: este é o tamanho G.',
    linhas: [
      L('produto', 'massa-pizza', 430, 'g'), L('insumo', 'queijo', 0.31, 'kg'), L('insumo', 'carne-sol', 0.175, 'kg'),
      L('insumo', 'creme-leite', 200, 'g'),
      L('insumo', 'catupiry', 176, 'g', 'ATENÇÃO: o UNIQ diz "176 Kg", que é impossível. Usei 176 g. Confirme a quantidade.'),
      L('produto', 'molho-pizza', 90, 'g'), L('insumo', 'emb-pizza-g', 1, 'un'),
    ],
  },
  {
    id: 'rosquinha-polvilho', nome: 'Rosquinha de polvilho doce (unidade)', area: 'padaria', tipo: 'fabricado', fonte: 'uniq',
    rende: { qtd: 19, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 1.5, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'UNIQ: rende 19 porções; tempo de preparo 40 (minutos, supostamente).',
    linhas: [
      L('insumo', 'acucar-refinado', 100, 'g', 'UNIQ diz só "Açúcar": usei o refinado.'), L('insumo', 'queijo', 50, 'g'),
      L('insumo', 'polvilho', 400, 'g'), L('insumo', 'ovos', 3, 'un'),
    ],
  },
  {
    id: 'pizza-mussarela-g', nome: 'Pizza de mussarela G', area: 'pizzaria', tipo: 'fabricado', fonte: 'exemplo',
    rende: { qtd: 1, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 58, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'INVENTADA pelo piloto, para o balcão ter o que vender. Substitua pela ficha real.',
    linhas: [L('produto', 'massa-pizza', 430, 'g'), L('produto', 'molho-pizza', 90, 'g'), L('insumo', 'queijo', 0.35, 'kg'), L('insumo', 'oregano', 2, 'g'), L('insumo', 'emb-pizza-g', 1, 'un')],
  },
  {
    id: 'pizza-calabresa-g', nome: 'Pizza de calabresa G', area: 'pizzaria', tipo: 'fabricado', fonte: 'exemplo',
    rende: { qtd: 1, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 60, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'INVENTADA pelo piloto, para o balcão ter o que vender. Substitua pela ficha real.',
    linhas: [L('produto', 'massa-pizza', 430, 'g'), L('produto', 'molho-pizza', 90, 'g'), L('insumo', 'queijo', 0.25, 'kg'), L('insumo', 'calabresa', 0.15, 'kg'), L('insumo', 'cebola', 50, 'g'), L('insumo', 'emb-pizza-g', 1, 'un')],
  },
  {
    id: 'pao-mini-unidade', nome: 'Pão francês mini (unidade)', area: 'padaria', tipo: 'fabricado', fonte: 'exemplo',
    rende: { qtd: 1, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: 0.8, precoExemplo: true, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'INVENTADO pelo piloto, para o balcão ter o que vender. O pão é feito pela casa: aqui entra como insumo pronto.',
    linhas: [L('insumo', 'pao-mini', 1, 'un')],
  },
  {
    id: 'bolo-casamento', nome: 'Bolo de casamento decorado (40 fatias)', area: 'padaria', tipo: 'fabricado', fonte: 'exemplo', soEncomenda: true,
    rende: { qtd: 40, unidade: 'un' }, perdaPct: 5, outrosCustos: 0, impostosPct: 0,
    preco: null, precoExemplo: false, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'INVENTADA pelo piloto, para a encomenda ter um produto de prazo longo. Só é feito sob encomenda; a decoração não entra na conta. Substitua pela ficha real.',
    linhas: [L('insumo', 'trigo', 2, 'kg'), L('insumo', 'acucar-refinado', 1.5, 'kg'), L('insumo', 'ovos', 24, 'un'), L('insumo', 'margarina', 1, 'kg'), L('insumo', 'leite', 1, 'l'), L('insumo', 'leite-cond', 790, 'g'), L('insumo', 'creme-leite', 400, 'g'), L('insumo', 'coco', 300, 'g'), L('insumo', 'ferm-bolo', 60, 'g')],
  },
  {
    id: 'massa-pizza', nome: 'Massa de pizza', area: 'pizzaria', tipo: 'preparo', fonte: 'exemplo',
    rende: { qtd: 5000, unidade: 'g' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: null, precoExemplo: false, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'INVENTADA pelo piloto. A água não entra na conta. Substitua pela receita real.',
    linhas: [L('insumo', 'trigo', 3, 'kg'), L('insumo', 'ferm-bio', 30, 'g'), L('insumo', 'sal', 60, 'g'), L('insumo', 'oleo', 150, 'ml')],
  },
  {
    id: 'molho-pizza', nome: 'Molho de pizza', area: 'pizzaria', tipo: 'preparo', fonte: 'exemplo',
    rende: { qtd: 1000, unidade: 'g' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: null, precoExemplo: false, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null,
    obs: 'INVENTADO pelo piloto. Substitua pela receita real.',
    linhas: [L('insumo', 'tomate', 1, 'kg'), L('insumo', 'cebola', 100, 'g'), L('insumo', 'oleo', 40, 'ml'), L('insumo', 'sal', 10, 'g'), L('insumo', 'oregano', 5, 'g')],
  },
];

export const buscarProduto = (id) => PRODUTOS.find((p) => p.id === id) ?? null;

export function adicionarProduto(produto) { PRODUTOS.push(produto); return produto; }
export function removerProduto(id) {
  const i = PRODUTOS.findIndex((p) => p.id === id);
  if (i >= 0) PRODUTOS.splice(i, 1);
}

// ---- Unidades -------------------------------------------------------------------------------

/** Unidade de controle (g, ml ou un) de uma linha da ficha: a do insumo ou a do rendimento do preparo. */
export function usoDaLinha(linha) {
  if (linha.tipo === 'produto') return buscarProduto(linha.refId)?.rende.unidade ?? 'un';
  return buscarInsumo(linha.refId)?.uso ?? 'un';
}

export function unidadesDaLinha(linha) { return UNIDADES_DE_EMBALAGEM[usoDaLinha(linha)]; }

/** Quantidade da linha na unidade de controle (g, ml ou un). Unidade que não serve para o item vira a primeira da lista. */
export function qtdBase(linha) {
  const unidades = unidadesDaLinha(linha);
  const un = unidades.find((u) => u.id === linha.un) ?? unidades[0];
  return (Number(linha.valor) || 0) * un.fator;
}

// ---- Custo ------------------------------------------------------------------------------------

/** Preço de 1 g, 1 mL ou 1 un do insumo, na última compra (ou no preço de teste `override`, por embalagem). Null se nunca comprou. */
export function precoPorUso(insumo, override = {}) {
  const porEmbalagem = override[insumo.id] ?? ultimaCompra(insumo)?.preco ?? null;
  return porEmbalagem === null ? null : porEmbalagem / insumo.compra.qtdUso;
}

/** Produto `alvoId` aparece (direta ou indiretamente) dentro da ficha de `produto`? Serve para impedir ciclos. */
export function dependeDe(produto, alvoId, vistos = new Set()) {
  if (vistos.has(produto.id)) return false;
  vistos.add(produto.id);
  return produto.linhas.some((l) => l.tipo === 'produto' && (l.refId === alvoId || (buscarProduto(l.refId) && dependeDe(buscarProduto(l.refId), alvoId, vistos))));
}

/** Insumo usado (direta ou indiretamente) na ficha? */
export function usaInsumo(produto, insumoId, vistos = new Set()) {
  if (vistos.has(produto.id)) return false;
  vistos.add(produto.id);
  return produto.linhas.some((l) => (l.tipo === 'insumo' && l.refId === insumoId)
    || (l.tipo === 'produto' && buscarProduto(l.refId) && usaInsumo(buscarProduto(l.refId), insumoId, vistos)));
}

/**
 * Custo de cada linha da ficha, no lote inteiro.
 * @returns {{ linhas: object[], total: number, incompleto: boolean }}
 *   `incompleto` = há ingrediente sem preço (insumo nunca comprado) ou ciclo: o total está subestimado.
 */
export function custoDasLinhas(produto, override = {}, pilha = []) {
  let incompleto = false;
  const linhas = produto.linhas.map((linha) => {
    const qtd = qtdBase(linha);
    if (linha.tipo === 'insumo') {
      const insumo = buscarInsumo(linha.refId);
      const pu = insumo ? precoPorUso(insumo, override) : null;
      if (pu === null) incompleto = true;
      return { linha, nome: insumo?.nome ?? '(insumo removido)', qtd, precoUso: pu, custo: pu === null ? 0 : qtd * pu, semPreco: pu === null, inativo: insumo?.ativo === false };
    }
    const sub = buscarProduto(linha.refId);
    if (!sub || pilha.includes(sub.id) || sub.id === produto.id) {
      incompleto = true;
      return { linha, nome: sub?.nome ?? '(preparo removido)', qtd, precoUso: null, custo: 0, semPreco: true, ciclo: true };
    }
    const c = custoUnitario(sub, override, [...pilha, produto.id]);
    if (c.incompleto) incompleto = true;
    return { linha, nome: sub.nome, qtd, precoUso: c.total, custo: qtd * c.total, semPreco: c.incompleto, preparo: true };
  });
  return { linhas, total: linhas.reduce((s, l) => s + l.custo, 0), incompleto };
}

/** Custo por unidade vendável (porção, g ou mL, conforme o rendimento), com a conta aberta. */
export function custoUnitario(produto, override = {}, pilha = []) {
  const { linhas, total: lote, incompleto } = custoDasLinhas(produto, override, pilha);
  const perda = Math.min(Math.max(Number(produto.perdaPct) || 0, 0), 99.9);
  const vendaveis = (Number(produto.rende.qtd) || 0) * (1 - perda / 100);
  const porUnidade = vendaveis > 0 ? lote / vendaveis : 0;
  const outros = Number(produto.outrosCustos) || 0;
  return { linhas, lote, vendaveis, perda, porUnidade, outros, total: porUnidade + outros, incompleto: incompleto || vendaveis <= 0 };
}

// ---- Preço ------------------------------------------------------------------------------------

/**
 * Indicadores do preço praticado. Os quatro conceitos são DIFERENTES (RN-002):
 *   custo               = o que custa fazer 1 unidade
 *   markup              = quanto se soma sobre o CUSTO  → (preço − custo) ÷ custo
 *   margem de contribuição = o que sobra do preço depois do custo e dos impostos/taxas sobre a venda → em R$ e em % do PREÇO
 *   margem de lucro     = margem de contribuição menos a parte dos gastos gerais rateados (etapa 13; zero até ela escolher um método)
 */
export function indicadores(produto, custo, gastosGerais = 0) {
  const preco = Number(produto.preco);
  if (!(preco > 0)) return null;
  const imposto = preco * ((Number(produto.impostosPct) || 0) / 100);
  const contribuicao = preco - custo - imposto;
  return {
    preco, custo, imposto, contribuicao, gastosGerais,
    markup: custo > 0 ? (preco - custo) / custo : null,
    contribuicaoPct: contribuicao / preco,
    lucro: contribuicao - gastosGerais,
    lucroPct: (contribuicao - gastosGerais) / preco,
  };
}

/** Preço para um markup desejado (fração: 1 = 100% sobre o custo). */
export const precoPorMarkup = (custo, markup) => (custo > 0 && markup >= 0 ? custo * (1 + markup) : null);

/**
 * Preço para uma margem de contribuição desejada (fração do PREÇO), já descontando os impostos/taxas (fração do preço).
 * preço = custo ÷ (1 − margem − impostos). Sem solução se margem + impostos chegar a 100%.
 */
export function precoPorMargem(custo, margem, impostos = 0) {
  const d = 1 - margem - impostos;
  return custo > 0 && margem >= 0 && d > 0.0001 ? custo / d : null;
}

/** Preço no cartão para a loja receber o preço à vista depois da taxa: à vista ÷ (1 − taxa). Hipótese [P]. */
export const precoNoCartao = (preco, taxaPct) => (taxaPct >= 0 && taxaPct < 100 ? preco / (1 - taxaPct / 100) : null);

// ---- Alerta de variação de preço (etapa 7, agora com as fichas reais) -------------------------------

/**
 * Produtos finais (não os preparos) cujo custo muda por causa de um insumo, direta ou por sub-receita.
 * `precoAnterior` e `precoNovo` são por embalagem de compra. Os demais preços ficam como estão.
 */
export function produtosAfetados(insumoId, precoAnterior) {
  return PRODUTOS.filter((p) => p.tipo !== 'preparo' && usaInsumo(p, insumoId)).map((p) => {
    const custoDepois = custoUnitario(p).total;
    const custoAntes = custoUnitario(p, { [insumoId]: precoAnterior }).total;
    const venda = Number(p.preco) > 0 ? Number(p.preco) : null;
    return {
      id: p.id, nome: p.nome, area: p.area, precoVenda: venda,
      custoAntes: arredondar(custoAntes), custoDepois: arredondar(custoDepois), delta: arredondar(custoDepois - custoAntes),
      sobraAntes: venda === null ? null : arredondar(venda - custoAntes), sobraDepois: venda === null ? null : arredondar(venda - custoDepois),
    };
  }).filter((x) => Math.abs(x.delta) > 1e-6);
}

// ---- Cadastro de produto --------------------------------------------------------------------------

export function novoProduto(nome, base = {}) {
  const nomeLimpo = String(nome).replace(/\s+/g, ' ').trim();
  const slug = nomeLimpo.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'produto';
  let id = slug;
  for (let n = 2; PRODUTOS.some((p) => p.id === id); n += 1) id = `${slug}-${n}`;
  return {
    id, nome: nomeLimpo, area: 'padaria', tipo: 'fabricado', fonte: 'novo',
    rende: { qtd: 1, unidade: 'un' }, perdaPct: 0, outrosCustos: 0, impostosPct: 0,
    preco: null, precoExemplo: false, markupDesejado: null, margemDesejada: null, taxaCartaoPct: null, obs: '', linhas: [],
    ...base,
  };
}

/** Cópia independente de uma ficha (por exemplo, para fazer a pizza M a partir da G). */
export function duplicarProduto(produto) {
  const { id, nome, ...resto } = structuredClone(produto);
  return adicionarProduto(novoProduto(`${nome} (cópia)`, { ...resto, fonte: 'novo', precoExemplo: false }));
}

/** Produtos que usam este preparo como ingrediente (impedem a exclusão dele). */
export const usadoEm = (produtoId) => PRODUTOS.filter((p) => p.linhas.some((l) => l.tipo === 'produto' && l.refId === produtoId));
