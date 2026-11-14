// Regras do cadastro de insumos e fornecedores. Módulo puro (sem navegador): valida, monta o registro
// e sugere o preenchimento a partir de um item de nota. Quem confirma é sempre a pessoa (RN-006).

import { INSUMOS, FORNECEDORES, adicionarInsumo, adicionarFornecedor } from './dados.js';
import { normalizar, tamanhoDaDescricao, pontuarInsumo, NIVEL_ALTO } from './vinculo.js';

// Como a embalagem é medida: quantas g, mL ou un valem 1 da unidade escolhida.
export const UNIDADES_DE_EMBALAGEM = {
  g: [{ id: 'kg', rotulo: 'kg', fator: 1000 }, { id: 'g', rotulo: 'g', fator: 1 }],
  ml: [{ id: 'l', rotulo: 'L', fator: 1000 }, { id: 'ml', rotulo: 'mL', fator: 1 }],
  un: [{ id: 'un', rotulo: 'un', fator: 1 }],
};
export const NOME_DO_CONTROLE = { g: 'Peso (kg e g)', ml: 'Volume (L e mL)', un: 'Unidades' };

export const TIPOS_DE_FORNECEDOR = ['Atacado', 'Distribuidora', 'Mercado', 'Frutaria', 'Padaria ou confeitaria', 'Compras pequenas', 'Outro'];
export const COMPROVANTES = ['XML por e-mail', 'Cupom fiscal', 'Recibo', 'Recibo ou nada', 'Sem comprovante'];

const PREFIXO_EMBALAGEM = { SC: 'Saco', FD: 'Fardo', CX: 'Caixa', PCT: 'Pacote', PC: 'Pacote', PT: 'Pacote', BJ: 'Bandeja', CT: 'Cartela', FR: 'Frasco' };

export const apenasDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const arredondar = (v, casas = 3) => Math.round(v * 10 ** casas) / 10 ** casas;
const juntarEspacos = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

