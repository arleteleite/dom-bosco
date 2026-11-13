// Evita contar a mesma compra duas vezes (o que deixaria o estoque maior do que é).
//
// Uma nota é "a mesma" quando:
//   1. o arquivo é idêntico (mesmo conteúdo, mesmo com outro nome);
//   2. tem a mesma chave de acesso (44 dígitos): pega o XML e o PDF da mesma nota;
//   3. tem o mesmo emitente (CNPJ) e o mesmo número de nota.

const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const semZerosAEsquerda = (t) => String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');

/** "Impressão digital" do conteúdo do arquivo: dois arquivos iguais têm a mesma, qualquer que seja o nome. */
export async function impressaoDigital(arquivo) {
  try {
    if (globalThis.crypto?.subtle) {
      const resumo = await globalThis.crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
      return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // sem suporte (ex.: página aberta por endereço sem https): usa o plano B abaixo
  }
  return `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}`;
}

/** @returns {boolean} true se `a` e `b` são a mesma nota fiscal. */
export function mesmaNota(a, b) {
  if (a.hash && a.hash === b.hash) return true;

  const chaveA = soDigitos(a.chave);
  if (chaveA.length === 44 && chaveA === soDigitos(b.chave)) return true;

  const docA = soDigitos(a.emitente?.documento);
  const numeroA = semZerosAEsquerda(a.numero);
  if (docA && numeroA && docA === soDigitos(b.emitente?.documento) && numeroA === semZerosAEsquerda(b.numero)) {
    // A série pode não ter sido lida em foto: só diferencia quando as duas existem e são diferentes.
    const serieA = semZerosAEsquerda(a.serie);
    const serieB = semZerosAEsquerda(b.serie);
    return !serieA || !serieB || serieA === serieB;
  }
  return false;
}

/** Procura, na lista, uma nota (já lida ou ainda sendo lida) que seja a mesma de `nova`. */
export function acharNotaDuplicada(nova, lista) {
  return lista.find((r) => r.id !== nova.id && (r.tipo === 'mercadoria' || r.tipo === 'lendo') && mesmaNota(r, nova)) ?? null;
}

/** Procura um arquivo idêntico na lista, antes mesmo de lê-lo. Só vale para notas (não para erros ou notas de serviço). */
export function acharArquivoIdentico(hash, lista) {
  if (!hash) return null;
  return lista.find((r) => r.hash === hash && (r.tipo === 'mercadoria' || r.tipo === 'lendo')) ?? null;
}

// ---- Compra sem nota ----------------------------------------------------------------

/** Mesma compra sem nota = mesmo fornecedor, data, comprovante e os mesmos itens com as mesmas quantidades e valores. */
export function assinaturaCompra(c) {
  return JSON.stringify({
    fornecedor: c.fornecedorId,
    data: c.data,
    comprovante: c.comprovante,
    numero: String(c.recibo?.numero ?? '').trim().toLowerCase(),
    itens: c.revisao.itens.map((l, k) => `${l.insumoId}|${c.itens[k].quantidade}|${l.valor}`).sort(),
  });
}

export function acharCompraDuplicada(nova, lista) {
  const assinatura = assinaturaCompra(nova);
  return lista.find((r) => r.tipo === 'manual' && assinaturaCompra(r) === assinatura) ?? null;
}
