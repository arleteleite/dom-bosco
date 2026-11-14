// Tela de Estoque (etapa 3): lista de insumos com busca, filtros, alertas
// e ajuste de saldo por contagem. Tudo em memória: recarregar a página desfaz.

import { INSUMOS, FORNECEDORES, ORIGENS, situacao, ultimaCompra, precoPorBase, rotuloBase } from './dados.js';
import { config } from './confirmacao.js';
import { comprasPendentes } from './tela-compras.js';
import { fmtQtd, fmtValidade, fmtMoeda, fmtPercentual, dataDeDias, esc } from './formato.js';

// Quantos g/ml/un correspondem a 1 unidade mostrada ao digitar (kg, L, un).
const FATOR_DIGITACAO = { g: 1000, ml: 1000, un: 1 };
const ROTULO_DIGITACAO = { g: 'kg', ml: 'L', un: 'un' };

// Só insumos ativos aparecem; as categorias são lidas a cada uso porque o cadastro pode receber insumos novos.
const ativos = () => INSUMOS.filter((i) => i.ativo !== false);
const categorias = () => [...new Set(ativos().map((i) => i.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const subgruposDe = (categoria) => [...new Set(ativos().filter((i) => i.categoria === categoria).map((i) => i.subgrupo))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

// O estado fica fora da função para os filtros sobreviverem à troca de tela.
const estado = {
  busca: '',
  filtro: 'todos', // todos | baixo | vence
  categoria: 'todas',
  subgrupo: 'todos',
  editando: null,
  erro: '',
  aviso: '',
  contados: new Set(),
};

const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Categoria e busca valem tanto para a lista quanto para os números dos botões.
function passaCategoriaEBusca(insumo) {
  if (estado.categoria !== 'todas' && insumo.categoria !== estado.categoria) return false;
  if (estado.categoria !== 'todas' && estado.subgrupo !== 'todos' && insumo.subgrupo !== estado.subgrupo) return false;
  if (estado.busca) {
    const termo = normalizar(estado.busca.trim());
    const alvos = [insumo.nome, insumo.subgrupo, ...insumo.apelidos].map(normalizar);
    if (!alvos.some((a) => a.includes(termo))) return false;
  }
  return true;
}

// O botão de situação (abaixo do mínimo / vence em breve) vale só para a lista.
function passaNoFiltro(insumo) {
  if (!passaCategoriaEBusca(insumo)) return false;
  const s = situacao(insumo);
  if (estado.filtro === 'baixo' && !s.abaixoDoMinimo) return false;
  if (estado.filtro === 'vence' && !s.venceEmBreve) return false;
  return true;
}

// Itens com alerta primeiro; dentro de cada grupo, ordem alfabética.
function prioridade(insumo) {
  const s = situacao(insumo);
  return s.abaixoDoMinimo ? 0 : s.venceEmBreve ? 1 : 2;
}

// Números dos botões: contam só o que passa na categoria e na busca atuais.
function contagens() {
  let todos = 0;
  let baixo = 0;
  let vence = 0;
  for (const i of ativos()) {
    if (!passaCategoriaEBusca(i)) continue;
    todos += 1;
    const s = situacao(i);
    if (s.abaixoDoMinimo) baixo += 1;
    if (s.venceEmBreve) vence += 1;
  }
  return { todos, baixo, vence };
}

const nomeDoFornecedor = (e) => e.fornecedorNome ?? FORNECEDORES.find((f) => f.id === e.fornecedorId)?.nome ?? '—';

/** Chip com a variação de uma compra sobre a anterior; destaca quando passa do limite de alerta. */
function chipDeVariacao(atual, anterior) {
  if (!anterior) return '';
  const v = (atual - anterior) / anterior;
  if (v === 0) return '<span class="chip chip--neutro">sem variação</span>';
  const passou = Math.abs(v * 100) >= config.limitePercentual;
  return `<span class="chip ${!passou ? 'chip--neutro' : v > 0 ? 'chip--alerta' : 'chip--aviso'}">${fmtPercentual(v)}</span>`;
}

function htmlPreco(insumo) {
  const h = insumo.historico;
  const ultima = ultimaCompra(insumo);
  if (!ultima) return '<span class="sub item__preco">Ainda sem compra: o preço aparece depois da primeira compra confirmada.</span>';
  const anterior = h.length > 1 ? h[h.length - 2].preco : null;
  return `<span class="sub item__preco">Último preço: ${fmtMoeda(ultima.preco)} por ${esc(insumo.compra.rotulo)} · ${fmtMoeda(precoPorBase(insumo, ultima.preco))}/${rotuloBase(insumo)} ${chipDeVariacao(ultima.preco, anterior)}</span>`;
}

function htmlHistorico(insumo) {
  const h = insumo.historico;
  const linhas = [...h].reverse().slice(0, 12).map((e, k, lista) => {
    const anterior = lista[k + 1]; // a compra imediatamente mais antiga
    return `
      <li>
        <span class="historico__data">${dataDeDias(e.diasAtras)}</span>
        <span class="historico__quem">${esc(nomeDoFornecedor(e))} <span class="chip chip--neutro">${esc(ORIGENS[e.origem] ?? e.origem)}</span></span>
        <span class="historico__preco"><strong>${fmtMoeda(e.preco)}</strong> <span class="sub">${esc(insumo.compra.rotulo)} · ${fmtMoeda(precoPorBase(insumo, e.preco))}/${rotuloBase(insumo)}</span></span>
        <span class="historico__var">${chipDeVariacao(e.preco, anterior?.preco)}</span>
      </li>`;
  }).join('');
  return `
    <details class="historico item__historico">
      <summary>Histórico de preços (${h.length})</summary>
      <ul class="historico__lista">${linhas}</ul>
    </details>`;
}

function htmlItem(insumo) {
  const s = situacao(insumo);
  const { saldo, minimo, validadeEmDias } = insumo.estoque;
  const classe = s.abaixoDoMinimo ? ' item--alerta' : s.venceEmBreve ? ' item--aviso' : '';
  const largura = minimo > 0 ? Math.max(2, Math.min(100, Math.round((saldo / minimo) * 100))) : (saldo > 0 ? 100 : 2);

  const chips = [];
  if (s.abaixoDoMinimo) chips.push('<span class="chip chip--alerta">abaixo do mínimo</span>');
  if (s.venceEmBreve) chips.push('<span class="chip chip--aviso">vence em breve</span>');

  const entradaDeCompra = (insumo) => {
    const e = insumo.estoque.ultimaEntrada;
    return e ? `<span class="sub item__entrada">entrada de compra: + ${fmtQtd(e.qtdUso, insumo.uso)}</span>` : '';
  };
  const contado = estado.contados.has(insumo.id)
    ? '<span class="sub item__contado">contado agora</span>'
    : '';

  const formulario = estado.editando === insumo.id ? htmlContagem(insumo) : '';

  return `
    <li class="item${classe}" data-id="${esc(insumo.id)}">
      <div class="item__nome">
        <strong>${esc(insumo.nome)}</strong>
        <span class="sub">${esc(insumo.categoria)} › ${esc(insumo.subgrupo)}${insumo.novo && insumo.historico.length === 0 ? ' · <strong>novo</strong>' : ''}</span>
        ${htmlPreco(insumo)}
      </div>
      <div class="item__saldo">
        <span class="item__qtd">${fmtQtd(saldo, insumo.uso)}<small>${minimo > 0 ? `mín. ${fmtQtd(minimo, insumo.uso)}` : 'sem mínimo definido'}</small></span>
        <div class="barra" aria-hidden="true"><span style="width:${largura}%"></span></div>
        ${contado}
        ${entradaDeCompra(insumo)}
      </div>
      <div class="item__validade">
        <span>${esc(fmtValidade(validadeEmDias))}</span>
        ${chips.join('')}
      </div>
      <div class="item__acao">
        <button type="button" class="botao botao--secundario" data-acao="contar"
          aria-label="Contar ${esc(insumo.nome)}">Contar</button>
      </div>
      ${htmlHistorico(insumo)}
      ${formulario}
    </li>`;
}

function htmlContagem(insumo) {
  const fator = FATOR_DIGITACAO[insumo.uso];
  const atual = Math.round((insumo.estoque.saldo / fator) * 1000) / 1000;
  const unidade = ROTULO_DIGITACAO[insumo.uso];
  return `
    <form class="contagem" data-form="contagem" novalidate>
      <label>Quanto tem agora?
        <span class="contagem__entrada">
          <input class="campo" name="saldo" type="number" inputmode="decimal" min="0" step="any"
            value="${atual}" data-foco aria-describedby="erro-${esc(insumo.id)}">
          <span>${unidade}</span>
        </span>
      </label>
      <button type="submit" class="botao botao--primario">Salvar contagem</button>
      <button type="button" class="botao botao--secundario" data-acao="cancelar">Cancelar</button>
      <p class="contagem__erro" id="erro-${esc(insumo.id)}" role="alert">${esc(estado.erro)}</p>
    </form>`;
}

function htmlFiltro(chave, rotulo, n) {
  const ativo = estado.filtro === chave;
  return `<button type="button" class="filtro" data-filtro="${chave}" aria-pressed="${ativo}">${rotulo}<span class="filtro__n">${n}</span></button>`;
}

/** O seletor de subgrupo só vale depois de escolher uma categoria e mostra apenas os subgrupos dela. */
function htmlSubgrupos() {
  if (estado.categoria === 'todas') return '<option value="todos">Escolha uma categoria</option>';
  return ['<option value="todos">Todos os subgrupos</option>']
    .concat(subgruposDe(estado.categoria).map((s) => `<option value="${esc(s)}"${s === estado.subgrupo ? ' selected' : ''}>${esc(s)}</option>`))
    .join('');
}

/** Se há compra lançada mas não confirmada, o saldo ainda não mudou: diz isso e leva até a confirmação. */
function desenharPendencias(raiz) {
  const caixa = raiz.querySelector('[data-pendentes]');
  const pendentes = comprasPendentes();
  if (pendentes.length === 0) { caixa.innerHTML = ''; return; }
  const nomes = pendentes.slice(0, 3).map((r) => esc(r.emitente?.nome ?? r.arquivo)).join('; ');
  const um = pendentes.length === 1;
  caixa.innerHTML = `
    <div class="aviso-estoque" role="status">
      <p><strong>${pendentes.length} ${um ? 'compra aguardando confirmação' : 'compras aguardando confirmação'}.</strong>
        O estoque ainda <strong>não</strong> foi atualizado com ${um ? 'ela' : 'elas'} (${nomes}${pendentes.length > 3 ? '…' : ''}).</p>
      <a class="botao botao--primario" href="#/compras">Ir para Compras e confirmar</a>
    </div>`;
}

function desenhar(raiz) {
  desenharPendencias(raiz);
  const seletor = raiz.querySelector('[data-subgrupo]');
  seletor.innerHTML = htmlSubgrupos();
  seletor.disabled = estado.categoria === 'todas';
  const n = contagens();
  raiz.querySelector('[data-filtros]').innerHTML =
    htmlFiltro('todos', 'Todos', n.todos) +
    htmlFiltro('baixo', 'Abaixo do mínimo', n.baixo) +
    htmlFiltro('vence', 'Vence em breve', n.vence);

  const itens = ativos().filter(passaNoFiltro).sort(
    (a, b) => prioridade(a) - prioridade(b)
      || a.categoria.localeCompare(b.categoria, 'pt-BR')
      || a.subgrupo.localeCompare(b.subgrupo, 'pt-BR')
      || a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  raiz.querySelector('[data-lista]').innerHTML = itens.length
    ? itens.map(htmlItem).join('')
    : '<li class="vazio">Nenhum insumo encontrado com esse filtro.</li>';

  raiz.querySelector('[data-aviso]').textContent = estado.aviso;
}

function salvarContagem(raiz, id, texto) {
  const insumo = INSUMOS.find((i) => i.id === id);
  const valor = Number(texto);
  if (texto.trim() === '' || !Number.isFinite(valor) || valor < 0) {
    estado.erro = 'Digite um número igual ou maior que zero.';
    desenhar(raiz);
    raiz.querySelector('[data-foco]')?.focus();
    return;
  }
  const novoSaldo = Math.round(valor * FATOR_DIGITACAO[insumo.uso] * 1000) / 1000;
  insumo.estoque.saldo = novoSaldo;
  estado.contados.add(id);
  estado.editando = null;
  estado.erro = '';
  estado.aviso = `Saldo de ${insumo.nome} ajustado para ${fmtQtd(novoSaldo, insumo.uso)}.`;
  desenhar(raiz);
}

function ligarEventos(raiz) {
  raiz.addEventListener('input', (e) => {
    if (e.target.matches('[data-busca]')) {
      estado.busca = e.target.value;
      estado.aviso = '';
      desenhar(raiz);
    }
  });

  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[data-categoria]')) {
      estado.categoria = e.target.value;
      estado.subgrupo = 'todos'; // mudou de categoria: volta a mostrar todos os subgrupos
      estado.editando = null;
      estado.aviso = '';
      desenhar(raiz);
    } else if (e.target.matches('[data-subgrupo]')) {
      estado.subgrupo = e.target.value;
      estado.editando = null;
      estado.aviso = '';
      desenhar(raiz);
    }
  });

  raiz.addEventListener('click', (e) => {
    const filtro = e.target.closest('[data-filtro]');
    if (filtro) {
      estado.filtro = filtro.dataset.filtro;
      estado.editando = null;
      estado.aviso = '';
      desenhar(raiz);
      return;
    }
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    if (botao.dataset.acao === 'contar') {
      estado.editando = botao.closest('[data-id]').dataset.id;
      estado.erro = '';
      estado.aviso = '';
      desenhar(raiz);
      const campo = raiz.querySelector('[data-foco]');
      campo?.focus();
      campo?.select();
    } else if (botao.dataset.acao === 'cancelar') {
      estado.editando = null;
      estado.erro = '';
      desenhar(raiz);
    }
  });

  raiz.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-form="contagem"]')) return;
    e.preventDefault();
    salvarContagem(raiz, estado.editando, e.target.elements.saldo.value);
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && estado.editando) {
      estado.editando = null;
      estado.erro = '';
      desenhar(raiz);
    }
  });
}

