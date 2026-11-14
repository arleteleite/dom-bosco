// Conferência de uma nota: cada item é ligado a um insumo, trocado ou ignorado, e a quantidade
// que entra no estoque é conferida. Nada daqui grava: a compra só é confirmada na etapa seguinte.

import { rotuloBase, insumosAgrupados, buscarInsumo, insumosAtivos } from './dados.js';
import { sugerir, converterQuantidade, IGNORAR } from './vinculo.js';
import { fmtMoeda, fmtNumero, esc } from './formato.js';

// Quantas g/mL/un valem 1 kg/L/un (a tela mostra kg, L e un; o controle é em g, mL e un).
const FATOR = { g: 1000, ml: 1000, un: 1 };
const UNIDADE_TELA = { g: 'kg', ml: 'L', un: 'un' };
const arredondar = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

export const insumoDe = (id) => buscarInsumo(id);

/** O que o piloto já aprendeu nesta sessão: fornecedor + código do item → insumo (ou "ignorar"). */
export const memoria = new Map();

// ---- Estado -----------------------------------------------------------------------

function recalcularQuantidade(linha, item) {
  const insumo = insumoDe(linha.insumoId);
  if (!insumo) { linha.qtdUso = null; linha.qtdTexto = ''; linha.qtdConfianca = 'certa'; return; }
  const c = converterQuantidade(item, insumo);
  linha.qtdTexto = c.texto;
  linha.qtdConfianca = c.confianca;
  if (!linha.qtdEditada) linha.qtdUso = c.qtdUso;
}

/** Prepara a conferência de uma nota lida (XML, PDF ou foto): sugere o vínculo de cada item. */
export function criarRevisao(r) {
  const fornecedor = r.emitente?.documento || r.emitente?.nome || '';
  r.revisao = {
    fornecedor,
    itens: r.itens.map((item) => {
      const s = sugerir(item, insumosAtivos(), memoria, fornecedor);
      const linha = {
        chave: s.chave, candidatos: s.candidatos, sugestao: s.sugestao,
        insumoId: s.sugestao?.tipo === 'insumo' ? s.sugestao.id : null,
        status: s.sugestao ? 'sugerido' : 'sem', anterior: null,
        qtdUso: null, qtdTexto: '', qtdConfianca: 'certa', qtdEditada: false,
        valor: arredondar(item.valorProduto - (item.desconto ?? 0)), valorEditado: false,
      };
      recalcularQuantidade(linha, item);
      return linha;
    }),
  };
}

function confirmar(linha) {
  if (linha.sugestao?.tipo === 'ignorar' && !linha.insumoId) {
    linha.status = 'ignorado';
    memoria.set(linha.chave, IGNORAR);
  } else if (linha.insumoId) {
    linha.status = 'ligado';
    memoria.set(linha.chave, linha.insumoId);
  }
}

/** Aplica uma ação da pessoa a uma linha da conferência. */
export function aplicarAcao(r, indice, acao, valor) {
  const linha = r.revisao.itens[indice];
  const item = r.itens[indice];
  switch (acao) {
    case 'insumo':
      linha.qtdEditada = false;
      if (valor === '') { linha.insumoId = null; linha.status = 'sem'; if (memoria.get(linha.chave) !== IGNORAR) memoria.delete(linha.chave); }
      else { linha.insumoId = valor; linha.status = 'ligado'; memoria.set(linha.chave, valor); }
      recalcularQuantidade(linha, item);
      break;
    case 'confirmar': confirmar(linha); break;
    case 'ignorar':
      linha.anterior = linha.status;
      linha.status = 'ignorado';
      memoria.set(linha.chave, IGNORAR);
      break;
    case 'desfazer':
      linha.status = linha.anterior && linha.anterior !== 'ignorado' ? linha.anterior : (linha.insumoId ? 'sugerido' : 'sem');
      if (memoria.get(linha.chave) === IGNORAR) memoria.delete(linha.chave);
      break;
    case 'qtd': {
      const n = Number(valor);
      if (Number.isFinite(n) && n >= 0) { linha.qtdUso = n * FATOR[insumoDe(linha.insumoId).uso]; linha.qtdEditada = true; }
      break;
    }
    case 'valor': {
      const n = Number(valor);
      if (Number.isFinite(n) && n >= 0) { linha.valor = arredondar(n); linha.valorEditado = true; }
      break;
    }
    case 'confirmar-todos':
      // Só o que o piloto tem confiança alta; os "confirme" ficam para a pessoa decidir um a um.
      r.revisao.itens.forEach((l) => { if (l.status === 'sugerido' && l.sugestao?.nivel === 'alta') confirmar(l); });
      break;
    default:
  }
}

