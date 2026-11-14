// Tela de Precificação (etapa 11): lista de produtos e ficha técnica editável com custo e preço "em conta aberta".
// Baixa fidelidade de propósito: serve para a proprietária dizer o que precisa, não para ser o sistema final.
// Nada é gravado: recarregar a página volta às fichas do UNIQ.

import { insumosAgrupados, buscarInsumo } from './dados.js';
import {
  PRODUTOS, AREAS, TIPOS, FONTES, UNIDADES_DE_RENDIMENTO, buscarProduto, novoProduto, adicionarProduto, removerProduto,
  duplicarProduto, custoUnitario, indicadores, precoPorMarkup, precoPorMargem, precoNoCartao, unidadesDaLinha, usoDaLinha,
  dependeDe, usadoEm,
} from './produtos.js';
import { abrirJanela } from './tela-cadastros.js';
import { config as configRateio, METODOS, gastosPorUnidade } from './gastos.js';
import { fmtMoeda, fmtNumero, fmtPercentual, esc } from './formato.js';

const filtro = { busca: '', area: 'todas' };
const FATOR_EXIBICAO = { g: 1000, ml: 1000, un: 1 };
const ROTULO_RENDE = { un: 'porções', g: 'g', ml: 'mL' };
const normalizar = (t) => String(t).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const numeroOuNulo = (t) => (String(t).trim() === '' || !Number.isFinite(Number(String(t).replace(',', '.'))) ? null : Number(String(t).replace(',', '.')));
const pct = (fracao) => fmtPercentual(fracao).replace(/^\+/, '');

/** Preço do insumo por kg, L ou un (o jeito que se fala na cozinha); o cálculo usa g, mL e un. */
function textoPrecoUso(precoUso, uso) {
  if (precoUso === null) return 'sem preço';
  return `${fmtMoeda(precoUso * FATOR_EXIBICAO[uso])} por ${uso === 'g' ? 'kg' : uso === 'ml' ? 'L' : 'un'}`;
}

// ---- Lista ------------------------------------------------------------------------------------

export function telaPrecificacao() {
  return '<div data-precificacao></div>';
}

function htmlResumoDoProduto(p) {
  const c = custoUnitario(p);
  const ind = p.tipo === 'preparo' ? null : indicadores(p, c.total);
  const unidade = p.tipo === 'preparo' ? `por ${ROTULO_RENDE[p.rende.unidade] === 'porções' ? 'porção' : ROTULO_RENDE[p.rende.unidade]}` : 'por unidade';
  const custoTexto = p.tipo === 'preparo' && p.rende.unidade !== 'un'
    ? `${fmtMoeda(c.total * 1000)} por ${p.rende.unidade === 'g' ? 'kg' : 'L'}`
    : `${fmtMoeda(c.total)} ${unidade}`;
  return `
    <li class="item item--produto" data-id="${esc(p.id)}">
      <div class="item__nome">
        <strong>${esc(p.nome)}</strong>
        <span class="sub">${esc(AREAS[p.area])} · ${esc(TIPOS[p.tipo].split(' (')[0])} · ${esc(FONTES[p.fonte])}</span>
        ${c.incompleto ? '<span class="chip chip--alerta">custo incompleto: falta preço de ingrediente</span>' : ''}
      </div>
      <div><span class="rotulo-pequeno">Custo</span><strong>${custoTexto}</strong></div>
      <div>
        <span class="rotulo-pequeno">Preço de venda</span>
        ${ind ? `<strong>${fmtMoeda(ind.preco)}</strong>${p.precoExemplo ? ' <span class="chip chip--neutro">exemplo</span>' : ''}
          <span class="sub">markup ${pct(ind.markup ?? 0)} · margem de contribuição ${pct(ind.contribuicaoPct)}</span>`
    : (p.tipo === 'preparo' ? '<span class="sub">não é vendido</span>' : '<span class="sub">sem preço</span>')}
      </div>
      <div class="item__acao"><a class="botao botao--secundario botao--pequeno" href="#/precificacao/${esc(p.id)}">Abrir ficha</a></div>
    </li>`;
}