export function telaEstoque() {
  const opcoes = ['<option value="todas">Todas as categorias</option>']
    .concat(categorias().map((c) => `<option value="${esc(c)}"${c === estado.categoria ? ' selected' : ''}>${esc(c)}</option>`))
    .join('');

  return `
    <div data-estoque>
      <div data-pendentes></div>
      <div class="ferramentas">
        <div class="busca">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input class="campo" type="search" data-busca placeholder="Buscar insumo" aria-label="Buscar insumo"
            value="${esc(estado.busca)}" autocomplete="off">
        </div>
        <select class="campo" data-categoria aria-label="Categoria">${opcoes}</select>
        <select class="campo" data-subgrupo aria-label="Subgrupo"></select>
      </div>
      <div class="filtros" data-filtros role="group" aria-label="Filtrar por situação"></div>
      <div class="aviso-contagem" data-aviso role="status" aria-live="polite"></div>
      <ul class="lista-estoque" data-lista></ul>
      <p class="rodape-nota">
        Contagens feitas aqui valem só até recarregar a página.
        <a class="link" href="#/dados-exemplo">Ver os dados de exemplo →</a>
      </p>
    </div>`;
}

export function iniciarEstoque(conteudo) {
  const raiz = conteudo.querySelector('[data-estoque]');
  estado.editando = null;
  estado.erro = '';
  estado.aviso = '';
  ligarEventos(raiz);
  desenhar(raiz);
}