// ---- Resumos ------------------------------------------------------------------------

export function resumir(r) {
  const contagem = { ligado: 0, sugerido: 0, sem: 0, ignorado: 0 };
  const valores = { ligado: 0, sugerido: 0, sem: 0, ignorado: 0 };
  r.revisao.itens.forEach((l) => { contagem[l.status] += 1; valores[l.status] += l.valor; });
  const pendentes = contagem.sugerido + contagem.sem;
  return { contagem, valores, pendentes, concluida: pendentes === 0 && contagem.ligado > 0 };
}

/** O que entra no estoque: itens ligados, com as linhas do mesmo insumo somadas. */
export function agregarEntrada(r) {
  const grupos = new Map();
  r.revisao.itens.forEach((l) => {
    if (l.status !== 'ligado' || !l.insumoId || l.qtdUso === null) return;
    const g = grupos.get(l.insumoId) ?? { insumoId: l.insumoId, qtdUso: 0, valor: 0, linhas: 0 };
    g.qtdUso += l.qtdUso;
    g.valor += l.valor;
    g.linhas += 1;
    grupos.set(l.insumoId, g);
  });
  return [...grupos.values()];
}

// ---- HTML ---------------------------------------------------------------------------

const MOTIVO = { lembrado: 'lembrado de uma nota anterior', codigo: 'código de barras', nome: 'nome parecido', ambiguo: 'vários insumos parecidos: escolha' };

function chipStatus(linha) {
  switch (linha.status) {
    case 'ligado': return '<span class="chip chip--ok">Ligado</span>';
    case 'ignorado': return '<span class="chip chip--neutro">Ignorado</span>';
    case 'sem': return '<span class="chip chip--alerta">Sem vínculo</span>';
    default: {
      const s = linha.sugestao;
      if (s.tipo === 'ignorar') return '<span class="chip chip--aviso">Sugestão: ignorar (você ignorou antes)</span>';
      return `<span class="chip chip--aviso">Sugestão · ${s.nivel === 'alta' ? 'confiança alta' : 'confirme'} · ${MOTIVO[s.motivo]}</span>`;
    }
  }
}

function opcoesDoInsumo(linha) {
  const parecidos = linha.candidatos.filter((c) => c.score >= 0.3).slice(0, 3).map((c) => c.id);
  const opcao = (i) => `<option value="${esc(i.id)}"${i.id === linha.insumoId ? ' selected' : ''}>${esc(i.nome)}</option>`;
  const demais = insumosAgrupados(parecidos).map((g) => `<optgroup label="${esc(g.rotulo)}">${g.itens.map(opcao).join('')}</optgroup>`).join('');
  return `
    <option value=""${linha.insumoId ? '' : ' selected'}>— sem vínculo —</option>
    ${parecidos.length ? `<optgroup label="Mais parecidos">${parecidos.map((id) => opcao(insumoDe(id))).join('')}</optgroup>` : ''}
    ${demais}`;
}

const textoDaQuantidade = (linha) => (linha.qtdEditada ? 'Quantidade corrigida por você.' : esc(linha.qtdTexto));

function textoDoPreco(linha, insumo) {
  const fator = FATOR[insumo.uso];
  return linha.qtdUso > 0 && linha.valor > 0 ? `${fmtMoeda(linha.valor / (linha.qtdUso / fator))} por ${rotuloBase(insumo)}` : '';
}