function desenharLista(raiz) {
  const termo = normalizar(filtro.busca.trim());
  const lista = PRODUTOS.filter((p) => (filtro.area === 'todas' || p.area === filtro.area) && (!termo || normalizar(p.nome).includes(termo)))
    .sort((a, b) => Number(a.tipo === 'preparo') - Number(b.tipo === 'preparo') || a.nome.localeCompare(b.nome, 'pt-BR'));
  raiz.querySelector('[data-lista]').innerHTML = lista.length ? lista.map(htmlResumoDoProduto).join('') : '<li class="vazio">Nenhum produto encontrado.</li>';
}

function montarLista(raiz) {
  raiz.innerHTML = `
    <section class="cartao cartao--nota"><span class="selo">Etapa 11 · piloto</span>
      <p><strong>As fichas do bolo, do mini pão, da pizza e da rosquinha vêm do UNIQ e precisam ser conferidas.</strong>
      Os <strong>preços de venda são inventados</strong> (o UNIQ não os traz) e a massa e o molho de pizza foram criados só para mostrar sub-receita.
      O custo usa o <strong>preço da última compra</strong> de cada insumo (regra ainda em dúvida) e <strong>não inclui gastos gerais</strong> (energia, gás, folha): eles entram só na margem de lucro, pelo método escolhido em <a class="link" href="#/gastos">Gastos gerais</a>.</p>
    </section>
    <div class="ferramentas">
      <div class="busca">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input class="campo" type="search" data-busca placeholder="Buscar produto" aria-label="Buscar produto" value="${esc(filtro.busca)}" autocomplete="off">
      </div>
      <select class="campo" data-area aria-label="Área">
        <option value="todas">Padaria e pizzaria</option>${Object.entries(AREAS).map(([k, v]) => `<option value="${k}"${filtro.area === k ? ' selected' : ''}>${v}</option>`).join('')}
      </select>
      <button type="button" class="botao botao--primario" data-novo-produto>+ Novo produto</button>
    </div>
    <ul class="lista-estoque" data-lista></ul>`;
  raiz.querySelector('[data-busca]').addEventListener('input', (e) => { filtro.busca = e.target.value; desenharLista(raiz); });
  raiz.querySelector('[data-area]').addEventListener('change', (e) => { filtro.area = e.target.value; desenharLista(raiz); });
  raiz.querySelector('[data-novo-produto]').addEventListener('click', () => abrirNovoProduto());
  desenharLista(raiz);
}

function abrirNovoProduto() {
  abrirJanela('Novo produto', `
    <div class="janela__grade">
      <label class="janela__largo"><span class="rotulo-pequeno">Nome *</span><input class="campo" name="nome" maxlength="80" autocomplete="off" placeholder="ex.: Pizza de calabresa M"></label>
      <label><span class="rotulo-pequeno">Área</span><select class="campo" name="area">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label><span class="rotulo-pequeno">Tipo</span><select class="campo" name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
    </div>
    <p class="manual__erro" role="alert" data-erro></p>
    <div class="janela__acoes"><button type="button" class="botao botao--secundario" data-cancelar>Cancelar</button><button type="submit" class="botao botao--primario">Criar e abrir a ficha</button></div>`,
  (form, janela) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = form.elements.nome.value.trim();
      if (!nome) { form.querySelector('[data-erro]').textContent = 'Informe o nome do produto.'; form.elements.nome.focus(); return; }
      const p = adicionarProduto(novoProduto(nome, { area: form.elements.area.value, tipo: form.elements.tipo.value }));
      janela.close();
      location.hash = `#/precificacao/${p.id}`;
    });
  });
}

// ---- Ficha ------------------------------------------------------------------------------------

