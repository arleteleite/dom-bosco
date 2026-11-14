// =====================================================================
// DADOS FICTÍCIOS DO PILOTO — nada aqui é real.
//
// - Os NOMES dos insumos e as unidades de compra (saco, fardo, caixa...)
//   vêm da lista do UNIQ. Alguns insumos foram acrescentados só para o exemplo.
// - Preços, quantidades, validades, fornecedores e receitas foram INVENTADOS.
// - As quantidades por embalagem (ex.: "saco de 25 kg") são suposições
//   para conferir com a proprietária.
//
// Unidades: "uso" é a menor unidade em que o sistema controla o insumo
// (g, ml ou un). "compra" diz o que vem em cada embalagem comprada.
// =====================================================================

export const ORIGENS = {
  xml: 'XML da nota',
  cupom: 'Cupom fiscal',
  recibo: 'Recibo',
  nenhum: 'Sem comprovante',
  pdf: 'Nota (PDF)',
  foto: 'Nota (foto)',
};

// Campos: documento (CNPJ/CPF, só dígitos; vazio nos de exemplo), telefone, contato, prazo (prazo e dia de entrega),
// ativo (false = inativo: some das listas de escolha, mas o histórico de compras continua ligado a ele).
export const FORNECEDORES = [
  { id: 'atacado', nome: 'Atacado Exemplo', tipo: 'Atacado', comprovante: 'XML por e-mail', documento: '', telefone: '', contato: '', prazo: '', ativo: true },
  { id: 'frios', nome: 'Frios Exemplo', tipo: 'Distribuidora', comprovante: 'Nota em XML ou recibo', documento: '', telefone: '', contato: '', prazo: '', ativo: true },
  { id: 'mercado', nome: 'Mercado Exemplo', tipo: 'Compras pequenas', comprovante: 'Cupom fiscal', documento: '', telefone: '', contato: '', prazo: '', ativo: true },
  { id: 'frutaria', nome: 'Frutaria Exemplo', tipo: 'Frutaria', comprovante: 'Recibo ou nada', documento: '', telefone: '', contato: '', prazo: '', ativo: true },
  { id: 'casa', nome: 'Produção da casa', tipo: 'Interno', comprovante: 'Sem comprovante', documento: '', telefone: '', contato: '', prazo: '', ativo: true },
];

// Padrões de variação de preço para o histórico (fração sobre o preço atual).
const PADROES = [
  [-0.04, 0.02, -0.01, 0.03],
  [-0.02, -0.03, 0.01, 0.02],
  [0.01, -0.02, 0.02, -0.01],
  [-0.05, 0.00, 0.03, 0.01],
];
const DIAS = [70, 49, 28, 14];

const arredondar = (v) => Math.round(v * 100) / 100;

function historicoPadrao(i, atual, fornecedorId, origem) {
  const padrao = PADROES[i % PADROES.length];
  const antigos = padrao.map((variacao, k) => ({
    diasAtras: DIAS[k],
    preco: arredondar(atual * (1 + variacao)),
    fornecedorId,
    origem,
  }));
  return [...antigos, { diasAtras: 3, preco: atual, fornecedorId, origem }];
}

// Catálogo em dois níveis: CATEGORIA (grupo do produto) e SUBGRUPO (a subdivisão: o que é óleo, o que é azeite,
// quais são as variedades de açúcar...). Cada insumo é uma "folha" com seu próprio estoque e preço.
// preco = preço da última compra, por embalagem de compra.
const base = [];
const grupo = (categoria, subgrupo, itens) => itens.forEach((i) => base.push({ categoria, subgrupo, ...i }));

grupo('Farinhas e amidos', 'Farinha de trigo', [
  { id: 'trigo', nome: 'Trigo', compra: 'Saco 25 kg', qtdUso: 25000, uso: 'g', preco: 112, forn: 'atacado', origem: 'xml', saldo: 62000, minimo: 50000, validade: 120, apelidos: ['farinha de trigo', 'farinha trigo'] },
]);
grupo('Farinhas e amidos', 'Polvilhos', [
  { id: 'polvilho', nome: 'Polvilho doce', compra: 'Saco 10 kg', qtdUso: 10000, uso: 'g', preco: 78, forn: 'atacado', origem: 'xml', saldo: 18000, minimo: 10000, validade: 150, apelidos: ['povilho doce', 'polvilho'] },
  { id: 'polvilho-azedo', nome: 'Polvilho azedo', compra: 'Saco 10 kg', qtdUso: 10000, uso: 'g', preco: 82, forn: 'atacado', origem: 'xml', saldo: 14000, minimo: 6000, validade: 150, apelidos: ['povilho azedo'] },
]);
grupo('Farinhas e amidos', 'Milho', [
  { id: 'flocao', nome: 'Flocão de milho', compra: 'Fardo 10 kg', qtdUso: 10000, uso: 'g', preco: 38, forn: 'atacado', origem: 'xml', saldo: 12000, minimo: 5000, validade: 90, apelidos: ['flocao', 'flocos de milho'] },
]);

