// Interpreta o TEXTO de uma nota (vindo de PDF ou de OCR de foto) e tenta achar itens e totais.
// Módulo puro: não usa o navegador, para poder ser testado fora da tela.
//
// A regra que vale para qualquer layout: uma linha é um item quando
//   quantidade × valor unitário = valor total.
// O total do rodapé da nota é a segunda conferência.
// Tudo o que sai daqui é "leitura experimental" e precisa de conferência humana (RN-006).

const DIN = String.raw`(?<![\d.,])-?(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)`;
const QTD = String.raw`\d+(?:[.,]\d{1,4})?`;
// Unidades, incluindo leituras comuns do OCR (kg → k9, ka, k6; UN → UNb, UNk).
const UNID = String.raw`(?:kg|k[9a6q]g?|g|un[dbk]?|pc|pct|cx|fd|sc|bj|dz|pr|lt|ml|l|m)`;
const JUNK = String.raw`(?:\s+[^\d\s]{1,3}){0,2}`; // sobras do OCR no fim da linha

const reDin = new RegExp(DIN, 'g');
const reItemCompleto = new RegExp(String.raw`^(?<head>.*?)\s*(?<q>${QTD})\s*(?<un>${UNID})\s*[xX]?\s+(?<u>${DIN})\s*(?:[A-Za-z]{1,2}\s+)?(?<t>${DIN})\s*[A-Za-z]?${JUNK}\s*$`, 'i');
const reItemSemTotal = new RegExp(String.raw`^(?<head>.*?)\s*(?<q>${QTD})\s*(?<un>${UNID})\s*[xX]?\s+(?<u>${DIN})\s*[A-Za-z]{0,2}${JUNK}\s*$`, 'i');
const reItemSemUnidade = new RegExp(String.raw`^(?<head>.*?)\s+(?<q>${QTD})\s+(?<u>${DIN})\s+(?<t>${DIN})${JUNK}\s*$`, 'i');

// DANFE completo (NF-e em A4): código, descrição, NCM, CST, CFOP, UN, quantidade, valor unitário, total, impostos...
const reDanfeCompleto = new RegExp(String.raw`^(?<code>[A-Za-z0-9.\-]+)\s+(?<head>.+?)\s+(?<ncm>\d{8})\s+\d{2,4}\s+\d{4}\s+(?<un>${UNID})\s+(?<q>\d{1,3}(?:\.\d{3})*,\d{2,4})\s+(?<u>\d{1,3}(?:\.\d{3})*,\d{2,4})\s+(?<t>${DIN})`, 'i');

const PALAVRAS_DE_RODAPE =/total|valor|forma|qtd|itens|consulte|chave|consumidor|desconto|liquido|líquido|ncm|cest|protocolo|tribut|pagamento|cart[aã]o|troco|cpf|cnpj|documento|danfe|n[uú]mero|s[eé]rie|emiss|autoriza|operador|sefaz|icms/i;

// ---- Números ------------------------------------------------------------------

function paraNumero(texto) {
  const t = texto.replace(/\s/g, '');
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : null;
}

const centavos = (v) => Math.round((v ?? 0) * 100);
const arredondar = (v) => Math.round(v * 100) / 100;

function normalizarUnidade(un) {
  const u = un.toLowerCase();
  if (/^k[g9a6q]g?$/.test(u)) return 'KG';
  if (/^un[dbk]?$/.test(u)) return 'UN';
  return u.toUpperCase();
}

const todosOsValores = (linha) => [...linha.matchAll(reDin)].map((m) => paraNumero(m[0])).filter((v) => v !== null);

// ---- Itens --------------------------------------------------------------------

// Letras que o OCR costuma trocar por algarismos (O→0, l→1, S→5...). Só para reconhecer um CÓDIGO corrompido.
const PARECE_ALGARISMO = { o: '0', c: '0', q: '0', d: '0', n: '0', i: '1', l: '1', '|': '1', z: '2', a: '4', s: '5', b: '6', g: '6', t: '7' };
const comoDigitos = (t) => [...t].map((ch) => (/\d/.test(ch) ? ch : PARECE_ALGARISMO[ch.toLowerCase()] ?? '')).join('');
// Palavra comum (DISCO, CASA) também usa essas letras, por isso exige ao menos um algarismo de verdade.
const ehCodigoCorrompido = (t) => {
  const reais = (t.match(/\d/g) ?? []).length;
  return comoDigitos(t).length === t.length && ((t.length >= 6 && reais >= 2) || (t.length >= 8 && reais >= 1));
};