function opcoesDeIngrediente(p, linha) {
  const preparos = PRODUTOS.filter((x) => x.tipo === 'preparo' && x.id !== p.id && !dependeDe(x, p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const atual = `${linha.tipo}:${linha.refId}`;
  const opt = (valor, rotulo) => `<option value="${esc(valor)}"${valor === atual ? ' selected' : ''}>${esc(rotulo)}</option>`;
  const inativoAtual = linha.tipo === 'insumo' && buscarInsumo(linha.refId)?.ativo === false ? opt(atual, `${buscarInsumo(linha.refId).nome} (inativo)`) : '';
  return `
    <option value=""${linha.refId ? '' : ' selected'}>Escolha o ingrediente…</option>
    ${preparos.length ? `<optgroup label="Preparos (sub-receitas)">${preparos.map((x) => opt(`produto:${x.id}`, x.nome)).join('')}</optgroup>` : ''}
    ${inativoAtual}
    ${insumosAgrupados().map((g) => `<optgroup label="${esc(g.rotulo)}">${g.itens.map((i) => opt(`insumo:${i.id}`, i.nome)).join('')}</optgroup>`).join('')}`;
}

function htmlLinha(p, i, c) {
  const linha = p.linhas[i];
  const calc = c.linhas[i];
  const unidades = linha.refId ? unidadesDaLinha(linha) : [{ id: 'g', rotulo: 'g' }];
  const unAtual = unidades.some((u) => u.id === linha.un) ? linha.un : unidades[0].id;
  return `
    <li class="ing" data-linha="${i}">
      <label class="ing__item"><span class="rotulo-pequeno">Ingrediente</span>
        <select class="campo campo--pequeno" data-lcampo="ref" data-foco="ref-${i}">${opcoesDeIngrediente(p, linha)}</select></label>
      <label><span class="rotulo-pequeno">Quantidade</span>
        <input class="campo campo--pequeno" type="number" inputmode="decimal" min="0" step="any" value="${esc(linha.valor)}" data-lcampo="valor" data-foco="valor-${i}"></label>
      <label><span class="rotulo-pequeno">Unidade</span>
        <select class="campo campo--pequeno" data-lcampo="un">${unidades.map((u) => `<option value="${u.id}"${u.id === unAtual ? ' selected' : ''}>${esc(u.rotulo)}</option>`).join('')}</select></label>
      <div class="ing__preco"><span class="rotulo-pequeno">Preço</span><span data-ing-preco>${linha.refId ? esc(textoPrecoUso(calc.precoUso, usoDaLinha(linha))) : '—'}</span></div>
      <div class="ing__custo"><span class="rotulo-pequeno">Custo no lote</span><strong data-ing-custo>${calc.semPreco ? '—' : fmtMoeda(calc.custo)}</strong><span class="sub" data-ing-pct></span></div>
      <button type="button" class="botao botao--pequeno botao--secundario" data-remover-linha aria-label="Remover ingrediente">×</button>
      ${linha.obs ? `<p class="ing__obs sub sub--atencao">${esc(linha.obs)}</p>` : ''}
      ${calc.semPreco && linha.refId ? `<p class="ing__obs sub sub--atencao">${calc.ciclo ? 'Este preparo usa o produto em que está, o que não pode.' : calc.preparo ? 'O preparo tem ingrediente sem preço.' : 'Este insumo ainda não tem compra registrada: não entra no custo.'}</p>` : ''}
    </li>`;
}

function htmlConta(p, c) {
  const un = p.rende.unidade;
  const nome = un === 'un' ? 'porções' : un === 'g' ? 'g' : 'mL';
  const faltam = c.linhas.filter((l) => l.semPreco && l.linha.refId).map((l) => l.nome);
  const porUn = un === 'un' ? 'por porção' : `por ${un === 'g' ? 'kg' : 'L'}`;
  const mult = un === 'un' ? 1 : 1000;
  return `
    <ol class="conta">
      <li>Ingredientes do lote: <strong>${fmtMoeda(c.lote)}</strong></li>
      <li>Rende ${fmtNumero(p.rende.qtd || 0)} ${nome}${c.perda > 0 ? `, menos ${fmtNumero(c.perda)}% de perda = <strong>${fmtNumero(Math.round(c.vendaveis * 100) / 100)} ${nome} vendáveis</strong>` : ''}</li>
      <li>${fmtMoeda(c.lote)} ÷ ${fmtNumero(Math.round(c.vendaveis * 100) / 100)} = <strong>${fmtMoeda(c.porUnidade * mult)}</strong> ${porUn}</li>
      <li>+ outros custos informados à mão: ${fmtMoeda(c.outros * mult)}</li>
      <li class="conta__total">Custo ${porUn}: <strong>${fmtMoeda(c.total * mult)}</strong></li>
    </ol>
    <p class="sub">Este custo não inclui gastos gerais (energia, gás, água, folha): eles entram só na <strong>margem de lucro</strong>, pelo método escolhido em <a class="link" href="#/gastos">Gastos gerais</a>. Preço de cada insumo: o da última compra.</p>
    ${faltam.length ? `<p class="conferencia conferencia--alerta" role="alert"><strong>Custo incompleto.</strong> Sem preço: ${esc([...new Set(faltam)].join(', '))}. O total está menor do que o real.</p>` : ''}`;
}

function htmlPrecoResultado(p, c) {
  const gastos = gastosPorUnidade(p);
  const ind = indicadores(p, c.total, gastos);
  const markup = numeroOuNulo(p.markupDesejado);
  const margem = numeroOuNulo(p.margemDesejada);
  const imp = (Number(p.impostosPct) || 0) / 100;
  const sugMarkup = markup === null ? null : precoPorMarkup(c.total, markup / 100);
  const sugMargem = margem === null ? null : precoPorMargem(c.total, margem / 100, imp);
  const botaoUsar = (v) => (v === null ? '' : `<button type="button" class="botao botao--pequeno botao--secundario" data-usar-preco="${Math.round(v * 100) / 100}">Usar este preço</button>`);
  const taxa = numeroOuNulo(p.taxaCartaoPct);
  const cartao = taxa !== null && ind ? precoNoCartao(ind.preco, taxa) : null;

  return `
    <h3>Como está o preço praticado</h3>
    ${ind ? `
      <dl class="indicadores">
        <div><dt>Preço à vista (preço-base)</dt><dd>${fmtMoeda(ind.preco)}</dd></div>
        <div><dt>Custo</dt><dd>${fmtMoeda(ind.custo)}</dd><dd class="sub">o que custa fazer 1 unidade</dd></div>
        <div><dt>Markup</dt><dd>${ind.markup === null ? '—' : pct(ind.markup)}</dd><dd class="sub">quanto se soma <strong>sobre o custo</strong>: (preço − custo) ÷ custo</dd></div>
        <div><dt>Impostos e taxas sobre a venda</dt><dd>${fmtMoeda(ind.imposto)}</dd><dd class="sub">${fmtNumero(Number(p.impostosPct) || 0)}% do preço (você informa; regime tributário ainda não definido)</dd></div>
        <div><dt>Margem de contribuição</dt><dd>${fmtMoeda(ind.contribuicao)} · ${pct(ind.contribuicaoPct)}</dd><dd class="sub">o que sobra do <strong>preço</strong> depois do custo e dos impostos, em R$ e em % do preço</dd></div>
        <div><dt>Margem de lucro</dt><dd>${fmtMoeda(ind.lucro)} · ${pct(ind.lucroPct)}</dd><dd class="sub">margem de contribuição menos os gastos gerais rateados (${fmtMoeda(ind.gastosGerais)} por unidade). ${configRateio.metodo === 'nenhum' ? 'Nenhum método de rateio foi escolhido: <a class="link" href="#/gastos">escolher em Gastos gerais</a>.' : `Método: <a class="link" href="#/gastos">${esc(METODOS[configRateio.metodo].nome)}</a>.`}</dd></div>
      </dl>
      ${ind.contribuicao < 0 ? '<p class="conferencia conferencia--alerta" role="alert"><strong>Prejuízo.</strong> O preço não cobre o custo e os impostos.</p>' : ''}`
    : '<p class="sub">Informe o preço praticado para ver markup e margens.</p>'}

    <h3>Quanto deveria cobrar <span class="sub">(são dois jeitos diferentes de pensar; preencha o que quiser testar)</span></h3>
    <div class="sugestoes">
      <div class="sugestao"><span class="rotulo-pequeno">Por markup sobre o custo</span>
        <span class="entrada"><input class="campo campo--pequeno" type="number" min="0" step="any" inputmode="decimal" value="${markup ?? ''}" placeholder="ex.: 100" data-campo="markupDesejado"><span>% sobre o custo</span></span>
        ${sugMarkup === null ? '<span class="sub">Informe o markup.</span>' : `<strong>${fmtMoeda(sugMarkup)}</strong> ${botaoUsar(sugMarkup)}<span class="sub">custo ${fmtMoeda(c.total)} × (1 + ${fmtNumero(markup)}%)</span>`}
      </div>
      <div class="sugestao"><span class="rotulo-pequeno">Por margem de contribuição desejada</span>
        <span class="entrada"><input class="campo campo--pequeno" type="number" min="0" max="99" step="any" inputmode="decimal" value="${margem ?? ''}" placeholder="ex.: 40" data-campo="margemDesejada"><span>% do preço</span></span>
        ${sugMargem === null ? `<span class="sub">${margem === null ? 'Informe a margem.' : 'Sem solução: margem mais impostos chega a 100%.'}</span>` : `<strong>${fmtMoeda(sugMargem)}</strong> ${botaoUsar(sugMargem)}<span class="sub">custo ${fmtMoeda(c.total)} ÷ (1 − ${fmtNumero(margem)}% − ${fmtNumero(Number(p.impostosPct) || 0)}% de impostos)</span>`}
      </div>
    </div>

    <h3>Preço no cartão <span class="sub">(RN-001: o preço-base é o à vista; o acréscimo só aparece no fechamento da venda)</span></h3>
    <div class="sugestao"><span class="rotulo-pequeno">Taxa da maquininha</span>
      <span class="entrada"><input class="campo campo--pequeno" type="number" min="0" max="50" step="any" inputmode="decimal" value="${taxa ?? ''}" placeholder="ex.: 3,5" data-campo="taxaCartaoPct"><span>% (informe a real)</span></span>
      ${cartao === null ? `<span class="sub">${ind ? 'Informe a taxa para simular.' : 'Informe o preço à vista.'}</span>` : `<strong>${fmtMoeda(cartao)}</strong> no cartão (acréscimo de ${fmtMoeda(cartao - ind.preco)})<span class="sub">preço à vista ÷ (1 − ${fmtNumero(taxa)}%), para a loja receber o preço-base. <strong>Hipótese [P]:</strong> a fórmula e a taxa de débito, crédito e parcelado dependem da sua maquininha.</span>`}
    </div>`;
}

function htmlFicha(p) {
  const c = custoUnitario(p);
  const preparo = p.tipo === 'preparo';
  const usos = usadoEm(p.id);
  return `
    <p><a class="link" href="#/precificacao">← Voltar para a lista de produtos</a></p>
    <article class="ficha" data-ficha="${esc(p.id)}">
      <header class="ficha__topo">
        <span class="selo">${esc(FONTES[p.fonte])}</span>
        ${p.fonte === 'uniq' ? '<span class="chip chip--aviso">confira com a ficha do UNIQ e com a sua planilha</span>' : ''}
        ${p.fonte === 'exemplo' ? '<span class="chip chip--alerta">receita inventada</span>' : ''}
      </header>
      <div class="janela__grade">
        <label class="janela__largo"><span class="rotulo-pequeno">Nome do produto</span><input class="campo" data-campo="nome" value="${esc(p.nome)}" maxlength="80" autocomplete="off"></label>
        <label><span class="rotulo-pequeno">Área</span><select class="campo" data-campo="area">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}"${p.area === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><span class="rotulo-pequeno">Tipo</span><select class="campo" data-campo="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}"${p.tipo === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <div><span class="rotulo-pequeno">Cada lote rende</span>
          <span class="janela__par"><input class="campo" type="number" min="0" step="any" inputmode="decimal" value="${esc(p.rende.qtd)}" data-campo="rendeQtd" aria-label="Rendimento do lote">
            <select class="campo" data-campo="rendeUn" aria-label="Unidade do rendimento">${Object.entries(UNIDADES_DE_RENDIMENTO).map(([k, v]) => `<option value="${k}"${p.rende.unidade === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></span></div>
        <label><span class="rotulo-pequeno">Perda no lote (%)</span><input class="campo" type="number" min="0" max="99" step="any" inputmode="decimal" value="${esc(p.perdaPct)}" data-campo="perdaPct">
          <span class="sub">queima, sobra de massa, quebra: reduz o que se consegue vender</span></label>
        <label><span class="rotulo-pequeno">Outros custos por ${p.rende.unidade === 'un' ? 'porção' : p.rende.unidade === 'g' ? 'g' : 'mL'} (R$)</span><input class="campo" type="number" min="0" step="any" inputmode="decimal" value="${esc(p.outrosCustos)}" data-campo="outrosCustos">
          <span class="sub">mão de obra, gás... à mão, por enquanto</span></label>
        <label class="janela__largo"><span class="rotulo-pequeno">Observações</span><textarea class="campo campo--area" rows="2" data-campo="obs" maxlength="500">${esc(p.obs)}</textarea></label>
      </div>

      <h2>Ingredientes</h2>
      <ul class="ings" data-linhas>${p.linhas.map((_, i) => htmlLinha(p, i, c)).join('')}</ul>
      <button type="button" class="botao botao--secundario" data-adicionar-linha>+ Ingrediente</button>

      <h2>Conta aberta: como o custo foi formado</h2>
      <div data-conta>${htmlConta(p, c)}</div>

      ${preparo ? `
        <p class="conferencia conferencia--ok">Este é um <strong>preparo</strong>: não é vendido. Seu custo entra nos produtos que o usam${usos.length ? `: ${esc(usos.map((u) => u.nome).join(', '))}` : ' (nenhum ainda)'}.</p>`
    : `<h2>Preço</h2>
      <div class="janela__grade">
        <label><span class="rotulo-pequeno">Preço praticado, à vista (R$)</span><input class="campo" type="number" min="0" step="0.01" inputmode="decimal" value="${p.preco ?? ''}" data-campo="preco">
          ${p.precoExemplo ? '<span class="sub sub--atencao">Preço de exemplo, inventado: troque pelo real.</span>' : ''}</label>
        <label><span class="rotulo-pequeno">Impostos e taxas sobre a venda (%)</span><input class="campo" type="number" min="0" max="90" step="any" inputmode="decimal" value="${esc(p.impostosPct)}" data-campo="impostosPct">
          <span class="sub">depende do regime tributário (pendência 6)</span></label>
      </div>
      <div data-preco>${htmlPrecoResultado(p, c)}</div>`}

      <div class="ficha__acoes">
        <button type="button" class="botao botao--secundario" data-duplicar>Duplicar ficha</button>
        <button type="button" class="botao botao--secundario" data-excluir>Excluir produto</button>
        <span class="sub" data-erro-ficha role="status"></span>
      </div>
      <p class="sub">A pizza vem em P, M, G e GG. Duplicar a ficha é um jeito (uma ficha por tamanho); outro seria uma ficha só com um fator por tamanho. Pense qual faz mais sentido para você.</p>
    </article>`;
}

/** Atualiza só os números (custos das linhas, conta aberta, resultados de preço), sem recriar os campos digitados. */
function atualizarNumeros(raiz, p) {
  const c = custoUnitario(p);
  raiz.querySelectorAll('[data-linha]').forEach((li) => {
    const i = Number(li.dataset.linha);
    const calc = c.linhas[i];
    li.querySelector('[data-ing-custo]').textContent = calc.semPreco ? '—' : fmtMoeda(calc.custo);
    li.querySelector('[data-ing-pct]').textContent = c.lote > 0 && !calc.semPreco ? `${pct(calc.custo / c.lote)} do lote` : '';
    li.querySelector('[data-ing-preco]').textContent = p.linhas[i].refId ? textoPrecoUso(calc.precoUso, usoDaLinha(p.linhas[i])) : '—';
  });
  raiz.querySelector('[data-conta]').innerHTML = htmlConta(p, c);
  const preco = raiz.querySelector('[data-preco]');
  if (!preco) return;
  // Os campos de markup, margem e taxa ficam dentro deste bloco: ao refazê-lo, devolve o foco ao campo que estava sendo digitado.
  const ativo = document.activeElement;
  const chave = preco.contains(ativo) ? ativo.dataset.campo : null;
  preco.innerHTML = htmlPrecoResultado(p, c);
  if (chave) preco.querySelector(`[data-campo="${chave}"]`)?.focus();
}

function montarFicha(raiz, p) {
  raiz.innerHTML = htmlFicha(p);
  atualizarNumeros(raiz, p);
}

const CAMPOS = {
  nome: (p, v) => { p.nome = v; },
  obs: (p, v) => { p.obs = v; },
  area: (p, v) => { p.area = v; },
  tipo: (p, v) => { p.tipo = v; },
  rendeQtd: (p, v) => { p.rende.qtd = numeroOuNulo(v) ?? 0; },
  rendeUn: (p, v) => { p.rende.unidade = v; },
  perdaPct: (p, v) => { p.perdaPct = numeroOuNulo(v) ?? 0; },
  outrosCustos: (p, v) => { p.outrosCustos = numeroOuNulo(v) ?? 0; },
  impostosPct: (p, v) => { p.impostosPct = numeroOuNulo(v) ?? 0; },
  preco: (p, v) => { p.preco = numeroOuNulo(v); p.precoExemplo = false; },
  markupDesejado: (p, v) => { p.markupDesejado = numeroOuNulo(v); },
  margemDesejada: (p, v) => { p.margemDesejada = numeroOuNulo(v); },
  taxaCartaoPct: (p, v) => { p.taxaCartaoPct = numeroOuNulo(v); },
};
// Campos que mudam a estrutura da ficha (listas e rótulos): a ficha é redesenhada.
const ESTRUTURAIS = new Set(['area', 'tipo', 'rendeUn']);

function ligarFicha(raiz, p) {
  const redesenhar = (foco) => {
    montarFicha(raiz, p);
    if (foco) raiz.querySelector(`[data-foco="${foco}"]`)?.focus();
  };

  raiz.addEventListener('input', (e) => {
    const campo = e.target.dataset.campo;
    if (campo && CAMPOS[campo] && !ESTRUTURAIS.has(campo) && e.target.tagName !== 'SELECT') {
      CAMPOS[campo](p, e.target.value);
      atualizarNumeros(raiz, p);
      return;
    }
    const lc = e.target.dataset.lcampo;
    if (lc === 'valor') {
      p.linhas[Number(e.target.closest('[data-linha]').dataset.linha)].valor = numeroOuNulo(e.target.value) ?? 0;
      atualizarNumeros(raiz, p);
    }
  });

  raiz.addEventListener('change', (e) => {
    const campo = e.target.dataset.campo;
    if (campo && ESTRUTURAIS.has(campo)) {
      CAMPOS[campo](p, e.target.value);
      // Mudou a unidade do rendimento: as linhas que usam este preparo em outros produtos continuam válidas (a unidade é refeita no cálculo).
      redesenhar(`campo-${campo}`);
      return;
    }
    const lc = e.target.dataset.lcampo;
    if (!lc) return;
    const i = Number(e.target.closest('[data-linha]').dataset.linha);
    const linha = p.linhas[i];
    if (lc === 'ref') {
      const [tipo, refId] = e.target.value.split(':');
      linha.tipo = tipo || 'insumo';
      linha.refId = refId ?? '';
      linha.obs = '';
      linha.un = linha.refId ? unidadesDaLinha(linha)[0].id : 'g';
      redesenhar(`ref-${i}`);
    } else if (lc === 'un') {
      linha.un = e.target.value;
      atualizarNumeros(raiz, p);
    }
  });

  raiz.addEventListener('click', (e) => {
    if (e.target.closest('[data-adicionar-linha]')) {
      p.linhas.push({ tipo: 'insumo', refId: '', valor: 0, un: 'g', obs: '' });
      redesenhar(`ref-${p.linhas.length - 1}`);
      return;
    }
    const rem = e.target.closest('[data-remover-linha]');
    if (rem) { p.linhas.splice(Number(rem.closest('[data-linha]').dataset.linha), 1); redesenhar(); return; }
    const usar = e.target.closest('[data-usar-preco]');
    if (usar) { CAMPOS.preco(p, usar.dataset.usarPreco); redesenhar(); return; }
    if (e.target.closest('[data-duplicar]')) { location.hash = `#/precificacao/${duplicarProduto(p).id}`; return; }
    if (e.target.closest('[data-excluir]')) {
      const usos = usadoEm(p.id);
      const aviso = raiz.querySelector('[data-erro-ficha]');
      if (usos.length) { aviso.textContent = `Não dá para excluir: ${usos.map((u) => u.nome).join(', ')} usa este preparo.`; return; }
      if (window.confirm(`Excluir "${p.nome}"? Isso vale só até recarregar a página.`)) { removerProduto(p.id); location.hash = '#/precificacao'; }
    }
  });
}

// ---- Entrada da tela --------------------------------------------------------------------------

export function iniciarPrecificacao(conteudo, parametro = '') {
  const raiz = conteudo.querySelector('[data-precificacao]');
  const p = parametro ? buscarProduto(parametro) : null;
  if (!p) { montarLista(raiz); return; }
  document.title = `${p.nome} · Precificação · Dom Bosco · Piloto`;
  montarFicha(raiz, p);
  ligarFicha(raiz, p);
}