grupo('Açúcares e adoçantes', 'Açúcar', [
  { id: 'acucar-refinado', nome: 'Açúcar refinado', compra: 'Fardo 30 kg', qtdUso: 30000, uso: 'g', preco: 126, forn: 'atacado', origem: 'xml', saldo: 40000, minimo: 30000, validade: 200, apelidos: ['acucar refinado', 'açucar refinado'] },
  { id: 'acucar-cristal', nome: 'Açúcar cristal', compra: 'Saco 5 kg', qtdUso: 5000, uso: 'g', preco: 21, forn: 'atacado', origem: 'xml', saldo: 15000, minimo: 10000, validade: 200, apelidos: ['acucar cristal', 'açucar cristal'] },
  { id: 'acucar-confeiteiro', nome: 'Açúcar de confeiteiro', compra: 'Pacote 1 kg', qtdUso: 1000, uso: 'g', preco: 7.5, forn: 'atacado', origem: 'xml', saldo: 4000, minimo: 2000, validade: 180, apelidos: ['acucar confeiteiro', 'acucar impalpavel'] },
]);

grupo('Fermentos', 'Biológico', [
  { id: 'ferm-bio', nome: 'Fermento biológico seco', compra: 'Pacote 500 g', qtdUso: 500, uso: 'g', preco: 29, forn: 'atacado', origem: 'xml', saldo: 1500, minimo: 1000, validade: 45, apelidos: ['fermento biologico', 'fermento instantaneo'], eans: ['7891000000011'] },
]);
grupo('Fermentos', 'Químico', [
  { id: 'ferm-bolo', nome: 'Fermento para bolo', compra: 'Pacote 250 g', qtdUso: 250, uso: 'g', preco: 9.5, forn: 'atacado', origem: 'xml', saldo: 600, minimo: 500, validade: 80, apelidos: ['fermento quimico', 'fermento em po'] },
]);

grupo('Óleos, gorduras e azeites', 'Óleos', [
  { id: 'oleo', nome: 'Óleo de soja', compra: 'Caixa 20 × 900 ml', qtdUso: 18000, uso: 'ml', preco: 132, forn: 'atacado', origem: 'xml', saldo: 27000, minimo: 18000, validade: 180, apelidos: ['oleo', 'oleo soja'], eans: ['7891000000042'] },
]);
grupo('Óleos, gorduras e azeites', 'Azeites', [
  { id: 'azeite', nome: 'Azeite de oliva', compra: 'Garrafa 500 ml', qtdUso: 500, uso: 'ml', preco: 38, forn: 'mercado', origem: 'cupom', saldo: 3000, minimo: 2000, validade: 300, apelidos: ['azeite', 'azeite extra virgem'] },
]);
grupo('Óleos, gorduras e azeites', 'Gorduras', [
  { id: 'margarina', nome: 'Margarina', compra: 'Caixa 15 kg', qtdUso: 15000, uso: 'g', preco: 175, forn: 'atacado', origem: 'xml', saldo: 22000, minimo: 15000, validade: 60, apelidos: ['margarina culinaria', 'margarina com sal'] },
]);

grupo('Leites e cremes', 'Leite', [
  { id: 'leite', nome: 'Leite líquido', compra: 'Caixa 12 L', qtdUso: 12000, uso: 'ml', preco: 54, forn: 'atacado', origem: 'xml', saldo: 18000, minimo: 24000, validade: 9, apelidos: ['leite integral', 'leite uht', 'leite liquido'] },
  { id: 'leite-cond', nome: 'Leite condensado', compra: 'Caixa 27 × 395 g', qtdUso: 10665, uso: 'g', preco: 164, forn: 'atacado', origem: 'xml', saldo: 21330, minimo: 10665, validade: 150, apelidos: ['leite cond'], eans: ['7891000000035'] },
]);
grupo('Leites e cremes', 'Cremes', [
  { id: 'creme-leite', nome: 'Creme de leite', compra: 'Caixa 24 × 200 g', qtdUso: 4800, uso: 'g', preco: 96, forn: 'atacado', origem: 'xml', saldo: 14400, minimo: 9600, validade: 5, apelidos: ['creme leite'], eans: ['7891000000028'] },
]);