function limparCabecaDoItem(head) {
  let h = head.replace(/^[\s|—–\-_.:;,*~'"`´+]+/, '').replace(/[\s|—–\-_.:;,*~'"`´+]+$/, '');
  let codigo = '';
  let m;
  if ((m = /^(\d{1,3})\s+(?:\d{3}-)?(\d{4,14})\s+(.*)$/.exec(h))) { codigo = m[2]; h = m[3]; }
  else if ((m = /^(\d{4,14})\s+(.*)$/.exec(h))) { codigo = m[1]; h = m[2]; }
  else {
    // Código lido com erro: "Q1 000052483 — ALLEGRA", "62 coco4as52 RINUSORO" (número do item + código)
    const partes = h.split(' ');
    let cortar = 0;
    if (partes.length > 2 && partes[0].length <= 3 && ehCodigoCorrompido(partes[1].replace(/[^A-Za-z0-9|]/g, ''))) cortar = 2;
    else if (partes.length > 1 && ehCodigoCorrompido(partes[0].replace(/[^A-Za-z0-9|]/g, ''))) cortar = 1;
    if (cortar) { codigo = comoDigitos(partes[cortar - 1].replace(/[^A-Za-z0-9|]/g, '')); h = partes.slice(cortar).join(' '); }
  }
  h = h.replace(/\s+/g, ' ').replace(/^[\s|—–\-_.]+/, '').trim();
  return { codigo, descricao: h };
}

const ehLinhaDeCodigo = (l) => /^\d{1,3}\s+[\d-]{6,}$/.test(l.trim());
const ehSeparador = (l) => /^[-=_.\s]{4,}$/.test(l.trim());

function tentarItem(linha, proxima) {
  const d = reDanfeCompleto.exec(linha);
  if (d) {
    const q = paraNumero(d.groups.q);
    const u = paraNumero(d.groups.u);
    const t = paraNumero(d.groups.t);
    if (q > 0 && u > 0 && t !== null) {
      return {
        codigo: d.groups.code, descricao: d.groups.head.replace(/\s+/g, ' ').trim(), unidade: normalizarUnidade(d.groups.un),
        quantidade: q, valorUnitario: u, valorProduto: t, desconto: 0, ean: '', ncm: d.groups.ncm,
        calculado: false, suspeito: Math.abs(q * u - t) > 0.02 + 0.002 * t, consumiuProxima: false, limiteContinuacao: 2,
      };
    }
  }
  let m = reItemCompleto.exec(linha);
  let tipo = 'completo';
  if (!m) { m = reItemSemTotal.exec(linha); tipo = 'sem-total'; }
  if (!m) { m = reItemSemUnidade.exec(linha); tipo = 'sem-unidade'; }
  if (!m) return null;
  const g = m.groups;
  const q = paraNumero(g.q);
  const u = paraNumero(g.u);
  if (q === null || u === null || q <= 0 || u <= 0) return null;

  let t = g.t ? paraNumero(g.t) : null;
  let calculado = false;
  if (t === null) {
    // O total veio na linha de baixo (ex.: cupom de farmácia) ou se perdeu: usa a linha de baixo se bater, senão calcula.
    const abaixo = proxima && /^\s*[^\w]*(-?\d[\d.,]*)\s*$/.test(proxima) ? paraNumero(proxima.replace(/[^\d.,-]/g, '')) : null;
    t = abaixo !== null && Math.abs(abaixo - q * u) <= 0.02 + 0.002 * q * u ? abaixo : arredondar(q * u);
    calculado = !(abaixo !== null && Math.abs(abaixo - q * u) <= 0.02 + 0.002 * q * u);
  }
  const confere = Math.abs(q * u - t) <= 0.02 + 0.002 * t;
  if (tipo === 'sem-unidade' && !confere) return null; // sem unidade, só aceita se a conta fechar

  const { codigo, descricao } = limparCabecaDoItem(g.head ?? '');
  return {
    codigo,
    descricao,
    unidade: g.un ? normalizarUnidade(g.un) : '',
    quantidade: q,
    valorUnitario: u,
    valorProduto: t,
    desconto: 0,
    ean: '',
    ncm: '',
    calculado,
    suspeito: !confere && !calculado,
    consumiuProxima: tipo === 'sem-total' && !calculado,
  };
}

// Linha que começa com código de produto mas que não consegui ler como item (OCR corrompeu os números).
const pareceItemNaoLido = (l) =>
  /^[^A-Za-z0-9]{0,4}[A-Za-z]?\d{6,14}\s+\S/.test(l) && /[A-Za-zÀ-ú]{3,}/.test(l) && !PALAVRAS_DE_RODAPE.test(l) && !ehLinhaDeCodigo(l);

function lerItens(linhas) {
  const itens = [];
  const ignoradas = [];
  const consumidas = new Set(); // linhas já usadas como continuação do nome de um item
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (consumidas.has(i) || ehSeparador(linha) || ehLinhaDeCodigo(linha)) continue;
    const item = tentarItem(linha, linhas[i + 1] ?? '');
    if (!item) {
      if (pareceItemNaoLido(linha)) ignoradas.push(linha.replace(/^[^A-Za-z0-9]+/, ''));
      continue;
    }

    // Descrição em linhas anteriores (layout em que o nome vem acima dos números)
    if (!item.descricao || item.descricao.length < 3) {
      const antes = [];
      let codigo = item.codigo;
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
        const l = linhas[k];
        if (ehSeparador(l)) break;
        if (ehLinhaDeCodigo(l)) { codigo = codigo || (/(\d{4,14})$/.exec(l.trim())?.[1] ?? ''); break; }
        if (/^ncm/i.test(l.trim())) continue;
        if (todosOsValores(l).length > 0 || PALAVRAS_DE_RODAPE.test(l)) break;
        antes.unshift(l);
      }
      item.descricao = antes.join(' ').replace(/\s+/g, ' ').trim();
      item.codigo = codigo;
    }

    // Continuação da descrição e sobras nas linhas de baixo (desconto, valor líquido).
    // No máximo 2 linhas viram continuação do nome, para não engolir texto de rodapé.
    let j = i + 1;
    let anexadas = 0;
    const maxAnexar = item.limiteContinuacao ?? 2;
    for (let passos = 0; passos < 5 && j < linhas.length; passos++, j++) {
      const l = linhas[j];
      if (tentarItem(l, linhas[j + 1] ?? '')) break;
      if (ehSeparador(l)) break;
      const deixar = /^\s*[^\w]*-?\d[\d.,]*\s*$/.test(l); // número solto: total do item
      const mDePor = new RegExp(String.raw`\bde\s+(${DIN})\s+por\s+(${DIN})`, 'i').exec(l);
      // Um desconto só vale se for menor que o preço do item (senão é erro de leitura).
      const descontoValido = (d) => d !== null && d > 0 && d < item.valorProduto;
      if (mDePor) { const d = arredondar(paraNumero(mDePor[1]) - paraNumero(mDePor[2])); if (descontoValido(d)) item.desconto = d; continue; }
      if (/desconto/i.test(l) && todosOsValores(l).length > 0 && !/total|r\$\s*$/i.test(l.replace(/desconto/i, ''))) {
        const d = Math.abs(todosOsValores(l)[0]);
        if (descontoValido(d)) item.desconto = d;
        continue;
      }
      const neg = /(?:^|\s)-\s?(\d+[.,]\d{2})(?!\d)/.exec(l);
      if (neg && item.desconto === 0 && !PALAVRAS_DE_RODAPE.test(l.replace(/desconto/i, ''))) { const d = paraNumero(neg[1]); if (descontoValido(d)) item.desconto = d; continue; }
      if (deixar) continue;
      if (/liquido|líquido/i.test(l)) continue;
      if (PALAVRAS_DE_RODAPE.test(l) || todosOsValores(l).length > 0) break;
      if (anexadas < maxAnexar && l.length <= 45 && (l.match(/[A-Za-zÀ-ú]/g) ?? []).length >= 3) {
        let extra = l.replace(/^\d{4,}\s+/, '').trim();
        const fim = /\s([A-Za-z]{2,3})$/.exec(extra);
        if (!item.unidade && fim && /^(un|pc|kg|cx|fd|sc|bj|dz|pr|lt|ml)$/i.test(fim[1])) { item.unidade = fim[1].toUpperCase(); extra = extra.slice(0, -fim[0].length); }
        item.descricao = `${item.descricao} ${extra}`.replace(/\s+/g, ' ').trim();
        anexadas += 1;
        consumidas.add(j);
      } else break;
    }
    delete item.consumiuProxima;
    delete item.limiteContinuacao;
    itens.push(item);
  }
  return { itens, ignoradas };
}