/** Atualiza só os textos de apoio de uma linha (sem recriar os campos que a pessoa está digitando). */
export function atualizarTextosDaLinha(li, r, i) {
  const linha = r.revisao.itens[i];
  const insumo = insumoDe(linha.insumoId);
  const nota = li.querySelector('[data-hint-nota]');
  const preco = li.querySelector('[data-hint-preco]');
  if (nota) {
    nota.innerHTML = textoDaQuantidade(linha);
    nota.classList.toggle('sub--atencao', !(linha.qtdConfianca === 'certa' || linha.qtdEditada));
  }
  if (preco && insumo) preco.textContent = textoDoPreco(linha, insumo);
}

function htmlEstoque(r, i, linha) {
  const insumo = insumoDe(linha.insumoId);
  if (!insumo) return '<div class="conf-item__estoque conf-item__estoque--vazio">Escolha o insumo para ver a quantidade que entra no estoque.</div>';
  const fator = FATOR[insumo.uso];
  const qtdTela = linha.qtdUso === null ? '' : arredondar(linha.qtdUso / fator, 4);
  const id = `${r.id}-${i}`;
  return `
    <div class="conf-item__estoque">
      <label class="rotulo-pequeno" for="qtd-${id}">Entra no estoque</label>
      <span class="entrada${linha.qtdConfianca === 'incompativel' ? ' entrada--erro' : ''}">
        <input class="campo campo--pequeno" id="qtd-${id}" type="number" inputmode="decimal" min="0" step="any" value="${qtdTela}" data-campo="qtd" data-foco="qtd-${id}">
        <span>${UNIDADE_TELA[insumo.uso]}</span>
      </span>
      <span class="sub${linha.qtdConfianca === 'certa' || linha.qtdEditada ? '' : ' sub--atencao'}" data-hint-nota>${textoDaQuantidade(linha)}</span>
      <label class="rotulo-pequeno" for="valor-${id}">Valor (R$)</label>
      <span class="entrada">
        <input class="campo campo--pequeno" id="valor-${id}" type="number" inputmode="decimal" min="0" step="0.01" value="${linha.valor}" data-campo="valor" data-foco="valor-${id}">
      </span>
      <span class="sub" data-hint-preco>${textoDoPreco(linha, insumo)}</span>
    </div>`;
}

function htmlAcoes(linha) {
  const confirmarOuNada = linha.status === 'sugerido'
    ? `<button type="button" class="botao botao--pequeno botao--primario" data-acao="confirmar">${linha.sugestao.tipo === 'ignorar' ? 'Ignorar' : 'Confirmar'}</button>` : '';
  const ignorar = linha.status === 'ignorado'
    ? '<button type="button" class="botao botao--pequeno botao--secundario" data-acao="desfazer">Desfazer</button>'
    : (linha.status === 'sugerido' && linha.sugestao.tipo === 'ignorar' ? '' : '<button type="button" class="botao botao--pequeno botao--secundario" data-acao="ignorar">Ignorar</button>');
  // Item que não é nenhum insumo da lista: dá para cadastrar um novo a partir dele (formulário já preenchido com a nota).
  const novo = linha.status === 'ignorado' ? '' : '<button type="button" class="botao botao--pequeno botao--secundario" data-acao="novo-insumo">Cadastrar como novo insumo</button>';
  return `<div class="conf-item__acoes">${confirmarOuNada}${novo}${ignorar}</div>`;
}

/** O sistema classifica sozinho: depois de escolher o insumo, mostra em que categoria e subgrupo ele foi parar. */
function classificacaoDe(linha) {
  const insumo = insumoDe(linha.insumoId);
  return insumo ? `<span class="sub" data-classificacao>Classificado em ${esc(insumo.categoria)} › ${esc(insumo.subgrupo)}</span>` : '';
}