grupo('Queijos e frios', 'Queijos', [
  { id: 'queijo', nome: 'Queijo mussarela', compra: 'Kg', qtdUso: 1000, uso: 'g', preco: 46, forn: 'frios', origem: 'xml', saldo: 14500, minimo: 20000, validade: 12, apelidos: ['queijo', 'queijo muss', 'mussarela', 'muss'],
    historico: [
      { diasAtras: 60, preco: 40, fornecedorId: 'frios', origem: 'xml' },
      { diasAtras: 45, preco: 40.5, fornecedorId: 'frios', origem: 'xml' },
      { diasAtras: 30, preco: 41, fornecedorId: 'frios', origem: 'xml' },
      { diasAtras: 14, preco: 41, fornecedorId: 'frios', origem: 'xml' },
      { diasAtras: 2, preco: 46, fornecedorId: 'frios', origem: 'xml' },
    ] },
  { id: 'catupiry', nome: 'Catupiry', compra: 'Balde 3,6 kg', qtdUso: 3600, uso: 'g', preco: 118, forn: 'frios', origem: 'recibo', saldo: 5400, minimo: 3600, validade: 25, apelidos: ['requeijao', 'requeijão cremoso'] },
]);
grupo('Queijos e frios', 'Frios', [
  { id: 'presunto', nome: 'Presunto', compra: 'Kg', qtdUso: 1000, uso: 'g', preco: 26, forn: 'frios', origem: 'xml', saldo: 3200, minimo: 5000, validade: 4, apelidos: ['presunto cozido', 'presunto coz'] },
]);

grupo('Carnes e embutidos', 'Carnes', [
  { id: 'carne-sol', nome: 'Carne de sol', compra: 'Kg', qtdUso: 1000, uso: 'g', preco: 44, forn: 'frios', origem: 'recibo', saldo: 9000, minimo: 6000, validade: 8, apelidos: ['carne sol'] },
]);
grupo('Carnes e embutidos', 'Embutidos', [
  { id: 'calabresa', nome: 'Calabresa', compra: 'Kg', qtdUso: 1000, uso: 'g', preco: 24, forn: 'frios', origem: 'xml', saldo: 7000, minimo: 5000, validade: 18, apelidos: ['linguica calabresa', 'ling calabresa'] },
]);

grupo('Hortifruti', 'Legumes e verduras', [
  { id: 'tomate', nome: 'Tomate', compra: 'Kg', qtdUso: 1000, uso: 'g', preco: 21, forn: 'frutaria', origem: 'nenhum', saldo: 18000, minimo: 12000, validade: 3, apelidos: ['flv tomate', 'tomate kg'],
    historico: [
      { diasAtras: 35, preco: 9.5, fornecedorId: 'frutaria', origem: 'nenhum' },
      { diasAtras: 27, preco: 10, fornecedorId: 'frutaria', origem: 'recibo' },
      { diasAtras: 18, preco: 10, fornecedorId: 'frutaria', origem: 'nenhum' },
      { diasAtras: 8, preco: 10, fornecedorId: 'frutaria', origem: 'nenhum' },
      { diasAtras: 2, preco: 21, fornecedorId: 'frutaria', origem: 'nenhum' },
    ] },
  { id: 'cebola', nome: 'Cebola', compra: 'Kg', qtdUso: 1000, uso: 'g', preco: 5, forn: 'frutaria', origem: 'nenhum', saldo: 15000, minimo: 8000, validade: 20, apelidos: ['flv cebola'] },
]);
grupo('Hortifruti', 'Raízes e tubérculos', [
  { id: 'macaxeira', nome: 'Macaxeira', compra: 'Saco 20 kg', qtdUso: 20000, uso: 'g', preco: 60, forn: 'frutaria', origem: 'recibo', saldo: 45000, minimo: 40000, validade: 6, apelidos: ['mandioca', 'aipim'] },
]);

grupo('Temperos e condimentos', 'Sal', [
  { id: 'sal', nome: 'Sal refinado', compra: 'Pacote 1 kg', qtdUso: 1000, uso: 'g', preco: 3.2, forn: 'mercado', origem: 'cupom', saldo: 8000, minimo: 3000, validade: null, apelidos: ['sal'] },
]);
grupo('Temperos e condimentos', 'Ervas', [
  { id: 'oregano', nome: 'Orégano', compra: 'Pacote 100 g', qtdUso: 100, uso: 'g', preco: 7.5, forn: 'mercado', origem: 'cupom', saldo: 400, minimo: 300, validade: 200, apelidos: ['oregano'] },
]);

grupo('Secos e confeitaria', 'Coco', [
  { id: 'coco', nome: 'Coco ralado flocos', compra: 'Pacote 1 kg', qtdUso: 1000, uso: 'g', preco: 36, forn: 'atacado', origem: 'xml', saldo: 2500, minimo: 2000, validade: 60, apelidos: ['coco ralado', 'coco flocos'] },
]);

grupo('Ovos', 'Ovos de galinha', [
  { id: 'ovos', nome: 'Ovos', compra: 'Bandeja 30 un', qtdUso: 30, uso: 'un', preco: 19, forn: 'atacado', origem: 'xml', saldo: 60, minimo: 120, validade: 18, apelidos: ['ovo', 'ovos brancos', 'ovos vermelhos'] },
]);

