// Ligação entre o item da nota e o insumo cadastrado, e conversão de unidades.
// Módulo puro (sem navegador). Tudo aqui é SUGESTÃO: quem confirma é a pessoa (RN-006).

const PARADAS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'PARA', 'EM', 'NA', 'NO', 'TIPO', 'FLV', 'GRANEL',
  'KG', 'G', 'GR', 'MG', 'L', 'LT', 'ML', 'UN', 'UND', 'UNID', 'PCT', 'PC', 'CX', 'FD', 'SC', 'BJ', 'DZ',
]);

export const IGNORAR = '__ignorar__';

export function normalizar(texto) {
  return String(texto).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Palavras que distinguem o produto: sem preposições, unidades nem números (ex.: "25KG", "2L"). */
export function palavras(texto) {
  return normalizar(texto).split(' ').filter((t) => t.length >= 2 && !PARADAS.has(t) && !/\d/.test(t));
}

// "MUSS" vale por "MUSSARELA", "BIOL" por "BIOLOGICO": abreviação = começo da palavra (4+ letras).
const iguais = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

function pontuarAlvo(palavrasNota, palavrasAlvo) {
  if (!palavrasNota.length || !palavrasAlvo.length) return 0;
  const usadas = new Set();
  let acertos = 0;
  for (const p of palavrasAlvo) {
    const i = palavrasNota.findIndex((n, k) => !usadas.has(k) && iguais(n, p));
    if (i >= 0) { usadas.add(i); acertos += 1; }
  }
  const cobertura = acertos / palavrasAlvo.length; // quanto do nome do insumo aparece na nota
  const precisao = acertos / palavrasNota.length; // quanto da nota é explicado pelo insumo
  return cobertura * (0.6 + 0.4 * precisao);
}

export function pontuarInsumo(descricao, insumo) {
  const nota = palavras(descricao);
  return Math.max(...[insumo.nome, ...(insumo.apelidos ?? [])].map((alvo) => pontuarAlvo(nota, palavras(alvo))));
}

/** Chave para lembrar a escolha: mesmo fornecedor + mesmo código (ou, sem código, mesmo nome). */
export function chaveMemoria(fornecedor, item) {
  return `${normalizar(fornecedor || 'sem-fornecedor')}|${item.ean || item.codigo || normalizar(item.descricao)}`;
}

export const NIVEL_ALTO = 0.75;
export const NIVEL_MEDIO = 0.5;

/**
 * @returns {{ chave: string, candidatos: {id: string, score: number}[], sugestao: null | {tipo: 'insumo'|'ignorar', id?: string, nivel: 'alta'|'media', motivo: 'lembrado'|'codigo'|'nome'|'ambiguo'} }}
 */
export function sugerir(item, insumos, memoria, fornecedor) {
  const chave = chaveMemoria(fornecedor, item);
  const candidatos = insumos
    .map((i) => ({ id: i.id, score: pontuarInsumo(item.descricao, i) }))
    .sort((a, b) => b.score - a.score);

  const lembrado = memoria.get(chave);
  if (lembrado === IGNORAR) return { chave, candidatos, sugestao: { tipo: 'ignorar', nivel: 'alta', motivo: 'lembrado' } };
  if (lembrado && insumos.some((i) => i.id === lembrado)) return { chave, candidatos, sugestao: { tipo: 'insumo', id: lembrado, nivel: 'alta', motivo: 'lembrado' } };

  if (item.ean) {
    const porCodigo = insumos.find((i) => i.eans?.includes(item.ean));
    if (porCodigo) return { chave, candidatos, sugestao: { tipo: 'insumo', id: porCodigo.id, nivel: 'alta', motivo: 'codigo' } };
  }

  const [melhor, segundo] = candidatos;
  if (melhor && melhor.score >= NIVEL_MEDIO) {
    // Dois insumos igualmente parecidos (ex.: a nota diz só "AÇÚCAR" e há refinado, cristal e de confeiteiro):
    // o piloto não decide sozinho, pede para a pessoa escolher.
    const empate = Boolean(segundo) && segundo.score >= NIVEL_MEDIO && melhor.score - segundo.score < 0.05;
    return {
      chave, candidatos,
      sugestao: { tipo: 'insumo', id: melhor.id, nivel: empate || melhor.score < NIVEL_ALTO ? 'media' : 'alta', motivo: empate ? 'ambiguo' : 'nome' },
    };
  }
  return { chave, candidatos, sugestao: null };
}

// ---- Conversão de unidades ----------------------------------------------------------

const FISICAS = {
  KG: { dim: 'massa', fator: 1000 }, G: { dim: 'massa', fator: 1 },
  L: { dim: 'volume', fator: 1000 }, LT: { dim: 'volume', fator: 1000 }, ML: { dim: 'volume', fator: 1 },
};
const DIMENSAO_DO_USO = { g: 'massa', ml: 'volume', un: 'contagem' };
const EMBALAGENS = new Set(['SC', 'FD', 'CX', 'BJ', 'PCT', 'PC', 'PT', 'CT', 'FR']);
const NOME_DA_UNIDADE = { g: 'g', ml: 'mL', un: 'un' };

const paraNumero = (t) => Number(String(t).replace(',', '.'));

/** Tamanho de UMA embalagem, lido da descrição: "SC 25KG", "CX 24X200G", "BANDEJA 30UN". */
export function tamanhoDaDescricao(descricao) {
  const d = String(descricao);
  let m = /(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(KG|G|ML|L)\b/i.exec(d);
  if (m) { const f = FISICAS[m[3].toUpperCase()]; return { dim: f.dim, base: Number(m[1]) * paraNumero(m[2]) * f.fator }; }
  m = /(\d+(?:[.,]\d+)?)\s*(KG|G|ML|L)\b/i.exec(d);
  if (m) { const f = FISICAS[m[2].toUpperCase()]; return { dim: f.dim, base: paraNumero(m[1]) * f.fator }; }
  m = /(\d+)\s*(?:UN|UND|UNID)\b/i.exec(d);
  if (m) return { dim: 'contagem', base: Number(m[1]) };
  return null;
}

/**
 * Quanto do item da nota entra no estoque, na unidade de controle do insumo (g, mL ou un).
 * @returns {{ qtdUso: number|null, confianca: 'certa'|'assumida'|'incompativel', texto: string }}
 */
export function converterQuantidade(item, insumo) {
  const un = (item.unidade || '').toUpperCase();
  const dimUso = DIMENSAO_DO_USO[insumo.uso];
  const q = item.quantidade;
  const unidadeUso = NOME_DA_UNIDADE[insumo.uso];
  const embalagem = insumo.compra.rotulo;

  if (FISICAS[un]) {
    if (FISICAS[un].dim !== dimUso) {
      return { qtdUso: null, confianca: 'incompativel', texto: `A nota está em ${un}, mas este insumo é controlado em ${unidadeUso}. Digite a quantidade.` };
    }
    return { qtdUso: q * FISICAS[un].fator, confianca: 'certa', texto: `Quantidade da nota (${un}).` };
  }

  const tam = tamanhoDaDescricao(item.descricao);
  if (tam && tam.dim === dimUso) {
    const diferente = Math.abs(tam.base - insumo.compra.qtdUso) > 0.5 && EMBALAGENS.has(un);
    return {
      qtdUso: q * tam.base, confianca: 'certa',
      texto: `${q} ${un || 'un'} × ${tam.base} ${unidadeUso} (tamanho da descrição)${diferente ? `. Atenção: o cadastro diz "${embalagem}".` : '.'}`,
    };
  }

  if (dimUso === 'contagem' && !EMBALAGENS.has(un)) {
    const pacote = insumo.compra.qtdUso > 1;
    return {
      qtdUso: q, confianca: pacote ? 'assumida' : 'certa',
      texto: pacote ? `Contei ${q} ${q === 1 ? 'unidade' : 'unidades'}. Se a nota vende em "${embalagem}", corrija.` : 'Unidades.',
    };
  }

  // Embalagem (SC, FD, CX...) ou unidade sem tamanho na descrição: usa o tamanho do cadastro.
  return {
    qtdUso: q * insumo.compra.qtdUso, confianca: 'assumida',
    texto: `${q} ${un || 'un'} × "${embalagem}" (do cadastro). Confirme a quantidade.`,
  };
}
