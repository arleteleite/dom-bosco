// Junta os pedaços de texto de uma página de PDF em linhas, na ordem de leitura.
// Função pura (sem navegador), para poder ser testada fora da tela.

/**
 * @param {{ str: string, x: number, y: number, w: number, h: number }[]} pedacos
 *   posição x/y em unidades do PDF (y cresce para cima), w = largura, h = altura da letra
 * @returns {string[]} linhas de texto, de cima para baixo
 */
export function agruparEmLinhas(pedacos) {
  const uteis = pedacos.filter((p) => p.str.trim() !== '');
  if (uteis.length === 0) return [];

  const alturas = uteis.map((p) => p.h).filter((h) => h > 0).sort((a, b) => a - b);
  const mediana = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 8;
  const tolerancia = Math.max(1.5, mediana * 0.45);

  // De cima para baixo; dentro da mesma altura, da esquerda para a direita.
  const ordenados = [...uteis].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const p of ordenados) {
    const linha = linhas.find((l) => Math.abs(l.y - p.y) <= tolerancia);
    if (linha) {
      linha.pedacos.push(p);
      linha.y = (linha.y * (linha.pedacos.length - 1) + p.y) / linha.pedacos.length;
    } else {
      linhas.push({ y: p.y, pedacos: [p] });
    }
  }

  return linhas
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const ps = l.pedacos.sort((a, b) => a.x - b.x);
      let texto = '';
      let fimAnterior = null;
      for (const p of ps) {
        const folga = fimAnterior === null ? 0 : p.x - fimAnterior;
        const separador = fimAnterior === null ? '' : folga > mediana * 0.15 || /\s$/.test(texto) === false && folga > 0.5 ? ' ' : '';
        texto += separador + p.str.trim();
        fimAnterior = p.x + p.w;
      }
      return texto.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}