// ---- Totais -------------------------------------------------------------------

/**
 * Valor que acompanha um rótulo. Duas formas de layout:
 *  - rótulo e valor na mesma linha ("Valor total R$ 213,72");
 *  - tabela (DANFE em A4): rótulos numa linha e os valores na de baixo, na mesma ordem.
 *    Aí só dá para acertar quando o rótulo é o primeiro ou o último da linha.
 */
function valorDaLinha(linhas, i, regex) {
  const aqui = todosOsValores(linhas[i]);
  if (aqui.length) return aqui[aqui.length - 1];
  const abaixo = todosOsValores(linhas[i + 1] ?? '');
  if (abaixo.length === 0) return null;
  if (abaixo.length === 1) return abaixo[0];
  const m = regex ? regex.exec(linhas[i]) : null;
  if (!m) return null;
  if (m.index === 0 || /^\s*$/.test(linhas[i].slice(0, m.index))) return abaixo[0];
  if (/^[\s:]*$/.test(linhas[i].slice(m.index + m[0].length))) return abaixo[abaixo.length - 1];
  return null;
}

function lerTotais(linhas) {
  const t = { produtos: null, desconto: null, frete: null, seguro: null, candidatosNota: [] };
  linhas.forEach((l, i) => {
    const x = l.replace(/\s+/g, ' ');
    const rProd = /valor\s+total\s+dos\s+produtos|total\s+dos\s+produtos|valor\s+itens(?:\s+r\$)?/i;
    const rFrete = /valor\s+do\s+frete|^frete\b/i;
    const rSeguro = /valor\s+do\s+seguro/i;
    const rNota = /valor\s+total\s+da\s+nota|total\s+da\s+nota|valor\s+total\s+da\s+nf/i;
    // Numa tabela de DANFE, uma mesma linha de rótulos pode ter "frete" no começo e "total da nota" no fim:
    // por isso cada rótulo é testado separadamente, sem parar no primeiro.
    let achouRotulo = false;
    if (rProd.test(x)) { t.produtos ??= valorDaLinha(linhas, i, rProd); achouRotulo = true; }
    if (rFrete.test(x)) { t.frete ??= valorDaLinha(linhas, i, rFrete); achouRotulo = true; }
    if (rSeguro.test(x)) { t.seguro ??= valorDaLinha(linhas, i, rSeguro); achouRotulo = true; }
    if (/valor\s+(?:total\s+)?(?:do\s+)?desconto|^desconto\s*r?\$|desconto\s+r\$/i.test(x) && !/total\s+de\s+itens/i.test(x)) { t.desconto ??= valorDaLinha(linhas, i); achouRotulo = true; }
    if (rNota.test(x)) { const v = valorDaLinha(linhas, i, rNota); if (v !== null) t.candidatosNota.push(v); achouRotulo = true; }
    if (achouRotulo) return;
    if (/pagar/i.test(x) || /valor\s+total\s*(?:r\$)?/i.test(x) || /total\s+r\$/i.test(x)) {
      if (/total\s+de\s+itens|qtd|qtde/i.test(x)) return;
      const v = valorDaLinha(linhas, i);
      if (v !== null) t.candidatosNota.push(v);
    }
  });
  return t;
}

