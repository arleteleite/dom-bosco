// Leitura de foto de nota: prepara a imagem de 3 jeitos, faz OCR em cada um e junta o que passa na conta.
// O OCR (Tesseract) roda no próprio navegador, com arquivos locais: a foto não sai do computador.

import { abrirImagem, preparosDaFoto } from './preparar-imagem.js';
import { interpretarTexto, combinarLeituras } from './leitor-texto.js';

const RAIZ = new URL('../vendor/tesseract/', import.meta.url);
let trabalhador = null;

function obterTrabalhador() {
  if (!trabalhador) {
    trabalhador = (async () => {
      const modulo = await import('../vendor/tesseract/tesseract.esm.min.js');
      const createWorker = modulo.createWorker ?? modulo.default?.createWorker;
      if (!createWorker) throw new Error('Biblioteca de OCR não encontrada em vendor/tesseract.');
      const w = await createWorker('por', 1, {
        workerPath: new URL('worker.min.js', RAIZ).href,
        corePath: new URL('core/', RAIZ).href,
        langPath: new URL('lang/', RAIZ).href,
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: false,
      });
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return w;
    })().catch((e) => { trabalhador = null; throw e; });
  }
  return trabalhador;
}

/**
 * @param {File} arquivo  imagem (JPG, PNG...)
 * @param {(p: { passo: number, total: number, nome: string }) => void} [aoProgredir]
 */
export async function lerFoto(arquivo, aoProgredir) {
  let bitmap;
  try {
    bitmap = await abrirImagem(arquivo);
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui abrir esta imagem. Use uma foto em JPG ou PNG (fotos em formato HEIC do iPhone não abrem aqui).' };
  }

  try {
    const preparos = preparosDaFoto(bitmap);
    const worker = await obterTrabalhador();
    const leituras = [];
    for (let i = 0; i < preparos.length; i++) {
      aoProgredir?.({ passo: i + 1, total: preparos.length, nome: preparos[i].nome });
      // Deixa o navegador desenhar o andamento antes da parte pesada.
      await new Promise((r) => setTimeout(r, 30));
      const canvas = preparos[i].gerar();
      const { data } = await worker.recognize(canvas);
      leituras.push(interpretarTexto(data.text, 'foto'));
    }
    return combinarLeituras(leituras);
  } finally {
    bitmap.close?.();
  }
}