function idUnico(nome, existentes) {
  const base = normalizar(nome).toLowerCase().replace(/ /g, '-').slice(0, 40) || 'novo';
  let id = base;
  for (let n = 2; existentes.some((e) => e.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

/** "farinha de trigo" → "Farinha de Trigo" (preposições ficam em minúscula). */
export function nomeLegivel(texto) {
  const pequenas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em']);
  return juntarEspacos(texto).toLowerCase().split(' ')
    .map((p, i) => (i > 0 && pequenas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

function rotuloDaEmbalagem(uso, base, prefixo) {
  const medida = uso === 'un' ? `${base} un`
    : base >= 1000 ? `${arredondar(base / 1000)} ${uso === 'g' ? 'kg' : 'L'}`.replace('.', ',') : `${base} ${uso === 'g' ? 'g' : 'mL'}`;
  return prefixo ? `${prefixo} ${medida}` : medida;
}

// ---- Insumo -----------------------------------------------------------------------------

/**
 * Sugere o preenchimento do cadastro a partir de um item lido da nota. Nunca grava: só preenche o formulário.
 * @returns {{ nome, categoria, subgrupo, uso, qtdEmb, unidadeEmb, rotuloEmb, fornecedorId, apelidos, eans, aviso }}
 */
export function sugerirCadastro(item, fornecedorId = '') {
  const un = String(item.unidade ?? '').toUpperCase();
  const tam = tamanhoDaDescricao(item.descricao);
  // O nome sugerido não leva o tamanho nem a embalagem ("LEITE EM PO SC 25KG" → "Leite em Po"); a descrição original vira apelido.
  const semTamanho = juntarEspacos(String(item.descricao ?? '')
    .replace(/\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:KG|G|GR|ML|L|LT)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:KG|G|GR|ML|L|LT|UN|UND|UNID)\b/gi, ' ')
    .replace(/\b(?:SC|FD|CX|PCT|PC|PT|BJ|CT|FR)\b/gi, ' ')) || juntarEspacos(item.descricao);
  const base = { nome: nomeLegivel(semTamanho), categoria: '', subgrupo: '', fornecedorId, apelidos: [], eans: item.ean ? [item.ean] : [] };
  const descricaoBruta = juntarEspacos(item.descricao);
  if (normalizar(descricaoBruta) !== normalizar(base.nome)) base.apelidos.push(descricaoBruta);

  const porPeso = { KG: 'g', G: 'g', L: 'ml', LT: 'ml', ML: 'ml' }[un];
  if (porPeso) {
    const unidadeEmb = { KG: 'kg', G: 'g', L: 'l', LT: 'l', ML: 'ml' }[un];
    return { ...base, uso: porPeso, qtdEmb: 1, unidadeEmb, rotuloEmb: { KG: 'Kg', G: 'g', L: 'L', LT: 'L', ML: 'mL' }[un], aviso: 'A nota vende por medida: confira se é assim que a padaria compra.' };
  }
  if (tam) {
    const uso = { massa: 'g', volume: 'ml', contagem: 'un' }[tam.dim];
    const unidadeEmb = uso === 'g' ? (tam.base >= 1000 ? 'kg' : 'g') : uso === 'ml' ? (tam.base >= 1000 ? 'l' : 'ml') : 'un';
    const fator = UNIDADES_DE_EMBALAGEM[uso].find((u) => u.id === unidadeEmb).fator;
    return { ...base, uso, qtdEmb: arredondar(tam.base / fator), unidadeEmb, rotuloEmb: rotuloDaEmbalagem(uso, tam.base, PREFIXO_EMBALAGEM[un] ?? 'Embalagem'), aviso: 'O tamanho foi lido da descrição da nota: confira.' };
  }
  return { ...base, uso: 'un', qtdEmb: 1, unidadeEmb: 'un', rotuloEmb: 'Unidade', aviso: 'A nota não diz o tamanho da embalagem: informe quanto vem em cada uma.' };
}

/** Insumos ativos com nome ou apelido muito parecido com o digitado (para avisar antes de duplicar). */
export function insumosParecidos(nome, ignorarId = null) {
  const alvo = normalizar(nome);
  if (!alvo) return [];
  return INSUMOS.filter((i) => i.ativo !== false && i.id !== ignorarId)
    .map((i) => ({ insumo: i, igual: normalizar(i.nome) === alvo, score: pontuarInsumo(nome, i) }))
    .filter((x) => x.igual || x.score >= NIVEL_ALTO)
    .sort((a, b) => Number(b.igual) - Number(a.igual) || b.score - a.score);
}

const listaDe = (texto) => [...new Set(String(texto ?? '').split(/[,;\n]/).map(juntarEspacos).filter(Boolean))];

/**
 * Valida o formulário de insumo e devolve { erro, campo } ou { dados }.
 * `dados` já está na unidade de controle (g, mL ou un), pronto para virar insumo.
 */
export function validarInsumo(f, { ignorarId = null } = {}) {
  const nome = juntarEspacos(f.nome);
  if (!nome) return { erro: 'Informe o nome do insumo.', campo: 'nome' };
  const categoria = juntarEspacos(f.categoria);
  if (!categoria) return { erro: 'Informe a categoria (ex.: Farinhas e amidos).', campo: 'categoria' };
  if (!UNIDADES_DE_EMBALAGEM[f.uso]) return { erro: 'Escolha como o insumo é controlado.', campo: 'uso' };
  const unidade = UNIDADES_DE_EMBALAGEM[f.uso].find((u) => u.id === f.unidadeEmb) ?? UNIDADES_DE_EMBALAGEM[f.uso][0];
  const qtd = Number(String(f.qtdEmb).replace(',', '.'));
  if (!(qtd > 0)) return { erro: 'Informe quanto vem em cada embalagem (maior que zero).', campo: 'qtdEmb' };
  const duplicado = INSUMOS.find((i) => i.id !== ignorarId && i.ativo !== false && normalizar(i.nome) === normalizar(nome));
  if (duplicado) return { erro: `Já existe um insumo chamado "${duplicado.nome}". Use o que já existe ou dê um nome diferente.`, campo: 'nome' };
  const qtdUso = arredondar(qtd * unidade.fator);
  return {
    dados: {
      nome, categoria, subgrupo: juntarEspacos(f.subgrupo) || 'Outros',
      uso: f.uso, qtdUso, rotuloEmb: juntarEspacos(f.rotuloEmb) || rotuloDaEmbalagem(f.uso, qtdUso, ''),
      fornecedorId: f.fornecedorId || null, apelidos: listaDe(f.apelidos), eans: listaDe(f.eans).map(apenasDigitos).filter(Boolean),
    },
  };
}

/** Cria o insumo (sem estoque, sem validade e sem histórico de preço) e o coloca no cadastro. */
export function cadastrarInsumo(dados) {
  return adicionarInsumo({
    ativo: true, id: idUnico(dados.nome, INSUMOS), nome: dados.nome, categoria: dados.categoria, subgrupo: dados.subgrupo,
    compra: { rotulo: dados.rotuloEmb, qtdUso: dados.qtdUso }, uso: dados.uso, apelidos: dados.apelidos, eans: dados.eans,
    fornecedorPrincipal: dados.fornecedorId,
    estoque: { saldo: 0, minimo: 0, validadeEmDias: null },
    historico: [],
    novo: true, // marca "cadastrado agora" na tela, para a pessoa lembrar de revisar
  });
}

/** Altera um insumo. Não mexe em estoque nem histórico. */
export function atualizarInsumo(insumo, dados) {
  Object.assign(insumo, {
    nome: dados.nome, categoria: dados.categoria, subgrupo: dados.subgrupo, uso: dados.uso,
    compra: { rotulo: dados.rotuloEmb, qtdUso: dados.qtdUso }, apelidos: dados.apelidos, eans: dados.eans, fornecedorPrincipal: dados.fornecedorId,
  });
  return insumo;
}

/** Dá para trocar a unidade de controle? Não, se já há saldo ou compra: os números antigos perderiam o sentido. */
export const podeTrocarControle = (insumo) => insumo.estoque.saldo === 0 && insumo.historico.length === 0;

// ---- Fornecedor -------------------------------------------------------------------------

/** Procura o fornecedor ativo ou inativo pelo CNPJ/CPF (só dígitos). */
export function acharFornecedorPorDocumento(documento) {
  const d = apenasDigitos(documento);
  return d ? FORNECEDORES.find((f) => apenasDigitos(f.documento) === d) ?? null : null;
}

/** Fornecedor cadastrado a que uma nota pertence: pelo CNPJ/CPF; sem ele (foto), só por nome exatamente igual. */
export function acharFornecedorDaNota(emitente) {
  const porDocumento = acharFornecedorPorDocumento(emitente?.documento);
  if (porDocumento) return porDocumento;
  if (apenasDigitos(emitente?.documento) || !emitente?.nome) return null;
  return FORNECEDORES.find((f) => f.ativo !== false && normalizar(f.nome) === normalizar(emitente.nome)) ?? null;
}

export function validarFornecedor(f, { ignorarId = null } = {}) {
  const nome = juntarEspacos(f.nome);
  if (!nome) return { erro: 'Informe o nome do fornecedor.', campo: 'nome' };
  const documento = apenasDigitos(f.documento);
  if (documento && documento.length !== 11 && documento.length !== 14) return { erro: 'O CNPJ tem 14 números e o CPF tem 11. Confira ou deixe em branco.', campo: 'documento' };
  const mesmoDocumento = documento && FORNECEDORES.find((x) => x.id !== ignorarId && apenasDigitos(x.documento) === documento);
  if (mesmoDocumento) return { erro: `Este CNPJ/CPF já está cadastrado em "${mesmoDocumento.nome}".`, campo: 'documento' };
  const mesmoNome = FORNECEDORES.find((x) => x.id !== ignorarId && x.ativo !== false && normalizar(x.nome) === normalizar(nome));
  if (mesmoNome) return { erro: `Já existe um fornecedor chamado "${mesmoNome.nome}".`, campo: 'nome' };
  return {
    dados: {
      nome, documento, tipo: juntarEspacos(f.tipo) || 'Outro', comprovante: juntarEspacos(f.comprovante) || 'Sem comprovante',
      telefone: juntarEspacos(f.telefone), contato: juntarEspacos(f.contato), prazo: juntarEspacos(f.prazo),
    },
  };
}

export function cadastrarFornecedor(dados) {
  return adicionarFornecedor({ ativo: true, id: idUnico(dados.nome, FORNECEDORES), novo: true, ...dados });
}

export function atualizarFornecedor(fornecedor, dados) {
  return Object.assign(fornecedor, dados);
}
