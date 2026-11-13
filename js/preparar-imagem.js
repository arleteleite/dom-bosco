// Preparo da foto da nota para o OCR.
// Cada preparo ressalta a imagem de um jeito: o leitor roda o OCR em todos e junta o que passa na conta.
// Primeira parte: algoritmos sobre listas de números (sem navegador). Segunda: funções que usam canvas.

// ---- Algoritmos ---------------------------------------------------------------------

/** Converte RGBA em tons de cinza (mesmos pesos do formato "L" de bibliotecas comuns). */
export function rgbaParaCinza(rgba, n) {
  const cinza = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) cinza[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return cinza;
}

/** Estica o contraste, descartando `corte`% dos pontos mais escuros e mais claros. */
export function autocontraste(cinza, corte = 1) {
  const hist = new Uint32Array(256);
  for (const v of cinza) hist[v]++;
  const alvo = (cinza.length * corte) / 100;
  let lo = 0;
  let soma = 0;
  while (lo < 255 && soma + hist[lo] <= alvo) soma += hist[lo++];
  let hi = 255;
  soma = 0;
  while (hi > 0 && soma + hist[hi] <= alvo) soma += hist[hi--];
  if (hi <= lo) return Uint8ClampedArray.from(cinza);
  const escala = 255 / (hi - lo);
  const saida = new Uint8ClampedArray(cinza.length);
  for (let i = 0; i < cinza.length; i++) saida[i] = (cinza[i] - lo) * escala;
  return saida;
}

/** Limiar de Otsu: o ponto que melhor separa "escuro" de "claro". */
export function otsu(cinza) {
  const hist = new Uint32Array(256);
  for (const v of cinza) hist[v]++;
  const total = cinza.length;
  let somaTotal = 0;
  for (let i = 0; i < 256; i++) somaTotal += i * hist[i];
  let somaFundo = 0;
  let pesoFundo = 0;
  let melhor = 0;
  let limiar = 128;
  for (let i = 0; i < 256; i++) {
    pesoFundo += hist[i];
    if (pesoFundo === 0) continue;
    const pesoFrente = total - pesoFundo;
    if (pesoFrente === 0) break;
    somaFundo += i * hist[i];
    const mediaFundo = somaFundo / pesoFundo;
    const mediaFrente = (somaTotal - somaFundo) / pesoFrente;
    const variancia = pesoFundo * pesoFrente * (mediaFundo - mediaFrente) ** 2;
    if (variancia > melhor) { melhor = variancia; limiar = i; }
  }
  return limiar;
}

/** Desfoque por média numa janela quadrada (raio `r`), passada horizontal e vertical. */
export function desfoque(cinza, w, h, r) {
  const meio = new Float32Array(w * h);
  const saida = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let soma = 0;
    for (let x = -r; x <= r; x++) soma += cinza[base + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      meio[base + x] = soma / (2 * r + 1);
      soma += cinza[base + Math.min(w - 1, x + r + 1)] - cinza[base + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let soma = 0;
    for (let y = -r; y <= r; y++) soma += meio[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      saida[y * w + x] = soma / (2 * r + 1);
      soma += meio[Math.min(h - 1, y + r + 1) * w + x] - meio[Math.max(0, y - r) * w + x];
    }
  }
  return saida;
}

/**
 * Acha o retângulo do papel (a região clara da foto), para cortar o fundo (jeans, colcha, mesa).
 * Devolve frações da imagem {x0, y0, x1, y1} ou null se não achar algo plausível.
 */
export function caixaDoPapel(cinza, w, h) {
  const suave = Uint8ClampedArray.from(desfoque(cinza, w, h, 3));
  const limiar = otsu(suave);
  const colunas = new Float32Array(w);
  const linhas = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (suave[y * w + x] > limiar) { colunas[x]++; linhas[y]++; }
    }
  }
  const achar = (v, n, tamanho) => {
    let a = -1;
    let b = -1;
    for (let i = 0; i < n; i++) if (v[i] / tamanho > 0.35) { if (a < 0) a = i; b = i; }
    return a < 0 ? null : [a, b];
  };
  const c = achar(colunas, w, h);
  const l = achar(linhas, h, w);
  if (!c || !l) return null;
  const caixa = { x0: c[0] / w, x1: (c[1] + 1) / w, y0: l[0] / h, y1: (l[1] + 1) / h };
  const area = (caixa.x1 - caixa.x0) * (caixa.y1 - caixa.y0);
  return area < 0.2 ? null : caixa;
}

