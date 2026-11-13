// Tela de Compras: enviar a nota (XML, PDF ou foto) e ver o que foi lido.
// XML é leitura exata. PDF e foto são leituras EXPERIMENTAIS e sempre pedem conferência.
// Os arquivos ficam só na memória do navegador: nada é enviado nem salvo.

import { lerXml, formatarCnpjCpf, formatarEmissao, formatarChave } from './leitor-xml.js';
import { lerPdf } from './leitor-pdf.js';
import { lerFoto } from './leitor-foto.js';
import { fmtMoeda, fmtHora, esc } from './formato.js';
import {
  criarRevisao, aplicarAcao, atualizarTextosDaLinha,
  htmlConferenciaDosItens, htmlTopoConferencia, htmlRodapeConferencia, htmlStatusConferencia,
} from './revisao.js';
import { htmlFormularioManual, ligarFormularioManual, htmlCompraManual } from './compra-manual.js';
import { impressaoDigital, acharArquivoIdentico, acharNotaDuplicada, acharCompraDuplicada } from './duplicidade.js';
import { config, registroConfirmadas, confirmarCompra, desfazerConfirmacao, alertasDaConfirmacao } from './confirmacao.js';
import { htmlConfigAlerta, htmlConfirmada } from './painel-confirmacao.js';

const LIMITE_BYTES = 5 * 1024 * 1024;
const EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

// Fica fora das funções para os resultados sobreviverem à troca de tela.
const estado = { resultados: [], proximoId: 1 };
let raizAtual = null;

const extensao = (nome) => (nome.includes('.') ? nome.split('.').pop().toLowerCase() : '');

async function processar(arquivo, aoProgredir) {
  const ext = extensao(arquivo.name);
  if (arquivo.size > LIMITE_BYTES) {
    return { tipo: 'erro', mensagem: 'O arquivo é maior que 5 MB. Envie a nota original, sem compactar junto com outros arquivos.' };
  }
  try {
    if (ext === 'xml') return lerXml(await arquivo.text());
    if (ext === 'pdf' || arquivo.type === 'application/pdf') return await lerPdf(arquivo);
    if (arquivo.type.startsWith('image/') || EXT_IMAGEM.includes(ext)) return await lerFoto(arquivo, aoProgredir);
  } catch (e) {
    console.error(e);
    return { tipo: 'erro', mensagem: 'Não consegui ler este arquivo.' };
  }
  return { tipo: 'erro', mensagem: 'Tipo de arquivo não aceito. Envie o XML, o PDF ou a foto da nota.' };
}

// ---- HTML dos resultados -----------------------------------------------------

function linhaTotal(rotulo, valor, destaque = false) {
  return `<div class="totais__linha${destaque ? ' totais__linha--forte' : ''}"><dt>${rotulo}</dt><dd>${fmtMoeda(valor)}</dd></div>`;
}

function htmlTotais(r) {
  const t = r.totais;
  const linhas = [linhaTotal('Soma dos itens', r.conferencia.somaItens)];
  if (t.desconto > 0) linhas.push(linhaTotal('Descontos', -t.desconto));
  if (t.frete > 0) linhas.push(linhaTotal('Frete', t.frete));
  if (t.seguro > 0) linhas.push(linhaTotal('Seguro', t.seguro));
  if (t.outras > 0) linhas.push(linhaTotal('Outras despesas', t.outras));
  if (t.ipi > 0) linhas.push(linhaTotal('IPI', t.ipi));
  if (t.st > 0) linhas.push(linhaTotal('ICMS por substituição tributária', t.st));
  if (t.nota !== null) linhas.push(linhaTotal('Total da nota', t.nota, true));
  return `<dl class="totais">${linhas.join('')}</dl>`;
}