grupo('Embalagens', 'Caixas de pizza', [
  { id: 'emb-pizza-g', nome: 'Embalagem de pizza grande', compra: 'Fardo 100 un', qtdUso: 100, uso: 'un', preco: 160, forn: 'atacado', origem: 'xml', saldo: 80, minimo: 100, validade: null, apelidos: ['caixa pizza grande', 'embalagem pizza g'] },
]);

grupo('Produção da casa', 'Pães', [
  { id: 'pao-mini', nome: 'Pão francês mini', compra: 'Unidade', qtdUso: 1, uso: 'un', preco: 0.45, forn: 'casa', origem: 'nenhum', saldo: 300, minimo: 200, validade: 2, apelidos: ['pao frances mini', 'mini pao'] },
]);

export const INSUMOS = base.map((b, i) => ({
  ativo: true,
  id: b.id,
  nome: b.nome,
  categoria: b.categoria,
  subgrupo: b.subgrupo,
  compra: { rotulo: b.compra, qtdUso: b.qtdUso },
  uso: b.uso,
  apelidos: b.apelidos,
  eans: b.eans ?? [], // códigos de barras conhecidos, usados para ligar item da nota ao insumo
  fornecedorPrincipal: b.forn,
  estoque: { saldo: b.saldo, minimo: b.minimo, validadeEmDias: b.validade },
  historico: b.historico ?? historicoPadrao(i, b.preco, b.forn, b.origem),
}));

/**
 * Insumos organizados para listas de escolha: um grupo por CATEGORIA, com os insumos em ordem alfabética.
 * O subgrupo não aparece na lista: ele é só uma classificação do insumo (usada no filtro do Estoque).
 * @param {string[]} [excluir] ids que não devem aparecer (ex.: já listados em "Mais parecidos")
 */
export function insumosAgrupados(excluir = []) {
  const grupos = new Map();
  for (const i of INSUMOS) {
    if (i.ativo === false || excluir.includes(i.id)) continue;
    if (!grupos.has(i.categoria)) grupos.set(i.categoria, []);
    grupos.get(i.categoria).push(i);
  }
  return [...grupos.entries()]
    .sort((x, y) => x[0].localeCompare(y[0], 'pt-BR'))
    .map(([rotulo, itens]) => ({ rotulo, itens: itens.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')) }));
}

// As receitas e fichas técnicas ficam em produtos.js (etapa 11).

// ---------------------------------------------------------------------
// Funções de apoio
// ---------------------------------------------------------------------

const BASE_EXIBICAO = {
  g: { fator: 1000, rotulo: 'kg' },
  ml: { fator: 1000, rotulo: 'L' },
  un: { fator: 1, rotulo: 'un' },
};

export function rotuloBase(insumo) {
  return BASE_EXIBICAO[insumo.uso].rotulo;
}

/** Preço por kg, L ou un, a partir do preço da embalagem de compra. */
export function precoPorBase(insumo, precoCompra) {
  return (precoCompra / insumo.compra.qtdUso) * BASE_EXIBICAO[insumo.uso].fator;
}

/** Última compra do histórico, ou null se o insumo ainda não teve compra (ex.: acabou de ser cadastrado). */
export function ultimaCompra(insumo) {
  return insumo.historico[insumo.historico.length - 1] ?? null;
}

// ---- Cadastro (usado pelo módulo de Insumos e Fornecedores) -----------------------------

const porId = new Map(INSUMOS.map((i) => [i.id, i]));
export const buscarInsumo = (id) => porId.get(id) ?? null;
export const insumosAtivos = () => INSUMOS.filter((i) => i.ativo !== false);

export function adicionarInsumo(insumo) {
  INSUMOS.push(insumo);
  porId.set(insumo.id, insumo);
  return insumo;
}

export const buscarFornecedor = (id) => FORNECEDORES.find((f) => f.id === id) ?? null;
export const fornecedoresAtivos = () => FORNECEDORES.filter((f) => f.ativo !== false);

export function adicionarFornecedor(fornecedor) {
  FORNECEDORES.push(fornecedor);
  return fornecedor;
}

/** Variação (em fração) da última compra sobre a anterior. */
export function variacaoUltima(insumo) {
  const h = insumo.historico;
  if (h.length < 2) return 0;
  const anterior = h[h.length - 2].preco;
  return (h[h.length - 1].preco - anterior) / anterior;
}

export function situacao(insumo, limiteVencimentoDias = 7) {
  const { saldo, minimo, validadeEmDias } = insumo.estoque;
  return {
    abaixoDoMinimo: saldo < minimo,
    venceEmBreve: validadeEmDias !== null && validadeEmDias <= limiteVencimentoDias,
  };
}