function conferir(itens, t) {
  const bruta = itens.reduce((s, i) => s + centavos(i.valorProduto), 0) / 100;
  const liquida = itens.reduce((s, i) => s + centavos(i.valorProduto - i.desconto), 0) / 100;
  const descItens = itens.reduce((s, i) => s + centavos(i.desconto), 0) / 100;
  const descGlobal = t.desconto ?? 0;
  const frete = t.frete ?? 0;
  const seguro = t.seguro ?? 0;
  const igual = (a, b) => b !== null && b !== undefined && Math.abs(centavos(a) - centavos(b)) <= 1;

  const tentativas = [];
  if (t.produtos !== null) tentativas.push({ regra: 'produtos', soma: bruta, alvo: t.produtos });
  for (const nota of t.candidatosNota) {
    tentativas.push({ regra: 'bruta', soma: bruta, alvo: nota });
    tentativas.push({ regra: 'liquida', soma: liquida, alvo: nota });
    if (descGlobal > 0 && descItens === 0) tentativas.push({ regra: 'liquida', soma: arredondar(bruta - descGlobal), alvo: nota });
    if (frete || seguro) tentativas.push({ regra: 'frete', soma: arredondar(liquida + frete + seguro), alvo: nota, somaItens: liquida });
  }
  const achou = tentativas.find((x) => igual(x.soma, x.alvo));
  if (achou) {
    return {
      somaItens: achou.somaItens ?? achou.soma, totalProdutos: achou.alvo, confere: true, regra: achou.regra,
      notaConfirmada: t.candidatosNota.find((n) => igual(achou.soma, n)) ?? null,
    };
  }
  const referencia = t.produtos ?? t.candidatosNota[0] ?? null;
  const somaItens = t.produtos !== null ? bruta : liquida;
  return {
    somaItens, totalProdutos: referencia, confere: false, regra: t.produtos !== null ? 'produtos' : 'liquida', notaConfirmada: null,
    // Quanto falta (positivo) ou sobra (negativo) para chegar ao total: ajuda a ver se há itens não lidos.
    falta: referencia !== null ? arredondar(referencia - somaItens) : null,
  };
}