/** Binarização local de Sauvola: cada ponto é comparado com a vizinhança, o que vence sombra e papel amassado. */
export function sauvola(cinza, w, h, raio, k = 0.25) {
  const w1 = w + 1;
  const soma = new Float64Array(w1 * (h + 1));
  const somaQuad = new Float64Array(w1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let linha = 0;
    let linhaQuad = 0;
    for (let x = 0; x < w; x++) {
      const v = cinza[y * w + x];
      linha += v;
      linhaQuad += v * v;
      soma[(y + 1) * w1 + x + 1] = soma[y * w1 + x + 1] + linha;
      somaQuad[(y + 1) * w1 + x + 1] = somaQuad[y * w1 + x + 1] + linhaQuad;
    }
  }
  const saida = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - raio);
    const y1 = Math.min(h, y + raio + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - raio);
      const x1 = Math.min(w, x + raio + 1);
      const n = (y1 - y0) * (x1 - x0);
      const s = soma[y1 * w1 + x1] - soma[y0 * w1 + x1] - soma[y1 * w1 + x0] + soma[y0 * w1 + x0];
      const q = somaQuad[y1 * w1 + x1] - somaQuad[y0 * w1 + x1] - somaQuad[y1 * w1 + x0] + somaQuad[y0 * w1 + x0];
      const media = s / n;
      const desvio = Math.sqrt(Math.max(q / n - media * media, 0));
      const limiar = media * (1 + k * (desvio / 128 - 1));
      saida[y * w + x] = cinza[y * w + x] > limiar ? 255 : 0;
    }
  }
  return saida;
}

/** Máscara de nitidez: realça as bordas das letras. */
export function nitidez(cinza, w, h, raio = 3, quantidade = 1.5, limiar = 2) {
  // Três passadas de desfoque por média aproximam um desfoque gaussiano (o usual nessa técnica).
  let borrada = desfoque(cinza, w, h, raio);
  borrada = desfoque(borrada, w, h, raio);
  borrada = desfoque(borrada, w, h, raio);
  const saida = new Uint8ClampedArray(cinza.length);
  for (let i = 0; i < cinza.length; i++) {
    const dif = cinza[i] - borrada[i];
    saida[i] = Math.abs(dif) > limiar ? cinza[i] + quantidade * dif : cinza[i];
  }
  return saida;
}

// ---- Funções que usam a tela (canvas) ------------------------------------------------

export function abrirImagem(arquivo) {
  // 'from-image' respeita a rotação gravada pela câmera do celular.
  return createImageBitmap(arquivo, { imageOrientation: 'from-image' });
}

function desenhar(bitmap, recorte, largura) {
  const sx = Math.round(recorte.x0 * bitmap.width);
  const sy = Math.round(recorte.y0 * bitmap.height);
  const sw = Math.max(1, Math.round((recorte.x1 - recorte.x0) * bitmap.width));
  const sh = Math.max(1, Math.round((recorte.y1 - recorte.y0) * bitmap.height));
  const altura = Math.max(1, Math.round((sh * largura) / sw));
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, largura, altura);
  return { canvas, ctx, w: largura, h: altura };
}

function cinzaDe({ ctx, w, h }) {
  return rgbaParaCinza(ctx.getImageData(0, 0, w, h).data, w * h);
}

function paraCanvas(cinza, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < cinza.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = cinza[i]; img.data[j + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Gera os preparos da foto. Cada um é uma função (preguiçosa), para a tela mostrar o andamento
 * e não segurar memória de todos de uma vez.
 */
export function preparosDaFoto(bitmap) {
  const tudo = { x0: 0, y0: 0, x1: 1, y1: 1 };

  // Recorte do papel, achado numa versão pequena da foto.
  const escala = Math.min(1, 500 / bitmap.width, 900 / bitmap.height);
  const pequena = desenhar(bitmap, tudo, Math.max(50, Math.round(bitmap.width * escala)));
  const caixa = caixaDoPapel(cinzaDe(pequena), pequena.w, pequena.h);
  const margemX = 0.015;
  const margemY = 0.01;
  const recorte = caixa
    ? { x0: Math.max(0, caixa.x0 - margemX), x1: Math.min(1, caixa.x1 + margemX), y0: Math.max(0, caixa.y0 - margemY), y1: Math.min(1, caixa.y1 + margemY) }
    : tudo;

  let base1600 = null;
  const cinza1600 = () => {
    if (!base1600) {
      const d = desenhar(bitmap, recorte, 1600);
      base1600 = { cinza: autocontraste(cinzaDe(d), 1), w: d.w, h: d.h };
    }
    return base1600;
  };

  return [
    { nome: 'recorte em cinza', gerar: () => { const b = cinza1600(); return paraCanvas(b.cinza, b.w, b.h); } },
    { nome: 'binarização local', gerar: () => { const b = cinza1600(); return paraCanvas(sauvola(b.cinza, b.w, b.h, Math.max(15, Math.round(b.w / 55))), b.w, b.h); } },
    { nome: 'imagem nítida', gerar: () => { const d = desenhar(bitmap, recorte, 2200); const g = autocontraste(cinzaDe(d), 1); return paraCanvas(nitidez(g, d.w, d.h), d.w, d.h); } },
  ];
}