function htmlLinha(r, i) {
  const item = r.itens[i];
  const linha = r.revisao.itens[i];
  const detalhes = [item.ean ? `EAN ${esc(item.ean)}` : '', item.codigo ? `cód. ${esc(item.codigo)}` : '', item.ncm ? `NCM ${esc(item.ncm)}` : ''].filter(Boolean).join(' · ');
  const marcas = [
    item.calculado ? '<span class="chip chip--aviso">valor calculado</span>' : '',
    item.suspeito || item.conferir ? '<span class="chip chip--alerta">conferir leitura</span>' : '',
  ].filter(Boolean).join(' ');
  const desc = item.desconto > 0 ? ` (desconto ${fmtMoeda(item.desconto)})` : '';
  const id = `${r.id}-${i}`;
  const mostraEstoque = linha.status !== 'ignorado';
  return `
    <li class="conf-item conf-item--${linha.status}" data-linha="${i}">
      <div class="conf-item__nota">
        <span class="conf-item__n">${item.numero}</span>
        <div>
          <strong>${esc(item.descricao || '(sem descrição)')}</strong>
          ${detalhes || marcas ? `<span class="sub">${detalhes}${detalhes && marcas ? ' ' : ''}${marcas}</span>` : ''}
          <span class="conf-item__conta">${fmtNumero(item.quantidade)} ${esc(item.unidade)} × ${fmtMoeda(item.valorUnitario)} = ${fmtMoeda(item.valorProduto)}${desc}</span>
        </div>
      </div>
      <div class="conf-item__vinculo">
        <label class="rotulo-pequeno" for="ins-${id}">Insumo</label>
        <select class="campo campo--pequeno" id="ins-${id}" data-campo="insumo" data-foco="ins-${id}">${opcoesDoInsumo(linha)}</select>
        ${chipStatus(linha)}
        ${classificacaoDe(linha)}
      </div>
      ${mostraEstoque ? htmlEstoque(r, i, linha) : '<div class="conf-item__estoque conf-item__estoque--vazio">Este item não entra no estoque.</div>'}
      ${htmlAcoes(linha)}
    </li>`;
}

export function htmlEntrada(r) {
  const grupos = agregarEntrada(r);
  if (grupos.length === 0) return '<p class="sub">Nada ligado ainda.</p>';
  const linhas = grupos.map((g) => {
    const insumo = insumoDe(g.insumoId);
    const preco = g.qtdUso > 0 ? g.valor / (g.qtdUso / FATOR[insumo.uso]) : null;
    return `
      <li class="entrada-item">
        <span class="entrada-item__nome">${esc(insumo.nome)}${g.linhas > 1 ? ` <span class="chip chip--neutro">${g.linhas} linhas somadas</span>` : ''}</span>
        <span class="entrada-item__qtd">+ ${fmtNumero(arredondar(g.qtdUso / FATOR[insumo.uso], 4))} ${UNIDADE_TELA[insumo.uso]}</span>
        <span class="entrada-item__valor">${fmtMoeda(g.valor)}${preco !== null ? ` <span class="sub">${fmtMoeda(preco)}/${rotuloBase(insumo)}</span>` : ''}</span>
      </li>`;
  }).join('');
  return `<ul class="entrada-lista">${linhas}</ul>`;
}

// O painel é dividido em partes para a tela poder atualizar topo, rodapé e situação
// sem recriar os campos que a pessoa está digitando.

export function htmlTopoConferencia(r) {
  const resumo = resumir(r);
  const c = resumo.contagem;
  const altos = r.revisao.itens.filter((l) => l.status === 'sugerido' && l.sugestao?.nivel === 'alta').length;
  const partes = [
    `<span class="chip chip--ok">${c.ligado} ligado${c.ligado === 1 ? '' : 's'}</span>`,
    c.sugerido ? `<span class="chip chip--aviso">${c.sugerido} sugerido${c.sugerido === 1 ? '' : 's'}</span>` : '',
    c.sem ? `<span class="chip chip--alerta">${c.sem} sem vínculo</span>` : '',
    c.ignorado ? `<span class="chip chip--neutro">${c.ignorado} ignorado${c.ignorado === 1 ? '' : 's'}</span>` : '',
  ].filter(Boolean).join(' ');

  // Deixa claro, no alto do cartão, que o estoque SÓ muda depois de confirmar a compra.
  let situacao;
  if (resumo.pendentes === 0 && c.ligado === 0) {
    situacao = '<div class="aguardando aguardando--nada" role="status"><p><strong>Nada a registrar.</strong> Todos os itens foram ignorados: o estoque não vai mudar.</p></div>';
  } else if (resumo.concluida) {
    situacao = `
      <div class="aguardando" role="status">
        <p><strong>O estoque ainda não foi atualizado com esta compra.</strong> A conferência está concluída: falta só confirmar.</p>
        <button type="button" class="botao botao--primario" data-acao="confirmar-compra">Confirmar compra e atualizar o estoque</button>
      </div>`;
  } else {
    situacao = `<div class="aguardando" role="status"><p><strong>O estoque ainda não foi atualizado com esta compra.</strong> Falta decidir ${resumo.pendentes} ${resumo.pendentes === 1 ? 'item' : 'itens'}; depois, confirme a compra.</p></div>`;
  }

  return `
    <div data-conf-topo>
      <div class="conf__topo">
        <div class="conf__chips">${partes}</div>
        ${altos ? `<button type="button" class="botao botao--secundario" data-acao="confirmar-todos">Aceitar as ${altos} sugestões de confiança alta</button>` : ''}
      </div>
      ${situacao}
    </div>`;
}