// ---- Dados da nota ---------------------------------------------------------------

function lerCnpj(linhas) {
  for (const l of linhas) {
    const m = /(\d{2})\s?[.,]?\s?(\d{3})\s?[.,]?\s?(\d{3})\s?\/\s?(\d{4})\s?-?\s?(\d{2})/.exec(l);
    if (m) return m.slice(1).join('');
  }
  return '';
}

function lerNome(linhas) {
  // DANFE em A4 traz o emitente na faixa "RECEBEMOS DE <NOME> OS PRODUTOS CONSTANTES DA NOTA..."
  const recebemos = /RECEBEMOS\s+DE\s+(.+?)\s+OS\s+PRODUTOS/i.exec(linhas.slice(0, 3).join(' '));
  if (recebemos) return recebemos[1].trim();
  // DANFE simplificado traz "Razão social <NOME>"
  for (const l of linhas.slice(0, 30)) {
    const m = /raz[aã]o\s+social\s*:?\s*(.{4,})$/i.exec(l);
    if (m && (m[1].match(/[A-Za-zÀ-ú]/g) ?? []).length >= 4) return m[1].trim();
  }
  const iCnpj = linhas.findIndex((l) => /cnpj/i.test(l));
  // Nome na mesma linha do CNPJ (ex.: "CNPJ: 06.347.409/0188-89 SBF Comercio de Produtos" + "Esportivos Ltda")
  if (iCnpj >= 0) {
    const resto = linhas[iCnpj].replace(/.*?\d{2}[.,]?\d{3}[.,]?\d{3}\s?\/\s?\d{4}\s?-?\s?\d{2}/i, '').replace(/^[\s:.\-–—,]+/, '').trim();
    if (/[A-Za-zÀ-ú]{4,}/.test(resto) && !/\bie\b|i\.e|t\.e/i.test(resto)) {
      const prox = linhas[iCnpj + 1] ?? '';
      const completa = prox.length <= 30 && !/\d/.test(prox) && /^[A-ZÀ-Ú]/.test(prox) ? ` ${prox}` : '';
      return (resto + completa).replace(/\s+/g, ' ').trim();
    }
  }
  const limite = iCnpj >= 0 ? iCnpj : Math.min(linhas.length, 8);
  for (let i = 0; i < limite; i++) {
    const l = linhas[i].replace(/^[^A-Za-zÀ-ú]+/, '').trim();
    const letras = (l.match(/[A-Za-zÀ-ú]/g) ?? []).length;
    if (letras >= 6 && letras / l.length >= 0.7 && !/documento|danfe|auxiliar|cupom/i.test(l)) return l;
  }
  return '';
}