function htmlConferencia(r) {
  const c = r.conferencia;
  if (c.totalProdutos === null) {
    return '<p class="conferencia conferencia--alerta" role="status">Não foi possível conferir: a nota não traz o total.</p>';
  }
  if (c.confere) {
    const soma = fmtMoeda(c.somaItens);
    const total = fmtMoeda(c.totalProdutos);
    const texto = {
      liquida: `A soma dos itens, já com os descontos (${soma}), é igual ao total da nota (${total}).`,
      frete: `A soma dos itens (${soma}) mais frete e seguro é igual ao total da nota (${total}).`,
    }[c.regra] ?? `A soma dos ${r.itens.length === 1 ? 'item' : 'itens'} (${soma}) é igual ao total dos produtos da nota (${total}).`;
    return `<p class="conferencia conferencia--ok" role="status"><strong>Confere.</strong> ${texto}</p>`;
  }
  if (r.experimental && c.falta !== null && Math.abs(c.falta) >= 0.005) {
    const total = fmtMoeda(c.totalProdutos);
    return c.falta > 0
      ? `<p class="conferencia conferencia--alerta" role="alert"><strong>Não confere.</strong> Faltam ${fmtMoeda(c.falta)} para chegar ao total da nota (${total}): provavelmente há itens que não foram lidos.</p>`
      : `<p class="conferencia conferencia--alerta" role="alert"><strong>Não confere.</strong> A soma dos itens passa ${fmtMoeda(-c.falta)} do total da nota (${total}): pode haver um item lido errado ou um desconto que não foi lido.</p>`;
  }
  return `<p class="conferencia conferencia--alerta" role="alert"><strong>Não confere.</strong> A soma dos itens é ${fmtMoeda(c.somaItens)}, mas a nota informa ${fmtMoeda(c.totalProdutos)} em produtos. Confira antes de registrar a compra.</p>`;
}

function htmlTextoLido(r) {
  if (!r.textoLido) return '';
  return `
    <details class="texto-lido">
      <summary>Ver o texto que o piloto leu</summary>
      <pre>${esc(r.textoLido)}</pre>
    </details>`;
}

function htmlNaoLidas(r) {
  const nao = r.ignoradas ?? [];
  const duvidosas = r.duvidosas ?? [];
  if (nao.length === 0 && duvidosas.length === 0) return '';
  const lista = (itens) => `<ul class="lista-ignoradas">${itens.map((l) => `<li><code>${esc(l)}</code></li>`).join('')}</ul>`;
  return `
    <div class="conferencia conferencia--alerta" role="status">
      ${nao.length ? `<strong>${nao.length === 1 ? 'Uma linha parece um item, mas não consegui ler' : `${nao.length} linhas parecem itens, mas não consegui ler`}:</strong>${lista(nao)}` : ''}
      ${duvidosas.length ? `<strong>Lidos com números que não fecham a conta (não entraram na lista):</strong>${lista(duvidosas)}` : ''}
      <span class="sub">Confira na nota em papel e digite à mão, ou envie o XML.</span>
    </div>`;
}

function htmlSelos(r) {
  const selos = [`<span class="selo">${esc(r.rotuloModelo)}</span>`];
  if (r.revisao && !r.confirmacao) selos.push('<span class="selo selo--aguardando">Aguardando confirmação</span>');
  if (r.experimental) selos.push(`<span class="selo selo--experimental">Leitura experimental · ${esc(r.rotuloOrigem ?? '')}</span>`);
  return selos.join(' ');
}

function htmlValidacoes(r) {
  if (!r.validacoes) return '';
  const chips = [];
  if (r.validacoes.cnpj) chips.push('<span class="chip chip--ok">CNPJ válido</span>');
  if (r.validacoes.chave) chips.push('<span class="chip chip--ok">chave de acesso válida</span>');
  return chips.join(' ');
}

function htmlMercadoria(r) {
  const e = r.emitente;
  const avisos = r.avisos.map((a) => `<p class="conferencia conferencia--alerta" role="status">${esc(a)}</p>`).join('');
  const experimental = r.experimental
    ? `<p class="conferencia conferencia--alerta" role="note"><strong>Leitura automática de ${esc(r.rotuloOrigem ?? '')}.</strong> Pode ter erros: confira cada item com a nota em papel antes de usar.${r.leituras > 1 ? ` O piloto leu a imagem de ${r.leituras} jeitos e juntou o que fechou a conta.` : ''}</p>`
    : '';
  return `
    <header class="resultado__topo">
      <div>
        ${htmlSelos(r)}
        <h2>${esc(e.nome)}</h2>
        <p class="sub">${[e.documento ? `CNPJ/CPF ${esc(formatarCnpjCpf(e.documento))}` : '', esc(e.local)].filter(Boolean).join(' · ')} ${htmlValidacoes(r)}</p>
      </div>
      <button type="button" class="botao botao--secundario" data-remover>Remover</button>
    </header>
    ${experimental}
    <dl class="dados-nota">
      <div><dt>Número / série</dt><dd>${esc(r.numero || '—')} / ${esc(r.serie || '—')}</dd></div>
      <div><dt>Emissão</dt><dd>${esc(r.emissao ? formatarEmissao(r.emissao) : '—')}</dd></div>
      <div><dt>Arquivo</dt><dd>${esc(r.arquivo)}</dd></div>
      ${r.chave ? `<div class="dados-nota__chave"><dt>Chave de acesso</dt><dd>${esc(formatarChave(r.chave))}</dd></div>` : ''}
    </dl>
    ${avisos}
    ${htmlConferenciaDosItens(r)}
    ${htmlNaoLidas(r)}
    <div class="resultado__rodape">
      ${htmlConferencia(r)}
      ${htmlTotais(r)}
    </div>
    ${htmlTextoLido(r)}`;
}