export function htmlRodapeConferencia(r) {
  const v = resumir(r).valores;
  return `
    <div class="conf__rodape" data-conf-rodape>
      <div>
        <h3>O que vai entrar no estoque</h3>
        ${htmlEntrada(r)}
      </div>
      <div>
        <h3>Valores conferidos</h3>
        <dl class="totais">
          <div class="totais__linha"><dt>Ligados a insumos</dt><dd>${fmtMoeda(v.ligado)}</dd></div>
          <div class="totais__linha"><dt>Ignorados</dt><dd>${fmtMoeda(v.ignorado)}</dd></div>
          <div class="totais__linha"><dt>Falta decidir</dt><dd>${fmtMoeda(v.sugerido + v.sem)}</dd></div>
          <div class="totais__linha totais__linha--forte"><dt>Total dos itens conferidos</dt><dd>${fmtMoeda(Object.values(v).reduce((s, x) => s + x, 0))}</dd></div>
        </dl>
      </div>
    </div>`;
}

export function htmlStatusConferencia(r) {
  const resumo = resumir(r);
  const c = resumo.contagem;
  const todos = r.revisao.itens.length;
  const embrulho = (html) => `<div data-conf-status>${html}</div>`;
  if (resumo.pendentes === 0 && c.ligado === 0) {
    return embrulho(`<p class="conferencia conferencia--alerta" role="status"><strong>Nada a registrar.</strong> ${todos === 1 ? 'O único item foi ignorado' : 'Todos os itens foram ignorados'}: nenhuma entrada no estoque.</p>`);
  }
  if (!resumo.concluida) {
    return embrulho(`<p class="conferencia conferencia--alerta" role="status"><strong>Falta decidir ${resumo.pendentes} de ${todos} ${todos === 1 ? 'item' : 'itens'}</strong> (${fmtMoeda(resumo.valores.sugerido + resumo.valores.sem)}): confirme a sugestão, escolha o insumo ou ignore.</p>`);
  }
  return embrulho(`
    <p class="conferencia conferencia--ok" role="status"><strong>Conferência concluída.</strong> ${c.ligado} ${c.ligado === 1 ? 'item ligado' : 'itens ligados'} a insumos e ${c.ignorado} ${c.ignorado === 1 ? 'ignorado' : 'ignorados'}.</p>
    <div class="conf__confirmar">
      <button type="button" class="botao botao--primario" data-acao="confirmar-compra">Confirmar compra e atualizar o estoque</button>
      <span class="sub">Nada muda no estoque antes de confirmar.</span>
    </div>`);
}

/** Painel de conferência de uma nota lida. */
export function htmlConferenciaDosItens(r) {
  return `
    <section class="conf" aria-label="Conferência dos itens">
      ${htmlTopoConferencia(r)}
      <ul class="conf__lista">${r.itens.map((_, i) => htmlLinha(r, i)).join('')}</ul>
      ${htmlRodapeConferencia(r)}
      ${htmlStatusConferencia(r)}
    </section>`;
}