function lerEmissao(linhas) {
  const reData = /(\d{2})\/(\d{2})\/(\d{4})(?:\D{0,6}(\d{2}):(\d{2}))?/;
  const comEmissao = linhas.find((l) => /emiss[aã]o/i.test(l) && reData.test(l));
  const m = reData.exec(comEmissao ?? linhas.find((l) => reData.test(l)) ?? '');
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}${m[4] ? `T${m[4]}:${m[5]}:00` : ''}`;
}

function lerChave(linhas) {
  for (let i = 0; i < linhas.length; i++) {
    const grupos = linhas[i].match(/\b\d{4}\b/g) ?? [];
    if (grupos.length < 4) continue;
    for (const juntar of [1, 2]) {
      const digitos = linhas.slice(i, i + juntar).map((l) => (l.match(/\b\d{4}\b/g) ?? []).join('')).join('');
      if (digitos.length === 44) return digitos;
    }
  }
  return '';
}

// ---- Classificação -----------------------------------------------------------------

const SINAIS_DE_NOTA = /danfe|docu\w*\s+auxiliar|nfc-?e\b|nfce|nota\s+fiscal\s+de\s+consum|cupom\s+fiscal|sefaz/i;

// Documentos que NÃO são nota de compra de mercadoria. Olha só o cabeçalho (primeiras linhas),
// para um cupom comum que cita "pagamento" no rodapé não ser confundido com eles.
function classificarPeloCabecalho(linhas) {
  const cab = linhas.slice(0, 14).join(' ');
  if (/dacte|conhecimento\s+de\s+transporte/i.test(cab)) return { tipo: 'outro', documento: 'conhecimento de transporte (frete)' };
  if (/energia\s+el[eé]trica|danf3e|nota\s+fiscal\s+de\s+energia/i.test(cab)) return { tipo: 'outro', documento: 'fatura de energia elétrica' };
  if (/nfs-?e\b|nota\s+fiscal\s+de\s+servi/i.test(cab)) return { tipo: 'servico' };
  if (/comprovante\s+de\s+pagamento|pagamento\s+de\s+t[ií]tulos|sisbb/i.test(cab)) return { tipo: 'outro', documento: 'comprovante de pagamento' };
  if (/contrato|proposta\s+de\s+seguro/i.test(cab)) return { tipo: 'outro', documento: 'contrato' };
  if (/fatura|vencimento/i.test(cab) && !SINAIS_DE_NOTA.test(cab)) return { tipo: 'outro', documento: 'fatura ou conta' };
  return null;
}

const ROTULO_ORIGEM = { pdf: 'PDF', foto: 'foto' };

// ---- Validações por dígito verificador ----------------------------------------------
// Servem para escolher, entre várias leituras da mesma foto, a que leu CNPJ e chave sem erro.

export function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const d of base) { soma += Number(d) * peso; peso = peso === 2 ? 9 : peso - 1; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  return d1 === Number(c[12]) && dv(c.slice(0, 12) + d1) === Number(c[13]);
}

export function chaveValida(k) {
  if (!/^\d{44}$/.test(k)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(k[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return (r < 2 ? 0 : 11 - r) === Number(k[43]);
}

const contarLetras = (s) => (s.match(/[A-Za-zÀ-ú]/g) ?? []).length;

// ---- Leitura de um texto -------------------------------------------------------------

/**
 * @param {string} texto  texto completo lido do PDF ou da foto
 * @param {'pdf'|'foto'} origem
 */
export function interpretarTexto(texto, origem) {
  const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const base = { origem, experimental: true, textoLido: texto };

  if (linhas.join('').replace(/\W/g, '').length < 20) {
    return { ...base, tipo: 'sem-itens', mensagem: 'Quase não consegui ler texto neste arquivo. A imagem pode estar escura, desfocada ou cortada.' };
  }

  const outro = classificarPeloCabecalho(linhas);
  if (outro) return { ...base, ...outro };

  if (!SINAIS_DE_NOTA.test(texto)) {
    return { ...base, tipo: 'outro', documento: 'documento que não parece uma nota de compra' };
  }

  const { itens, ignoradas } = lerItens(linhas);
  if (itens.length === 0) {
    return {
      ...base, tipo: 'sem-itens', ignoradas,
      mensagem: 'Isto parece uma nota fiscal, mas não consegui identificar os itens. Confira o texto lido abaixo ou envie o XML.',
    };
  }

  const totais = lerTotais(linhas);
  const modeloNfce = /nfc-?e|nfce|consumidor/i.test(texto);
  const cnpj = lerCnpj(linhas);
  const chave = lerChave(linhas);
  return montarResultado({ base, itens, ignoradas, totais, modeloNfce, cnpj, chave, linhas, texto, origem });
}

function montarResultado({ base, itens, ignoradas, totais, modeloNfce, cnpj, chave, nome, emissao, numero, serie, linhas, texto, origem, duvidosas = [] }) {
  const conferencia = conferir(itens, totais);
  const avisos = [];
  const suspeitos = itens.filter((i) => i.suspeito).length;
  const calculados = itens.filter((i) => i.calculado).length;
  if (suspeitos) avisos.push(`${suspeitos} ${suspeitos === 1 ? 'item tem' : 'itens têm'} quantidade × valor unitário diferente do total: provável erro de leitura.`);
  if (calculados) avisos.push(`${calculados} ${calculados === 1 ? 'valor foi calculado' : 'valores foram calculados'} (quantidade × valor unitário) porque o total da linha não foi lido.`);
  const semConfirmar = itens.filter((i) => i.conferir).length;
  if (semConfirmar) avisos.push(`${semConfirmar === 1 ? 'Um valor calculado não foi confirmado' : `${semConfirmar} valores calculados não foram confirmados`} por outra leitura da imagem: confira com a nota em papel.`);

  return {
    ...base,
    tipo: 'mercadoria',
    modelo: modeloNfce ? '65' : '55',
    rotuloModelo: modeloNfce ? 'NFC-e · modelo 65' : 'Nota fiscal',
    numero: numero ?? /(?:nfc-?e|nfce|numero\s+nf-?e)\D{0,12}?(\d{3,9})\b/i.exec(texto)?.[1] ?? '',
    serie: serie ?? /s[eé]rie\D{0,3}(\d{1,3})\b/i.exec(texto)?.[1] ?? '',
    emissao: emissao ?? lerEmissao(linhas),
    emitente: { nome: nome || lerNome(linhas) || '(não identificado)', fantasia: '', documento: cnpj, local: '' },
    chave,
    itens: itens.map((i, k) => ({ ...i, numero: k + 1 })),
    totais: {
      produtos: totais.produtos,
      desconto: totais.desconto ?? itens.reduce((s, i) => s + i.desconto, 0),
      frete: totais.frete ?? 0,
      seguro: totais.seguro ?? 0,
      outras: 0, ipi: 0, st: 0,
      nota: conferencia.notaConfirmada ?? totais.candidatosNota[0] ?? null,
    },
    conferencia,
    avisos,
    ignoradas,
    duvidosas,
    validacoes: { cnpj: cnpjValido(cnpj), chave: chaveValida(chave) },
    rotuloOrigem: ROTULO_ORIGEM[origem],
    _totais: totais,
  };
}

// ---- Fusão de várias leituras da mesma foto ------------------------------------------
// Cada preparo da imagem (recorte, binarização, nitidez) erra em lugares diferentes.
// Itens que passam na conta (quantidade × valor = total) em QUALQUER leitura são mantidos.

const grau = (i) => (i.suspeito ? 0 : i.calculado ? 1 : 2);
const qualidadeDescricao = (d) => (d.length ? contarLetras(d) / d.length : 0) * Math.min(1, d.length / 12);
const mesmoTotal = (a, b) => Math.round(a.valorProduto * 100) === Math.round(b.valorProduto * 100);
// Dois itens de leituras diferentes são o mesmo item quando têm o mesmo total e (mesma quantidade ou nome parecido).
const ehOMesmoItem = (a, b) => mesmoTotal(a, b) && (Math.abs(a.quantidade - b.quantidade) < 0.0006 || similaridade(a.descricao, b.descricao) >= 0.6);

function distancia(a, b) {
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    anterior = atual;
  }
  return anterior[b.length];
}

export function similaridade(a, b) {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return 1 - distancia(x, y) / Math.max(x.length, y.length, 1);
}

function fundirItens(base, outra) {
  const usados = new Set();
  const mapa = new Map(); // posição em `outra` → item que ficou em `base`
  outra.forEach((it, idx) => {
    const candidatos = base.filter((b) => !usados.has(b) && ehOMesmoItem(b, it));
    candidatos.sort((x, y) => similaridade(it.descricao, y.descricao) - similaridade(it.descricao, x.descricao));
    const alvo = candidatos[0];
    if (alvo && (candidatos.length === 1 || similaridade(it.descricao, alvo.descricao) >= 0.3)) {
      usados.add(alvo);
      mapa.set(idx, alvo);
      alvo.confirmacoes = (alvo.confirmacoes ?? 1) + 1; // mais uma leitura viu este item
      const melhor = grau(it) > grau(alvo) || (grau(it) === grau(alvo) && qualidadeDescricao(it.descricao) > qualidadeDescricao(alvo.descricao) + 0.05);
      if (melhor) {
        alvo.descricao = it.descricao;
        alvo.codigo = it.codigo || alvo.codigo;
        alvo.unidade = it.unidade || alvo.unidade;
        alvo.calculado = it.calculado;
      }
      alvo.desconto = Math.max(alvo.desconto, it.desconto);
      // Entre quantidades diferentes, vale a que fecha a conta exata (quantidade × unitário = total).
      if (Math.abs(it.quantidade - alvo.quantidade) >= 0.0006 && Math.abs(it.quantidade * it.valorUnitario - it.valorProduto) < Math.abs(alvo.quantidade * alvo.valorUnitario - alvo.valorProduto)) {
        alvo.quantidade = it.quantidade;
        alvo.valorUnitario = it.valorUnitario;
      }
      return;
    }
    // Item que só esta leitura enxergou: entra logo depois do item que vem antes dele na nota.
    const novo = { ...it, confirmacoes: 1 };
    let pos = 0;
    for (let p = idx - 1; p >= 0; p--) {
      const ref = mapa.get(p);
      if (ref) { pos = base.indexOf(ref) + 1; break; }
    }
    base.splice(pos, 0, novo);
    usados.add(novo);
    mapa.set(idx, novo);
  });
}

function maisFrequente(valores, preferir = () => false) {
  const cont = new Map();
  for (const v of valores.filter(Boolean)) cont.set(v, (cont.get(v) ?? 0) + 1);
  const ordenados = [...cont.entries()].sort((a, b) => Number(preferir(b[0])) - Number(preferir(a[0])) || b[1] - a[1]);
  return ordenados[0]?.[0] ?? '';
}

const juntarTextos = (lidas) => lidas.map((l, k) => `── leitura ${k + 1} ──\n${l.textoLido}`).join('\n\n');

/** Junta várias interpretações do mesmo arquivo (cada uma de um preparo diferente da imagem). */
export function combinarLeituras(leituras) {
  const lidas = leituras.filter((l) => l.tipo === 'mercadoria');

  if (lidas.length === 0) {
    // Ninguém achou itens: vale o tipo mais votado (ex.: "comprovante de pagamento").
    const chaveTipo = (l) => `${l.tipo}|${l.documento ?? ''}`;
    // Um nome específico ("comprovante de pagamento") vale mais que o genérico ("não parece uma nota").
    const generico = (l) => l.tipo === 'outro' && /não parece/.test(l.documento ?? '');
    const votos = new Map();
    for (const l of leituras) votos.set(chaveTipo(l), (votos.get(chaveTipo(l)) ?? 0) + (generico(l) ? 0.5 : 1));
    const vencedor = [...votos.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const escolhida = leituras.find((l) => chaveTipo(l) === vencedor);
    const ignoradas = leituras.flatMap((l) => l.ignoradas ?? []).slice(0, 6);
    return { ...escolhida, ignoradas, textoLido: juntarTextos(leituras) };
  }

  const validos = (l) => l.itens.filter((i) => !i.suspeito);
  const ordenadas = [...lidas].sort((a, b) => Number(b.conferencia.confere) - Number(a.conferencia.confere) || validos(b).length - validos(a).length);
  const melhor = ordenadas[0];

  const itens = validos(melhor).map((i) => ({ ...i, confirmacoes: 1 }));
  for (const l of ordenadas.slice(1)) fundirItens(itens, validos(l).map((i) => ({ ...i })));
  // Valor calculado (quantidade × unitário) que nenhuma outra leitura confirmou: pode ter nascido de um número mal lido.
  for (const i of itens) i.conferir = Boolean(i.calculado) && i.confirmacoes < 2;

  const duvidosas = [...new Set(ordenadas.flatMap((l) => l.itens.filter((i) => i.suspeito).map((i) => `${i.descricao} (${i.quantidade} × ${i.valorUnitario} ≠ ${i.valorProduto})`)))].slice(0, 6);

  // Totais: o primeiro valor lido de cada campo; o total da nota, o mais repetido entre as leituras.
  const totais = { produtos: null, desconto: null, frete: null, seguro: null, candidatosNota: [] };
  const freq = new Map();
  for (const l of ordenadas) {
    for (const campo of ['produtos', 'desconto', 'frete', 'seguro']) totais[campo] ??= l._totais[campo];
    for (const n of l._totais.candidatosNota) freq.set(n, (freq.get(n) ?? 0) + 1);
  }
  totais.candidatosNota = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

  // Dados da nota: o que mais leituras concordam, preferindo CNPJ e chave com dígito verificador válido.
  const cnpj = maisFrequente(lidas.map((l) => l.emitente.documento), cnpjValido);
  const chave = maisFrequente(lidas.map((l) => l.chave), chaveValida);
  const nomes = lidas.filter((l) => !cnpj || l.emitente.documento === cnpj).map((l) => l.emitente.nome).filter((n) => n && n !== '(não identificado)');
  const maisComum = maisFrequente(nomes);
  const nome = maisComum && nomes.filter((n) => n === maisComum).length > 1
    ? maisComum
    : [...nomes].sort((a, b) => qualidadeDescricao(b) - qualidadeDescricao(a))[0] ?? '';

  // Linhas "ignoradas" que na verdade foram recuperadas por outra leitura não entram na lista.
  const ignoradas = [];
  for (const linha of ordenadas.flatMap((l) => l.ignoradas ?? [])) {
    const texto = linha.replace(/^\d{6,14}\s+/, '').replace(/\d+[.,]?\d*/g, ' ').replace(/\s+/g, ' ').trim();
    const recuperada = itens.some((i) => similaridade(texto, i.descricao) >= 0.65);
    const repetida = ignoradas.some((x) => similaridade(x, linha) >= 0.7);
    if (!recuperada && !repetida) ignoradas.push(linha);
  }

  const resultado = montarResultado({
    base: { origem: melhor.origem, experimental: true, textoLido: juntarTextos(lidas) },
    itens, ignoradas: ignoradas.slice(0, 6), duvidosas, totais,
    modeloNfce: melhor.modelo === '65', cnpj, chave, nome,
    emissao: maisFrequente(lidas.map((l) => l.emissao)),
    numero: maisFrequente(lidas.map((l) => l.numero)),
    serie: maisFrequente(lidas.map((l) => l.serie)),
    linhas: [], texto: melhor.textoLido, origem: melhor.origem,
  });
  resultado.leituras = lidas.length;
  return resultado;
}
