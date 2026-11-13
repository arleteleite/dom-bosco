// Leitura de PDF de nota: pega o texto que já está dentro do PDF (sem OCR) e interpreta.
// PDF escaneado (só imagem) não tem texto: nesse caso o piloto pede a foto ou o XML.

import { agruparEmLinhas } from './agrupar-linhas.js';
import { interpretarTexto } from './leitor-texto.js';

const MAX_PAGINAS = 5;

export async function lerPdf(arquivo) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const tarefa = pdfjs.getDocument({ data: dados, verbosity: 0 });
  let doc;
  try {
    doc = await tarefa.promise;
  } catch (e) {
    if (e?.name === 'PasswordException') {
      return { tipo: 'erro', mensagem: 'Este PDF é protegido por senha. Remova a senha e envie de novo.' };
    }
    return { tipo: 'erro', mensagem: 'Não consegui abrir este PDF. Ele pode estar danificado.' };
  }

  const paginas = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    const pedacos = conteudo.items
      .filter((i) => 'str' in i)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height }));
    paginas.push(agruparEmLinhas(pedacos).join('\n'));
  }
  await tarefa.destroy(); // libera a memória do PDF

  const texto = paginas.join('\n');
  if (texto.replace(/\W/g, '').length < 30) {
    return { tipo: 'sem-itens', origem: 'pdf', experimental: true, textoLido: '', mensagem: 'Este PDF não tem texto: é uma imagem (documento escaneado). Envie a foto da nota ou o XML.' };
  }
  return interpretarTexto(texto, 'pdf');
}