function htmlServico(r) {
  const detalhe = [
    r.prestador ? `Prestador: ${esc(r.prestador)}` : '',
    r.valor ? `Valor: ${fmtMoeda(r.valor)}` : '',
    r.numero ? `Nº ${esc(r.numero)}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <header class="resultado__topo">
      <div>
        <span class="selo">Nota de serviço (NFS-e)</span>
        <h2>Esta nota é de serviço, não de mercadoria</h2>
        <p>Ela não traz itens para o estoque. O sistema não usa esta nota para registrar compra de insumos.</p>
        ${detalhe ? `<p class="sub">${detalhe}</p>` : ''}
        <p class="sub">Arquivo: ${esc(r.arquivo)}</p>
      </div>
      <button type="button" class="botao botao--secundario" data-remover>Remover</button>
    </header>`;
}

function htmlAviso(r, titulo, selo, mensagem = r.mensagem) {
  return `
    <header class="resultado__topo">
      <div>
        <span class="selo">${selo}</span>
        <h2>${titulo}</h2>
        <p>${esc(mensagem)}</p>
        <p class="sub">Arquivo: ${esc(r.arquivo)}</p>
      </div>
      <button type="button" class="botao botao--secundario" data-remover>Remover</button>
    </header>`;
}

function htmlLendo(r) {
  return `
    <header class="resultado__topo">
      <div>
        <span class="selo">Lendo</span>
        <h2>Lendo o arquivo…</h2>
        <p class="lendo"><span class="girando" aria-hidden="true"></span><span data-progresso="${r.id}">${esc(r.progresso || 'Isso pode levar alguns segundos.')}</span></p>
        <p class="sub">Arquivo: ${esc(r.arquivo)}</p>
      </div>
      <button type="button" class="botao botao--secundario" data-remover>Cancelar</button>
    </header>`;
}

function htmlResultado(r) {
  let corpo;
  let classe = 'resultado';
  switch (r.tipo) {
    case 'lendo': corpo = htmlLendo(r); classe += ' resultado--aviso'; break;
    case 'mercadoria': corpo = r.confirmacao ? htmlConfirmada(r) : htmlMercadoria(r); break;
    case 'manual': corpo = r.confirmacao ? htmlConfirmada(r) : htmlCompraManual(r); break;
    case 'servico': corpo = htmlServico(r); classe += ' resultado--aviso'; break;
    case 'outro': {
      const generico = /não parece/.test(r.documento ?? '');
      corpo = htmlAviso(r, 'Este arquivo não parece ser uma nota de compra', 'Não é nota de compra',
        generico ? 'Não encontrei nada que pareça uma nota fiscal de compra de mercadoria.' : `Parece ser: ${r.documento}. Não há itens de compra para ler aqui.`)
        + htmlTextoLido(r);
      classe += ' resultado--aviso';
      break;
    }
    case 'sem-itens':
      corpo = htmlAviso(r, 'Não consegui identificar os itens', 'Atenção') + htmlNaoLidas(r) + htmlTextoLido(r);
      classe += ' resultado--erro';
      break;
    case 'desconhecido':
      corpo = htmlAviso(r, 'Arquivo não reconhecido', 'Atenção', `Este XML não é uma nota fiscal que o piloto reconheça (tipo "${r.raiz}"). Pode ser um cancelamento ou uma carta de correção.`);
      classe += ' resultado--erro';
      break;
    default: corpo = htmlAviso(r, 'Não foi possível ler o arquivo', 'Atenção'); classe += ' resultado--erro';
  }
  return `<article class="${classe}" data-resultado="${esc(r.tipo)}" data-id="${r.id}">${corpo}</article>`;
}

// ---- Avisos de sucesso ou falha ---------------------------------------------------
// O resultado aparece mais abaixo na página (depois do formulário de compra sem nota), então o piloto
// avisa na hora, no alto da tela, se a nota foi lida, se tem ressalvas ou se deu errado.

const ICONE_AVISO = { sucesso: '✓', atencao: '!', erro: '✕' };
const MAX_AVISOS = 4;
const SEGUNDOS_ATE_SUMIR = 12;

/** Resume um resultado numa frase de sucesso, atenção ou erro. */
export function descreverResultado(r) {
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  switch (r.tipo) {
    case 'mercadoria': {
      const n = r.itens.length;
      const confere = r.conferencia.confere;
      const ressalvas = r.experimental && (!confere || (r.ignoradas ?? []).length > 0);
      return {
        nivel: confere && !ressalvas ? 'sucesso' : 'atencao',
        titulo: confere && !ressalvas ? 'Nota lida com sucesso' : 'Nota lida, mas confira',
        detalhe: `${r.arquivo} · ${r.emitente.nome} · ${plural(n, 'item', 'itens')} · ${confere ? 'a soma confere com o total da nota' : 'a soma NÃO confere com o total (veja a conferência)'}. O estoque ainda não foi atualizado: confira os itens e confirme a compra.`,
      };
    }
    case 'manual': {
      const total = r.itens.reduce((s, i) => s + i.valorProduto, 0);
      return { nivel: 'atencao', titulo: 'Compra registrada: falta confirmar', detalhe: `${r.emitente.nome} · ${plural(r.itens.length, 'item', 'itens')} · ${fmtMoeda(total)} · lançada em ${r.segundos} s. O estoque ainda NÃO foi atualizado.`, confirmarAgora: true };
    }
    case 'servico': return { nivel: 'atencao', titulo: 'Nota de serviço: não entra nas compras', detalhe: `${r.arquivo} é uma nota de serviço (NFS-e), sem itens de mercadoria.` };
    case 'outro': return { nivel: 'atencao', titulo: 'Este arquivo não é uma nota de compra', detalhe: `${r.arquivo}: ${/não parece/.test(r.documento ?? '') ? 'não parece uma nota de compra' : `parece ser ${r.documento}`}.` };
    case 'sem-itens': return { nivel: 'erro', titulo: 'Não consegui ler os itens', detalhe: `${r.arquivo}: ${r.mensagem} Abra o resultado para ver o texto lido.` };
    case 'desconhecido': return { nivel: 'erro', titulo: 'Arquivo não reconhecido', detalhe: `${r.arquivo}: este XML não é uma nota fiscal que o piloto reconheça.` };
    default: return { nivel: 'erro', titulo: 'Não foi possível ler o arquivo', detalhe: `${r.arquivo}: ${r.mensagem ?? 'erro ao ler o arquivo.'}` };
  }
}

/**
 * Mostra um aviso fixo no alto da tela. Níveis: sucesso, atencao, erro e lendo (arquivo em leitura).
 * `para` é o cartão a que o botão "Ver" leva.
 */
function colocarAviso({ nivel, titulo, detalhe, para, cancelavel = false, confirmarAgora = false }) {
  const area = raizAtual?.querySelector('[data-avisos]');
  if (!area) return null;
  const icone = nivel === 'lendo' ? '<span class="girando"></span>' : ICONE_AVISO[nivel];
  const aviso = elementoDe(`
    <div class="aviso-flutuante aviso-flutuante--${nivel}" role="${nivel === 'erro' ? 'alert' : 'status'}" data-aviso data-nivel="${nivel}" data-para="${para}">
      <span class="aviso-flutuante__icone" aria-hidden="true">${icone}</span>
      <div class="aviso-flutuante__texto"><strong>${esc(titulo)}</strong><span data-aviso-detalhe>${esc(detalhe)}</span></div>
      <div class="aviso-flutuante__acoes">
        <button type="button" class="botao botao--pequeno botao--secundario" data-ver-resultado>Ver</button>
        ${cancelavel ? '<button type="button" class="botao botao--pequeno botao--secundario" data-cancelar-leitura>Cancelar</button>' : ''}
        ${confirmarAgora ? '<button type="button" class="botao botao--pequeno botao--primario" data-confirmar-agora>Confirmar agora</button>' : ''}
      </div>
      <button type="button" class="aviso-flutuante__fechar" data-fechar-aviso aria-label="Fechar aviso">×</button>
    </div>`);
  area.append(aviso);
  // Passando do limite, sai o aviso mais antigo, poupando os que mostram uma leitura em andamento.
  while (area.children.length > MAX_AVISOS) {
    (area.querySelector('[data-aviso]:not([data-nivel="lendo"])') ?? area.firstElementChild).remove();
  }
  // Só o aviso de sucesso some sozinho; atenção, erro e "lendo" ficam até serem resolvidos.
  if (nivel === 'sucesso') setTimeout(() => aviso.remove(), SEGUNDOS_ATE_SUMIR * 1000);
  return aviso;
}

function avisar(resultado) {
  const { nivel, titulo, detalhe, confirmarAgora } = descreverResultado(resultado);
  colocarAviso({ nivel, titulo, detalhe, para: resultado.id, confirmarAgora });
}

/** Compras lidas ou lançadas que ainda não foram confirmadas: o estoque ainda não mudou por causa delas. */
export function comprasPendentes() {
  return estado.resultados.filter((r) => !r.confirmacao && (r.tipo === 'manual' || (r.tipo === 'mercadoria' && r.revisao)));
}

/** Nota que já está na lista: não é adicionada de novo, para o estoque não ser contado em dobro. */
function avisarDuplicada(existente, nomeDoArquivo) {
  const quem = existente.emitente?.nome ? ` (${existente.emitente.nome})` : '';
  const confirmada = Boolean(existente.confirmadaEm);
  const situacao = confirmada ? `já foi confirmada às ${fmtHora(existente.confirmadaEm)}` : existente.tipo === 'lendo' ? 'já está sendo lida' : 'já está na lista';
  colocarAviso({
    nivel: 'atencao',
    titulo: confirmada ? 'Esta nota já foi confirmada' : 'Esta nota já foi adicionada',
    detalhe: confirmada
      ? `${nomeDoArquivo} é a mesma nota que ${situacao}${quem}. O estoque já foi atualizado com ela, então ela não foi adicionada de novo.`
      : `${nomeDoArquivo} é a mesma nota que ${situacao}${quem}. Não foi adicionada de novo, então o estoque não é contado em dobro.`,
    para: existente.origemId ?? existente.id,
  });
}

/** Tudo o que já foi lido ou confirmado: contra isso é que se confere se uma nota é repetida. */
const jaConhecidas = (extras = []) => [...extras, ...estado.resultados, ...registroConfirmadas];

/** Aviso de "lendo" assim que o arquivo é escolhido: a foto leva até ~40 s e o cartão fica lá embaixo na página. */
function avisoDeLeitura(cartao, arquivo) {
  const ehFoto = arquivo.type.startsWith('image/') || EXT_IMAGEM.includes(extensao(arquivo.name));
  const mostrar = () => {
    if (!estado.resultados.some((r) => r.id === cartao.id && r.tipo === 'lendo')) return; // já terminou ou foi cancelado
    colocarAviso({
      nivel: 'lendo',
      titulo: ehFoto ? 'Arquivo recebido: lendo a foto…' : 'Arquivo recebido: lendo…',
      detalhe: `${cartao.arquivo}${ehFoto ? ' · pode levar até 40 segundos' : ''}`,
      para: cartao.id,
      cancelavel: true,
    });
  };
  // Foto sempre demora: avisa na hora. XML e PDF costumam terminar antes de 0,3 s: não piscam um aviso à toa.
  if (ehFoto) mostrar(); else setTimeout(mostrar, 300);
}

const avisoDaLeitura = (id) => raizAtual?.querySelector(`[data-aviso][data-nivel="lendo"][data-para="${id}"]`);

/** Leva a tela até o resultado e coloca o foco no título dele. */
function irParaResultado(id) {
  const cartao = raizAtual?.querySelector(`article[data-id="${id}"]`);
  if (!cartao) return false;
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cartao.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
  const titulo = cartao.querySelector('h2');
  if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
  cartao.classList.add('resultado--destaque'); // deixa claro qual é, entre várias notas
  setTimeout(() => cartao.classList.remove('resultado--destaque'), 2200);
  return true;
}

// ---- Tela ----------------------------------------------------------------------

export function telaCompras() {
  return `
    <div data-compras>
      <div class="avisos-flutuantes" data-avisos></div>
      <label class="envio" data-envio>
        <input class="envio__campo" type="file" multiple accept=".xml,.pdf,image/*,application/xml,text/xml" data-arquivo>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>
        <span class="envio__titulo">Arraste a nota fiscal até aqui</span>
        <span class="envio__texto">ou</span>
        <span class="botao botao--primario">Escolher arquivo</span>
        <span class="envio__ajuda">Aceita <strong>XML</strong> (leitura exata), <strong>PDF</strong> e <strong>foto</strong> (leitura experimental, sempre para conferir).
          O arquivo fica só no seu navegador e não é enviado a lugar nenhum.</span>
      </label>

      ${htmlFormularioManual()}

      ${htmlConfigAlerta()}

      <div class="resultados__topo" data-topo hidden>
        <h2>Notas lidas</h2>
        <button type="button" class="botao botao--secundario" data-limpar>Limpar tudo</button>
      </div>
      <div class="resultados" data-resultados aria-live="polite"></div>
    </div>`;
}

function desenhar() {
  if (!raizAtual) return;
  raizAtual.querySelector('[data-resultados]').innerHTML = estado.resultados.map(htmlResultado).join('');
  raizAtual.querySelector('[data-topo]').hidden = estado.resultados.length === 0;
}

function atualizarProgresso(id, texto) {
  const alvo = raizAtual?.querySelector(`[data-progresso="${id}"]`);
  if (alvo) alvo.textContent = texto;
}

async function receber(lista) {
  const arquivos = [...lista];
  if (arquivos.length === 0) return;

  // 1) Identifica cada arquivo e recusa, já aqui, o que for idêntico a algo que está na lista.
  //    Para foto isso poupa a espera da leitura.
  const aceitos = [];
  for (const arquivo of arquivos) {
    const hash = arquivo.size <= LIMITE_BYTES ? await impressaoDigital(arquivo) : '';
    const repetido = acharArquivoIdentico(hash, jaConhecidas(aceitos.map((x) => x.cartao)));
    if (repetido) { avisarDuplicada(repetido, arquivo.name); continue; }
    aceitos.push({ arquivo, cartao: { id: estado.proximoId++, arquivo: arquivo.name, tipo: 'lendo', progresso: '', hash } });
  }
  if (aceitos.length === 0) return;

  estado.resultados = [...aceitos.map((x) => x.cartao), ...estado.resultados]; // lote mais recente no topo, na ordem escolhida
  desenhar();
  aceitos.forEach(({ arquivo, cartao }) => avisoDeLeitura(cartao, arquivo));

  // 2) Lê um por vez.
  for (const { arquivo, cartao } of aceitos) {
    const { id, arquivo: nome, hash } = cartao;
    const resultado = await processar(arquivo, (p) => {
      const texto = `Lendo a foto: preparo ${p.passo} de ${p.total} (${p.nome})…`;
      const atual = estado.resultados.find((r) => r.id === id);
      if (atual) atual.progresso = texto;
      atualizarProgresso(id, texto);
      const detalhe = avisoDaLeitura(id)?.querySelector('[data-aviso-detalhe]');
      if (detalhe) detalhe.textContent = `${nome} · preparo ${p.passo} de ${p.total} (${p.nome}) · pode levar até 40 segundos`;
    });
    avisoDaLeitura(id)?.remove();

    const posicao = estado.resultados.findIndex((r) => r.id === id);
    if (posicao < 0) { desenhar(); continue; } // a pessoa cancelou enquanto lia

    const pronto = { id, arquivo: nome, hash, ...resultado };
    if (pronto.tipo === 'mercadoria') {
      // Mesma nota em outro formato (XML e PDF) ou com outro nome: reconhecida pela chave de acesso ou por CNPJ + número.
      const igual = acharNotaDuplicada(pronto, jaConhecidas());
      if (igual) {
        estado.resultados.splice(posicao, 1);
        desenhar();
        avisarDuplicada(igual, nome);
        continue;
      }
      criarRevisao(pronto); // sugere o insumo de cada item
    }
    estado.resultados[posicao] = pronto;
    desenhar();
    avisar(pronto);
  }
}

let bloqueioGlobalLigado = false;

export function iniciarCompras(conteudo) {
  const raiz = conteudo.querySelector('[data-compras]');
  raizAtual = raiz;
  const envio = raiz.querySelector('[data-envio]');
  const campo = raiz.querySelector('[data-arquivo]');

  // Se soltar o arquivo fora da área, o navegador não deve abri-lo e sair do piloto.
  if (!bloqueioGlobalLigado) {
    for (const nome of ['dragover', 'drop']) window.addEventListener(nome, (e) => e.preventDefault());
    bloqueioGlobalLigado = true;
  }

  campo.addEventListener('change', async () => {
    const lista = [...campo.files];
    campo.value = ''; // permite enviar o mesmo arquivo de novo
    await receber(lista);
  });

  for (const nome of ['dragenter', 'dragover']) {
    envio.addEventListener(nome, (e) => { e.preventDefault(); envio.classList.add('envio--ativo'); });
  }
  for (const nome of ['dragleave', 'drop']) {
    envio.addEventListener(nome, () => envio.classList.remove('envio--ativo'));
  }
  envio.addEventListener('drop', (e) => { e.preventDefault(); receber(e.dataTransfer.files); });

  // Compra sem nota: o resultado entra no topo da lista, como qualquer nota lida.
  ligarFormularioManual(raiz, (compra, forcar) => {
    const igual = forcar ? null : acharCompraDuplicada(compra, jaConhecidas());
    if (igual) {
      colocarAviso({
        nivel: 'atencao',
        titulo: 'Já existe uma compra igual',
        detalhe: 'Mesmo fornecedor, data e itens de uma compra que já está na lista ou já foi confirmada. Se for outra compra idêntica, use "Registrar mesmo assim".',
        para: igual.origemId ?? igual.id,
      });
      return igual; // o formulário mantém o que foi digitado
    }
    const registrada = { id: estado.proximoId++, ...compra };
    estado.resultados = [registrada, ...estado.resultados];
    desenhar();
    avisar(registrada);
    return null;
  });

  raiz.addEventListener('click', (e) => {
    const aviso = e.target.closest('[data-aviso]');
    if (aviso) {
      if (e.target.closest('[data-confirmar-agora]')) {
        // Um clique no próprio aviso confirma a compra que acabou de ser lançada.
        const compra = estado.resultados.find((r) => r.id === Number(aviso.dataset.para));
        aviso.remove();
        if (compra && !compra.confirmacao) tratarConfirmacao(compra, 'confirmar-compra');
      } else if (e.target.closest('[data-ver-resultado]')) {
        const achou = irParaResultado(Number(aviso.dataset.para));
        if (!achou) aviso.querySelector('[data-ver-resultado]').remove(); // o resultado já foi removido da lista
        else if (aviso.dataset.nivel !== 'lendo') aviso.remove(); // o aviso de leitura fica até a leitura terminar
      } else if (e.target.closest('[data-cancelar-leitura]')) {
        const id = Number(aviso.dataset.para);
        estado.resultados = estado.resultados.filter((r) => r.id !== id);
        aviso.remove();
        desenhar();
      } else if (e.target.closest('[data-fechar-aviso]')) {
        aviso.remove();
      }
      return;
    }
    if (e.target.closest('[data-limpar]')) {
      estado.resultados.forEach(liberarArquivos);
      estado.resultados = [];
      raiz.querySelector('[data-avisos]').replaceChildren();
      desenhar();
      return;
    }
    const remover = e.target.closest('[data-remover]');
    if (remover) {
      const id = Number(remover.closest('[data-id]').dataset.id);
      estado.resultados.filter((r) => r.id === id).forEach(liberarArquivos);
      estado.resultados = estado.resultados.filter((r) => r.id !== id);
      raiz.querySelector(`[data-aviso][data-para="${id}"]`)?.remove();
      desenhar();
      return;
    }

    // Botões da conferência: confirmar, ignorar, desfazer, confirmar todos os sugeridos.
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const artigo = botao.closest('[data-id]');
    const r = estado.resultados.find((x) => x.id === Number(artigo.dataset.id));
    if (!r?.revisao) return;
    if (botao.dataset.acao === 'confirmar-compra' || botao.dataset.acao === 'desfazer-confirmacao') {
      tratarConfirmacao(r, botao.dataset.acao);
      return;
    }
    const linha = botao.closest('[data-linha]');
    const indice = linha ? Number(linha.dataset.linha) : 0;
    aplicarAcao(r, indice, botao.dataset.acao);
    redesenharCartao(r.id, linha ? `ins-${r.id}-${indice}` : null);
  });

  raiz.addEventListener('input', (e) => {
    if (!e.target.matches('[data-limite]')) return;
    const valor = Number(e.target.value);
    if (e.target.value === '' || !Number.isFinite(valor) || valor < 0) return;
    config.limitePercentual = valor;
    desenhar(); // as compras já confirmadas mostram os alertas de acordo com o novo limite
    atualizarNotaDoLimite();
  });

  // Campos da conferência: troca de insumo (refaz a linha) e correção de quantidade ou valor (atualiza só os resumos).
  raiz.addEventListener('change', (e) => {
    const campoConf = e.target.closest('[data-campo]');
    if (!campoConf) return;
    const artigo = campoConf.closest('[data-id]');
    const r = estado.resultados.find((x) => x.id === Number(artigo.dataset.id));
    const li = campoConf.closest('[data-linha]');
    if (!r?.revisao || !li) return;
    const indice = Number(li.dataset.linha);
    const nome = campoConf.dataset.campo;
    aplicarAcao(r, indice, nome, campoConf.value);
    if (nome === 'insumo') {
      redesenharCartao(r.id, `ins-${r.id}-${indice}`);
    } else {
      atualizarTextosDaLinha(li, r, indice);
      atualizarResumos(artigo, r);
    }
  });

  desenhar();
  atualizarNotaDoLimite();
}

/** Confirma (ou desfaz) uma compra: mexe no estoque e no histórico, e avisa o resultado. */
function tratarConfirmacao(r, acao) {
  if (acao === 'confirmar-compra') {
    try {
      confirmarCompra(r);
    } catch (erro) {
      colocarAviso({ nivel: 'erro', titulo: 'Não foi possível confirmar a compra', detalhe: erro.message, para: r.id });
      return;
    }
    const alertas = alertasDaConfirmacao(r).length;
    const insumos = r.confirmacao.mudancas.length;
    colocarAviso({
      nivel: alertas ? 'atencao' : 'sucesso',
      titulo: alertas ? `Compra confirmada: ${alertas} ${alertas === 1 ? 'alerta' : 'alertas'} de preço` : 'Compra confirmada: estoque atualizado',
      detalhe: `${r.emitente?.nome ?? 'Compra'} · ${insumos} ${insumos === 1 ? 'insumo atualizado' : 'insumos atualizados'} no estoque${alertas ? ` · veja os produtos afetados` : ''}.`,
      para: r.id,
    });
  } else {
    desfazerConfirmacao(r);
    colocarAviso({ nivel: 'sucesso', titulo: 'Confirmação desfeita', detalhe: `${r.emitente?.nome ?? 'Compra'}: o estoque e o histórico de preços voltaram ao que eram. A nota pode ser conferida e confirmada de novo.`, para: r.id });
  }
  redesenharCartao(r.id);
  const titulo = raizAtual?.querySelector(`article[data-id="${r.id}"] h2`);
  if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
  atualizarNotaDoLimite();
}

/** Texto sob o limite: quantos alertas estão valendo nas compras confirmadas. */
function atualizarNotaDoLimite() {
  const nota = raizAtual?.querySelector('[data-limite-nota]');
  if (!nota) return;
  const confirmadas = estado.resultados.filter((r) => r.confirmacao);
  const alertas = confirmadas.reduce((s, r) => s + alertasDaConfirmacao(r).length, 0);
  nota.textContent = confirmadas.length === 0
    ? 'Nenhuma compra confirmada ainda. As compras confirmadas se ajustam sozinhas quando você muda o limite.'
    : `${alertas} ${alertas === 1 ? 'alerta' : 'alertas'} nas ${confirmadas.length} ${confirmadas.length === 1 ? 'compra confirmada' : 'compras confirmadas'}, com o limite de ${config.limitePercentual}%.`;
}

/** Refaz só o cartão de uma nota, mantendo o foco, o texto lido aberto e o resto da lista como está. */
function redesenharCartao(id, focoDepois) {
  const r = estado.resultados.find((x) => x.id === id);
  const atual = raizAtual?.querySelector(`article[data-id="${id}"]`);
  if (!r || !atual) return;
  const textoAberto = atual.querySelector('.texto-lido')?.open === true;
  atual.outerHTML = htmlResultado(r);
  const novo = raizAtual.querySelector(`article[data-id="${id}"]`);
  if (textoAberto && novo?.querySelector('.texto-lido')) novo.querySelector('.texto-lido').open = true;
  if (focoDepois) novo?.querySelector(`[data-foco="${focoDepois}"]`)?.focus();
}

/** Libera da memória o arquivo do recibo anexado a uma compra removida. */
function liberarArquivos(r) {
  if (r.recibo?.arquivo?.url) URL.revokeObjectURL(r.recibo.arquivo.url);
}

const elementoDe = (html) => {
  const molde = document.createElement('template');
  molde.innerHTML = html.trim();
  return molde.content.firstElementChild;
};

/** Quantidade ou valor mudou: atualiza topo, rodapé e situação, sem recriar os campos. */
function atualizarResumos(artigo, r) {
  artigo.querySelector('[data-conf-topo]')?.replaceWith(elementoDe(htmlTopoConferencia(r)));
  artigo.querySelector('[data-conf-rodape]')?.replaceWith(elementoDe(htmlRodapeConferencia(r)));
  artigo.querySelector('[data-conf-status]')?.replaceWith(elementoDe(htmlStatusConferencia(r)));
}
