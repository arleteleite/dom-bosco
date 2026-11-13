// Leitor de notas em XML: NF-e (modelo 55) e NFC-e (modelo 65).
// Reconhece notas de serviço (NFS-e) e avisa que não têm itens de mercadoria.
// Roda inteiro no navegador: o arquivo nunca sai do computador.

const RAIZES_SERVICO = [
  'CompNfse', 'Nfse', 'NFSe', 'RetornoConsulta',
  'ConsultarNfseResposta', 'GerarNfseResposta', 'ConsultarNfseRpsResposta',
];

// ---- Navegação no XML ----------------------------------------------------

/** Desce por filhos diretos: no(pai, 'total/ICMSTot'). Ignora prefixo de namespace. */
function no(pai, caminho) {
  let atual = pai;
  for (const nome of caminho.split('/')) {
    if (!atual) return null;
    atual = [...atual.children].find((c) => c.localName === nome) ?? null;
  }
  return atual;
}

const texto = (pai, caminho) => no(pai, caminho)?.textContent.trim() ?? '';

function numero(pai, caminho) {
  const t = texto(pai, caminho);
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const centavos = (v) => Math.round((v ?? 0) * 100);

/** Primeiro elemento com algum desses nomes, em qualquer lugar do documento. */
function primeiroTexto(doc, nomes) {
  for (const nome of nomes) {
    const e = doc.getElementsByTagNameNS('*', nome)[0];
    if (e && e.textContent.trim()) return e.textContent.trim();
  }
  return '';
}

// ---- Formatação de dados da nota ------------------------------------------

export function formatarCnpjCpf(valor) {
  const d = valor.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return valor;
}

/** "2025-09-21T18:17:40-03:00" → "21/09/2025 18:17". Sem converter fuso: mostra a hora da própria nota. */
export function formatarEmissao(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const data = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? `${data} ${m[4]}:${m[5]}` : data;
}

export function formatarChave(chave) {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// ---- Leitura -------------------------------------------------------------

function lerItem(det, indice) {
  const prod = no(det, 'prod');
  const ean = texto(prod, 'cEAN');
  return {
    numero: Number(det.getAttribute('nItem')) || indice + 1,
    codigo: texto(prod, 'cProd'),
    ean: /^\d{8,14}$/.test(ean) ? ean : '', // "SEM GTIN" vira vazio
    descricao: texto(prod, 'xProd'),
    ncm: texto(prod, 'NCM'),
    unidade: texto(prod, 'uCom'),
    quantidade: numero(prod, 'qCom') ?? 0,
    valorUnitario: numero(prod, 'vUnCom') ?? 0,
    valorProduto: numero(prod, 'vProd') ?? 0,
    desconto: numero(prod, 'vDesc') ?? 0,
  };
}

function lerMercadoria(doc, inf) {
  const avisos = [];
  const ide = no(inf, 'ide');
  const emit = no(inf, 'emit');
  const modelo = texto(ide, 'mod');
  const itens = [...inf.children].filter((c) => c.localName === 'det').map(lerItem);

  const icms = no(inf, 'total/ICMSTot');
  const totais = {
    produtos: numero(icms, 'vProd'),
    desconto: numero(icms, 'vDesc') ?? 0,
    frete: numero(icms, 'vFrete') ?? 0,
    seguro: numero(icms, 'vSeg') ?? 0,
    outras: numero(icms, 'vOutro') ?? 0,
    ipi: numero(icms, 'vIPI') ?? 0,
    st: numero(icms, 'vST') ?? 0,
    nota: numero(icms, 'vNF'),
  };

  // Conferência: a soma das linhas deve bater com o "total dos produtos" da nota.
  const somaItens = itens.reduce((s, i) => s + centavos(i.valorProduto), 0) / 100;
  const referencia = totais.produtos ?? totais.nota;
  const conferencia = {
    somaItens,
    totalProdutos: referencia,
    confere: referencia !== null && Math.abs(centavos(somaItens) - centavos(referencia)) <= 1,
  };
  if (totais.produtos === null) avisos.push('A nota não traz o total dos produtos; a conferência usou o total da nota.');

  if (itens.length === 0) avisos.push('Nenhum item de mercadoria foi encontrado nesta nota.');
  if (texto(ide, 'tpAmb') === '2') avisos.push('Nota emitida em ambiente de homologação (teste): não tem valor fiscal.');

  // Protocolo de autorização (só existe no XML "processado", nfeProc)
  const protocolo = doc.getElementsByTagNameNS('*', 'protNFe')[0];
  const cStat = protocolo ? texto(protocolo, 'infProt/cStat') : '';
  if (!protocolo) avisos.push('O XML não traz o protocolo de autorização da SEFAZ; confirme que a nota é válida.');
  else if (cStat && cStat !== '100') avisos.push(`A SEFAZ não autorizou esta nota (código ${cStat}). Não use para registrar compra.`);

  return {
    tipo: 'mercadoria',
    modelo,
    rotuloModelo: modelo === '65' ? 'NFC-e · modelo 65' : modelo === '55' ? 'NF-e · modelo 55' : `Nota fiscal · modelo ${modelo || '?'}`,
    numero: texto(ide, 'nNF'),
    serie: texto(ide, 'serie'),
    emissao: texto(ide, 'dhEmi') || texto(ide, 'dEmi'),
    emitente: {
      nome: texto(emit, 'xNome') || '(sem nome)',
      fantasia: texto(emit, 'xFant'),
      documento: texto(emit, 'CNPJ') || texto(emit, 'CPF'),
      local: [texto(emit, 'enderEmit/xMun'), texto(emit, 'enderEmit/UF')].filter(Boolean).join('/'),
    },
    chave: (inf.getAttribute('Id') ?? '').replace(/^NFe/, ''),
    itens,
    totais,
    conferencia,
    avisos,
  };
}

function lerServico(doc) {
  const valor = Number(primeiroTexto(doc, ['ValorLiquidoNfse', 'ValorServicos', 'vLiq', 'vServ']));
  return {
    tipo: 'servico',
    prestador: primeiroTexto(doc, ['RazaoSocial', 'RazaoSocialPrestador', 'xNome']),
    valor: Number.isFinite(valor) && valor > 0 ? valor : null,
    numero: primeiroTexto(doc, ['Numero', 'nNFSe', 'NumeroNFe']),
    emissao: primeiroTexto(doc, ['DataEmissao', 'DataEmissaoNFe', 'dhProc']),
  };
}

/** Lê o texto de um XML e devolve { tipo: 'mercadoria' | 'servico' | 'desconhecido' | 'erro', ... }. */
export function lerXml(conteudo) {
  const doc = new DOMParser().parseFromString(conteudo, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { tipo: 'erro', mensagem: 'O arquivo não é um XML válido, ou está incompleto.' };
  }

  const raiz = doc.documentElement.localName;
  const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0];
  if (inf) return lerMercadoria(doc, inf);

  if (RAIZES_SERVICO.includes(raiz)) return lerServico(doc);

  return { tipo: 'desconhecido', raiz };
}
